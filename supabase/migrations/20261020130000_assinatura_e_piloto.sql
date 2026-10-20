-- GereVendas Ads — Milestone 4 (Assinatura SaaS R$ 199/mês e Webhooks Idempotentes)
-- e Milestone 5 (Feedback estruturado do piloto).

create type public.subscription_status as enum (
  'trialing',
  'active',
  'past_due',
  'canceled',
  'suspended'
);

-- ---------------------------------------------------------------------------
-- 1. Assinatura SaaS por organização (separada do livro de mídia da Meta)
-- ---------------------------------------------------------------------------
create table public.subscriptions (
  organization_id uuid primary key references public.organizations (id) on delete cascade,
  status public.subscription_status not null default 'trialing',
  plan_code text not null default 'padrao_199' check (char_length(plan_code) between 2 and 40),
  amount_cents integer not null default 19900 check (amount_cents >= 0),
  currency char(3) not null default 'BRL' check (currency ~ '^[A-Z]{3}$'),
  provider text not null default 'mock' check (char_length(provider) between 2 and 40),
  simulated boolean not null default true,
  current_period_start timestamptz not null default now(),
  current_period_end timestamptz not null default (now() + interval '30 days'),
  updated_at timestamptz not null default now()
);

create trigger subscriptions_updated_at before update on public.subscriptions
  for each row execute function private.set_updated_at();

create table public.billing_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  provider text not null check (char_length(provider) between 2 and 40),
  event_id text not null check (char_length(event_id) between 1 and 128),
  event_type text not null check (event_type in (
    'subscription.activated',
    'invoice.paid',
    'invoice.payment_failed',
    'subscription.canceled'
  )),
  amount_cents integer not null default 19900 check (amount_cents >= 0),
  currency char(3) not null default 'BRL' check (currency ~ '^[A-Z]{3}$'),
  simulated boolean not null default true,
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  created_at timestamptz not null default now(),
  -- Idempotência estrita por provedor e event_id (docs/05)
  unique (provider, event_id)
);

create index billing_events_org_created_idx on public.billing_events (organization_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 2. Feedback estruturado do piloto (Milestone 5 / docs/02 Tela L)
-- ---------------------------------------------------------------------------
create table public.pilot_feedback (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  stage text not null check (stage in ('onboarding', 'strategy', 'creative', 'campaign')),
  rating text not null check (rating in ('helpful', 'needs_improvement')),
  comment text check (char_length(comment) <= 500),
  creative_id uuid,
  created_at timestamptz not null default now(),
  foreign key (creative_id, organization_id) references public.creatives (id, organization_id) on delete set null (creative_id)
);

create index pilot_feedback_org_created_idx on public.pilot_feedback (organization_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Grants e RLS
-- ---------------------------------------------------------------------------
revoke all on public.subscriptions, public.billing_events, public.pilot_feedback from anon, authenticated, public;
grant select on public.subscriptions, public.billing_events, public.pilot_feedback to authenticated;

alter table public.subscriptions enable row level security;
alter table public.billing_events enable row level security;
alter table public.pilot_feedback enable row level security;

create policy subscriptions_select on public.subscriptions
  for select to authenticated using (private.is_org_member(organization_id));

create policy billing_events_select on public.billing_events
  for select to authenticated
  using (private.has_org_role(organization_id, array['owner', 'admin']::public.member_role[]));

create policy pilot_feedback_select on public.pilot_feedback
  for select to authenticated using (private.is_org_member(organization_id));

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------

-- Processa evento de cobrança de forma idempotente por (provider, event_id).
-- Pode ser chamado via simulação de checkout pelo owner/admin ou via service_role pelo webhook.
create function public.process_billing_event(
  p_org uuid,
  p_provider text,
  p_event_id text,
  p_event_type text,
  p_amount_cents integer default 19900,
  p_simulated boolean default true,
  p_correlation_id text default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_role text := current_setting('role', true);
  v_existing uuid;
  v_new_status public.subscription_status;
begin
  -- Permite service_role (webhook assinado) ou owner/admin autenticado da organização
  if v_role <> 'service_role' then
    if v_uid is null or not private.has_org_role(p_org, array['owner', 'admin']::public.member_role[]) then
      raise exception 'forbidden' using errcode = '42501';
    end if;
  end if;

  if p_event_type not in (
    'subscription.activated',
    'invoice.paid',
    'invoice.payment_failed',
    'subscription.canceled'
  ) then
    raise exception 'invalid_event_type' using errcode = 'P0001';
  end if;

  select b.id into v_existing
  from public.billing_events b
  where b.provider = p_provider and b.event_id = p_event_id;

  if v_existing is not null then
    return jsonb_build_object('event_record_id', v_existing, 'replayed', true);
  end if;

  v_new_status := case p_event_type
    when 'subscription.activated' then 'active'::public.subscription_status
    when 'invoice.paid' then 'active'::public.subscription_status
    when 'invoice.payment_failed' then 'past_due'::public.subscription_status
    when 'subscription.canceled' then 'canceled'::public.subscription_status
  end;

  insert into public.billing_events (
    organization_id, provider, event_id, event_type, amount_cents, currency, simulated, payload
  )
  values (
    p_org, p_provider, p_event_id, p_event_type, coalesce(p_amount_cents, 19900), 'BRL',
    coalesce(p_simulated, true),
    jsonb_build_object('event_type', p_event_type, 'amount_cents', coalesce(p_amount_cents, 19900))
  )
  returning id into v_existing;

  insert into public.subscriptions (
    organization_id, status, plan_code, amount_cents, currency, provider, simulated,
    current_period_start, current_period_end
  )
  values (
    p_org, v_new_status, 'padrao_199', coalesce(p_amount_cents, 19900), 'BRL',
    p_provider, coalesce(p_simulated, true), now(), now() + interval '30 days'
  )
  on conflict (organization_id) do update set
    status = excluded.status,
    amount_cents = excluded.amount_cents,
    provider = excluded.provider,
    simulated = excluded.simulated,
    current_period_start = case when excluded.status = 'active' then now() else public.subscriptions.current_period_start end,
    current_period_end = case when excluded.status = 'active' then now() + interval '30 days' else public.subscriptions.current_period_end end;

  perform public.log_audit_event(
    p_org,
    'billing.event_processed',
    'billing_event',
    v_existing,
    p_correlation_id,
    jsonb_build_object('provider', p_provider, 'event_type', p_event_type, 'simulated', coalesce(p_simulated, true))
  );

  return jsonb_build_object('event_record_id', v_existing, 'replayed', false, 'status', v_new_status);
end;
$$;

-- Registra avaliação rápida do piloto (qualquer membro da organização).
create function public.submit_pilot_feedback(
  p_org uuid,
  p_stage text,
  p_rating text,
  p_comment text default null,
  p_creative uuid default null,
  p_correlation_id text default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_id uuid;
begin
  if v_uid is null or not private.is_org_member(p_org) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  insert into public.pilot_feedback (organization_id, user_id, stage, rating, comment, creative_id)
  values (p_org, v_uid, p_stage, p_rating, nullif(trim(coalesce(p_comment, '')), ''), p_creative)
  returning id into v_id;

  perform public.log_audit_event(
    p_org,
    'pilot.feedback_submitted',
    'pilot_feedback',
    v_id,
    p_correlation_id,
    jsonb_build_object('stage', p_stage, 'rating', p_rating)
  );
  return v_id;
end;
$$;

revoke all on function public.process_billing_event(uuid, text, text, text, integer, boolean, text) from public, anon;
revoke all on function public.submit_pilot_feedback(uuid, text, text, text, uuid, text) from public, anon;

grant execute on function public.process_billing_event(uuid, text, text, text, integer, boolean, text) to authenticated, service_role;
grant execute on function public.submit_pilot_feedback(uuid, text, text, text, uuid, text) to authenticated;
