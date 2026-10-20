-- GereVendas Ads — Milestone 3 (Campanhas e Conexão Meta Ads, ADR 0004).
-- Guardrails:
-- 1. Toda campanha nasce obrigatoriamente `paused` (nunca `active` na criação).
-- 2. Apenas `owner` autoriza verba, publica ou ativa campanha; `owner`/`admin` podem pausar.
-- 3. Operações são idempotentes por `(organization_id, idempotency_key)` e registram `simulated`.

create type public.meta_connection_status as enum (
  'disconnected',
  'connected',
  'missing_permissions',
  'token_expired'
);

create type public.campaign_status as enum ('draft', 'paused', 'active', 'ended');
create type public.meta_review_status as enum ('not_submitted', 'pending_review', 'approved', 'rejected');
create type public.publication_operation_kind as enum ('publish_paused', 'activate', 'pause');

-- ---------------------------------------------------------------------------
-- 1. Conexão Meta por organização
-- ---------------------------------------------------------------------------
create table public.meta_connections (
  organization_id uuid primary key references public.organizations (id) on delete cascade,
  status public.meta_connection_status not null default 'disconnected',
  simulated boolean not null default true,
  ad_account_id text check (char_length(ad_account_id) between 1 and 128),
  ad_account_name text check (char_length(ad_account_name) between 2 and 120),
  page_id text check (char_length(page_id) between 1 and 128),
  page_name text check (char_length(page_name) between 2 and 120),
  instagram_actor_id text check (char_length(instagram_actor_id) between 1 and 128),
  whatsapp_phone_e164 text check (whatsapp_phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  billing_verified_on_meta boolean not null default false,
  connected_by uuid references auth.users (id) on delete set null,
  connected_at timestamptz,
  updated_at timestamptz not null default now(),
  check (status = 'disconnected' or (ad_account_id is not null and page_id is not null))
);

create trigger meta_connections_updated_at before update on public.meta_connections
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------
-- 2. Campanhas e peças vinculadas
-- ---------------------------------------------------------------------------
create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  strategy_id uuid not null,
  name text not null check (char_length(name) between 3 and 120),
  objective public.brief_objective not null,
  status public.campaign_status not null default 'paused',
  meta_review_status public.meta_review_status not null default 'not_submitted',
  simulated boolean not null default true,
  daily_budget_cents integer not null check (daily_budget_cents between 1000 and 50000),
  currency char(3) not null default 'BRL' check (currency ~ '^[A-Z]{3}$'),
  duration_days smallint not null check (duration_days between 1 and 30),
  external_campaign_id text check (char_length(external_campaign_id) between 1 and 128),
  external_adset_id text check (char_length(external_adset_id) between 1 and 128),
  spend_confirmed_by uuid not null references auth.users (id) on delete restrict,
  spend_confirmed_at timestamptz not null default now(),
  activated_by uuid references auth.users (id) on delete set null,
  activated_at timestamptz,
  paused_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  foreign key (strategy_id, organization_id) references public.strategies (id, organization_id) on delete restrict,
  -- Ativação exige registro de quem ativou e quando
  check (status <> 'active' or (activated_by is not null and activated_at is not null))
);

create index campaigns_org_created_idx on public.campaigns (organization_id, created_at desc);

create trigger campaigns_updated_at before update on public.campaigns
  for each row execute function private.set_updated_at();

-- Guardrail no banco: um INSERT em campaigns NUNCA pode entrar com status = 'active'.
create function private.campaigns_enforce_paused_on_insert() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'active' then
    raise exception 'campaign_must_start_paused' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger campaigns_enforce_paused_on_insert before insert on public.campaigns
  for each row execute function private.campaigns_enforce_paused_on_insert();

create table public.campaign_creatives (
  campaign_id uuid not null,
  creative_id uuid not null,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  external_ad_id text check (char_length(external_ad_id) between 1 and 128),
  created_at timestamptz not null default now(),
  primary key (campaign_id, creative_id),
  foreign key (campaign_id, organization_id) references public.campaigns (id, organization_id) on delete cascade,
  foreign key (creative_id, organization_id) references public.creatives (id, organization_id) on delete restrict
);

create table public.publication_operations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  campaign_id uuid not null,
  operation public.publication_operation_kind not null,
  idempotency_key text not null check (char_length(idempotency_key) between 8 and 64),
  simulated boolean not null default true,
  actor_user_id uuid not null references auth.users (id) on delete restrict,
  snapshot jsonb not null default '{}'::jsonb check (jsonb_typeof(snapshot) = 'object'),
  created_at timestamptz not null default now(),
  unique (organization_id, idempotency_key),
  foreign key (campaign_id, organization_id) references public.campaigns (id, organization_id) on delete cascade
);

-- ---------------------------------------------------------------------------
-- Grants e RLS (somente leitura direta; escrita sempre por RPCs auditadas)
-- ---------------------------------------------------------------------------
revoke all on public.meta_connections, public.campaigns, public.campaign_creatives, public.publication_operations
  from anon, authenticated, public;

grant select on public.meta_connections, public.campaigns, public.campaign_creatives, public.publication_operations
  to authenticated;

alter table public.meta_connections enable row level security;
alter table public.campaigns enable row level security;
alter table public.campaign_creatives enable row level security;
alter table public.publication_operations enable row level security;

create policy meta_connections_select on public.meta_connections
  for select to authenticated using (private.is_org_member(organization_id));

create policy campaigns_select on public.campaigns
  for select to authenticated using (private.is_org_member(organization_id));

create policy campaign_creatives_select on public.campaign_creatives
  for select to authenticated using (private.is_org_member(organization_id));

create policy publication_operations_select on public.publication_operations
  for select to authenticated using (private.is_org_member(organization_id));

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------

-- Conecta ou atualiza ativos Meta da organização (apenas owner/admin).
create function public.upsert_meta_connection(
  p_org uuid,
  p_ad_account_id text,
  p_ad_account_name text,
  p_page_id text,
  p_page_name text,
  p_instagram_actor_id text default null,
  p_whatsapp_phone_e164 text default null,
  p_billing_verified boolean default false,
  p_simulated boolean default true,
  p_correlation_id text default null
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null or not private.has_org_role(p_org, array['owner', 'admin']::public.member_role[]) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  insert into public.meta_connections (
    organization_id, status, simulated, ad_account_id, ad_account_name,
    page_id, page_name, instagram_actor_id, whatsapp_phone_e164,
    billing_verified_on_meta, connected_by, connected_at
  )
  values (
    p_org, 'connected', coalesce(p_simulated, true), p_ad_account_id, p_ad_account_name,
    p_page_id, p_page_name, p_instagram_actor_id, p_whatsapp_phone_e164,
    coalesce(p_billing_verified, false), v_uid, now()
  )
  on conflict (organization_id) do update set
    status = 'connected',
    simulated = excluded.simulated,
    ad_account_id = excluded.ad_account_id,
    ad_account_name = excluded.ad_account_name,
    page_id = excluded.page_id,
    page_name = excluded.page_name,
    instagram_actor_id = excluded.instagram_actor_id,
    whatsapp_phone_e164 = excluded.whatsapp_phone_e164,
    billing_verified_on_meta = excluded.billing_verified_on_meta,
    connected_by = v_uid,
    connected_at = now();

  perform public.log_audit_event(
    p_org,
    'meta.connection_updated',
    'meta_connection',
    p_org,
    p_correlation_id,
    jsonb_build_object('simulated', coalesce(p_simulated, true), 'ad_account_id', p_ad_account_id)
  );
end;
$$;

-- Desconecta ativos Meta da organização (apenas owner/admin).
create function public.disconnect_meta_connection(
  p_org uuid,
  p_correlation_id text default null
) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or not private.has_org_role(p_org, array['owner', 'admin']::public.member_role[]) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  update public.meta_connections
     set status = 'disconnected',
         ad_account_id = null,
         ad_account_name = null,
         page_id = null,
         page_name = null,
         instagram_actor_id = null,
         whatsapp_phone_e164 = null,
         billing_verified_on_meta = false
   where organization_id = p_org;

  perform public.log_audit_event(p_org, 'meta.connection_disconnected', 'meta_connection', p_org, p_correlation_id, '{}'::jsonb);
end;
$$;

-- Publica campanha SEMPRE PAUSED. Exige papel `owner`, conexão Meta ativa e todas as peças aprovadas.
create function public.publish_campaign_paused(
  p_org uuid,
  p_strategy uuid,
  p_name text,
  p_objective public.brief_objective,
  p_daily_budget_cents integer,
  p_duration_days integer,
  p_creative_ids uuid[],
  p_idempotency_key text,
  p_external_campaign_id text,
  p_external_adset_id text,
  p_simulated boolean default true,
  p_correlation_id text default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_existing_campaign uuid;
  v_conn public.meta_connections%rowtype;
  v_approved_count integer;
  v_campaign_id uuid;
  v_cid uuid;
begin
  -- Guardrail: apenas owner autoriza orçamento e publica campanha
  if v_uid is null or not private.has_org_role(p_org, array['owner']::public.member_role[]) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  -- Idempotência: se a operação já existe, devolve a campanha existente sem duplicar
  select op.campaign_id into v_existing_campaign
  from public.publication_operations op
  where op.organization_id = p_org and op.idempotency_key = p_idempotency_key;
  if v_existing_campaign is not null then
    return jsonb_build_object('campaign_id', v_existing_campaign, 'replayed', true);
  end if;

  -- Exige conexão Meta conectada
  select * into v_conn from public.meta_connections m where m.organization_id = p_org;
  if v_conn.organization_id is null or v_conn.status <> 'connected' then
    raise exception 'meta_not_connected' using errcode = 'P0001';
  end if;

  if coalesce(cardinality(p_creative_ids), 0) < 1 then
    raise exception 'no_creatives_selected' using errcode = 'P0001';
  end if;

  -- Todas as peças selecionadas devem pertencer à estratégia/organização e estar `approved`
  select count(*) into v_approved_count
  from public.creatives c
  where c.organization_id = p_org
    and c.strategy_id = p_strategy
    and c.status = 'approved'
    and c.id = any (p_creative_ids);

  if v_approved_count <> cardinality(p_creative_ids) then
    raise exception 'creatives_not_approved' using errcode = 'P0001';
  end if;

  insert into public.campaigns (
    organization_id, strategy_id, name, objective, status, meta_review_status,
    simulated, daily_budget_cents, currency, duration_days,
    external_campaign_id, external_adset_id, spend_confirmed_by, spend_confirmed_at, paused_at
  )
  values (
    p_org, p_strategy, trim(p_name), p_objective, 'paused', 'pending_review',
    coalesce(p_simulated, true), p_daily_budget_cents, 'BRL', p_duration_days,
    p_external_campaign_id, p_external_adset_id, v_uid, now(), now()
  )
  returning id into v_campaign_id;

  foreach v_cid in array p_creative_ids loop
    insert into public.campaign_creatives (campaign_id, creative_id, organization_id, external_ad_id)
    values (v_campaign_id, v_cid, p_org, 'ad_' || substr(v_cid::text, 1, 8));
  end loop;

  insert into public.publication_operations (
    organization_id, campaign_id, operation, idempotency_key, simulated, actor_user_id, snapshot
  )
  values (
    p_org, v_campaign_id, 'publish_paused', p_idempotency_key, coalesce(p_simulated, true), v_uid,
    jsonb_build_object(
      'daily_budget_cents', p_daily_budget_cents,
      'duration_days', p_duration_days,
      'creative_ids', to_jsonb(p_creative_ids)
    )
  );

  perform public.log_audit_event(
    p_org,
    'campaigns.published_paused',
    'campaign',
    v_campaign_id,
    p_correlation_id,
    jsonb_build_object(
      'simulated', coalesce(p_simulated, true),
      'daily_budget_cents', p_daily_budget_cents,
      'duration_days', p_duration_days
    )
  );

  return jsonb_build_object('campaign_id', v_campaign_id, 'replayed', false);
end;
$$;

-- Segunda confirmação humana contextual do `owner`: ativa campanha que estava `paused`, conferindo o orçamento.
create function public.activate_campaign(
  p_campaign uuid,
  p_confirmed_daily_budget_cents integer,
  p_confirmed_duration_days integer,
  p_idempotency_key text,
  p_correlation_id text default null
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_camp public.campaigns%rowtype;
begin
  select * into v_camp from public.campaigns c where c.id = p_campaign for update;
  if v_uid is null or v_camp.id is null or not private.has_org_role(v_camp.organization_id, array['owner']::public.member_role[]) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if exists (
    select 1 from public.publication_operations op
    where op.organization_id = v_camp.organization_id and op.idempotency_key = p_idempotency_key
  ) then
    return;
  end if;

  if v_camp.status <> 'paused' then
    raise exception 'campaign_not_paused' using errcode = 'P0001';
  end if;

  -- Verifica se o snapshot de orçamento confirmado bate com a campanha
  if v_camp.daily_budget_cents <> p_confirmed_daily_budget_cents
     or v_camp.duration_days <> p_confirmed_duration_days then
    raise exception 'budget_snapshot_mismatch' using errcode = 'P0001';
  end if;

  update public.campaigns
     set status = 'active',
         meta_review_status = 'approved',
         activated_by = v_uid,
         activated_at = now(),
         paused_at = null
   where id = p_campaign;

  insert into public.publication_operations (
    organization_id, campaign_id, operation, idempotency_key, simulated, actor_user_id, snapshot
  )
  values (
    v_camp.organization_id, p_campaign, 'activate', p_idempotency_key, v_camp.simulated, v_uid,
    jsonb_build_object(
      'confirmed_daily_budget_cents', p_confirmed_daily_budget_cents,
      'confirmed_duration_days', p_confirmed_duration_days
    )
  );

  perform public.log_audit_event(
    v_camp.organization_id,
    'campaigns.activated',
    'campaign',
    p_campaign,
    p_correlation_id,
    jsonb_build_object(
      'simulated', v_camp.simulated,
      'daily_budget_cents', v_camp.daily_budget_cents,
      'duration_days', v_camp.duration_days
    )
  );
end;
$$;

-- Pausa uma campanha ativa (`owner` ou `admin`).
create function public.pause_campaign(
  p_campaign uuid,
  p_correlation_id text default null
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_camp public.campaigns%rowtype;
begin
  select * into v_camp from public.campaigns c where c.id = p_campaign for update;
  if v_uid is null or v_camp.id is null or not private.has_org_role(v_camp.organization_id, array['owner', 'admin']::public.member_role[]) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  update public.campaigns
     set status = 'paused',
         paused_at = now()
   where id = p_campaign and status = 'active';

  perform public.log_audit_event(
    v_camp.organization_id,
    'campaigns.paused',
    'campaign',
    p_campaign,
    p_correlation_id,
    '{}'::jsonb
  );
end;
$$;

revoke all on function public.upsert_meta_connection(uuid, text, text, text, text, text, text, boolean, boolean, text) from public, anon;
revoke all on function public.disconnect_meta_connection(uuid, text) from public, anon;
revoke all on function public.publish_campaign_paused(uuid, uuid, text, public.brief_objective, integer, integer, uuid[], text, text, text, boolean, text) from public, anon;
revoke all on function public.activate_campaign(uuid, integer, integer, text, text) from public, anon;
revoke all on function public.pause_campaign(uuid, text) from public, anon;

grant execute on function public.upsert_meta_connection(uuid, text, text, text, text, text, text, boolean, boolean, text) to authenticated;
grant execute on function public.disconnect_meta_connection(uuid, text) to authenticated;
grant execute on function public.publish_campaign_paused(uuid, uuid, text, public.brief_objective, integer, integer, uuid[], text, text, text, boolean, text) to authenticated;
grant execute on function public.activate_campaign(uuid, integer, integer, text, text) to authenticated;
grant execute on function public.pause_campaign(uuid, text) to authenticated;
