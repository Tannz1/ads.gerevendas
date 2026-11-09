-- GereVendas Ads — Saldo de verba de mídia (ADR 0009), ativação pelo operador na conta
-- compartilhada e sincronização automática de contatos (Facebook, Instagram e WhatsApp).

-- ---------------------------------------------------------------------------
-- 1. Auxiliar de operador por user_id (para RPCs de service_role)
-- ---------------------------------------------------------------------------
create function private.is_platform_operator_user(p_user uuid) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from private.platform_operators o where o.user_id = p_user)
$$;
revoke all on function private.is_platform_operator_user(uuid) from public;

-- ---------------------------------------------------------------------------
-- 2. Carteira de verba de mídia por organização e financiamento de campanha
-- ---------------------------------------------------------------------------
create table public.media_wallets (
  organization_id uuid primary key references public.organizations (id) on delete cascade,
  balance_cents integer not null default 0 check (balance_cents >= 0),
  reserved_cents integer not null default 0 check (reserved_cents >= 0),
  currency char(3) not null default 'BRL' check (currency ~ '^[A-Z]{3}$'),
  updated_at timestamptz not null default now()
);

create trigger media_wallets_updated_at before update on public.media_wallets
  for each row execute function private.set_updated_at();

create table public.media_wallet_entries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  campaign_id uuid,
  kind text not null check (kind in ('topup_confirmed', 'campaign_reserved', 'campaign_released')),
  amount_cents integer not null check (amount_cents between 100 and 100000000),
  currency char(3) not null default 'BRL' check (currency ~ '^[A-Z]{3}$'),
  provider text not null default 'mock' check (char_length(provider) between 2 and 40),
  external_reference text not null check (char_length(external_reference) between 4 and 128),
  simulated boolean not null default true,
  actor_user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (organization_id, external_reference),
  foreign key (campaign_id, organization_id) references public.campaigns (id, organization_id) on delete set null (campaign_id)
);

create index media_wallet_entries_org_created_idx on public.media_wallet_entries (organization_id, created_at desc);

alter table public.campaigns
  add column media_funding_status text not null default 'not_required'
    check (media_funding_status in ('not_required', 'awaiting_funds', 'funded')),
  add column funded_amount_cents integer not null default 0 check (funded_amount_cents >= 0);

revoke all on public.media_wallets, public.media_wallet_entries from anon, authenticated, public;
grant select on public.media_wallets, public.media_wallet_entries to authenticated;

alter table public.media_wallets enable row level security;
alter table public.media_wallet_entries enable row level security;

create policy media_wallets_select on public.media_wallets
  for select to authenticated
  using (private.is_org_member(organization_id) or private.is_platform_operator());

create policy media_wallet_entries_select on public.media_wallet_entries
  for select to authenticated
  using (
    private.has_org_role(organization_id, array['owner', 'admin']::public.member_role[])
    or private.is_platform_operator()
  );

-- Reserva saldo da carteira para uma campanha que aguarda verba, se houver saldo suficiente.
create function private.try_auto_fund_campaign(
  p_campaign uuid,
  p_actor uuid,
  p_correlation_id text default null
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_camp public.campaigns%rowtype;
  v_wallet public.media_wallets%rowtype;
  v_needed integer;
  v_ref text;
begin
  select * into v_camp from public.campaigns c where c.id = p_campaign for update;
  if v_camp.id is null or v_camp.media_funding_status <> 'awaiting_funds' then
    return v_camp.media_funding_status = 'funded';
  end if;

  v_needed := v_camp.daily_budget_cents * v_camp.duration_days;
  v_ref := 'camp_fund_' || p_campaign::text;

  insert into public.media_wallets (organization_id, balance_cents, reserved_cents)
  values (v_camp.organization_id, 0, 0)
  on conflict (organization_id) do nothing;

  select * into v_wallet
    from public.media_wallets w
   where w.organization_id = v_camp.organization_id
     for update;

  if coalesce(v_wallet.balance_cents, 0) < v_needed then
    return false;
  end if;

  update public.media_wallets
     set balance_cents = balance_cents - v_needed,
         reserved_cents = reserved_cents + v_needed
   where organization_id = v_camp.organization_id;

  insert into public.media_wallet_entries (
    organization_id, campaign_id, kind, amount_cents, currency, provider, external_reference, simulated, actor_user_id
  ) values (
    v_camp.organization_id, p_campaign, 'campaign_reserved', v_needed, v_camp.currency,
    'wallet', v_ref, v_camp.simulated, p_actor
  )
  on conflict (organization_id, external_reference) do nothing;

  update public.campaigns
     set media_funding_status = 'funded',
         funded_amount_cents = v_needed
   where id = p_campaign;

  perform private.campaign_audit(
    v_camp.organization_id,
    coalesce(p_actor, v_camp.spend_confirmed_by),
    'campaigns.media_funded',
    p_campaign,
    p_correlation_id,
    jsonb_build_object('amount_cents', v_needed, 'simulated', v_camp.simulated)
  );

  return true;
end;
$$;
revoke all on function private.try_auto_fund_campaign(uuid, uuid, text) from public;

-- Adiciona saldo de verba de mídia (idempotente por organization_id + external_reference) e
-- financia automaticamente campanhas da empresa que estavam aguardando saldo.
create function public.add_media_balance(
  p_org uuid,
  p_amount_cents integer,
  p_provider text,
  p_external_reference text,
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
  v_sim boolean := coalesce(p_simulated, true);
  v_existing uuid;
  v_wallet public.media_wallets%rowtype;
  v_pending record;
  v_funded integer := 0;
begin
  -- Guardrail: saldo real só entra por webhook assinado (service_role) ou operador da plataforma.
  -- Owner/admin da organização só podem simular recarga quando p_simulated = true.
  if v_role <> 'service_role' and not private.is_platform_operator() then
    if not v_sim or v_uid is null or not private.has_org_role(p_org, array['owner', 'admin']::public.member_role[]) then
      raise exception 'forbidden' using errcode = '42501';
    end if;
  end if;

  if p_amount_cents is null or p_amount_cents < 100 or p_amount_cents > 100000000 then
    raise exception 'invalid_amount' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('media_wallet:' || p_org::text, 0));

  select e.id into v_existing
    from public.media_wallet_entries e
   where e.organization_id = p_org and e.external_reference = trim(p_external_reference);

  if v_existing is not null then
    select * into v_wallet from public.media_wallets w where w.organization_id = p_org;
    return jsonb_build_object(
      'replayed', true,
      'entry_id', v_existing,
      'balance_cents', coalesce(v_wallet.balance_cents, 0),
      'reserved_cents', coalesce(v_wallet.reserved_cents, 0),
      'funded_campaigns', 0
    );
  end if;

  insert into public.media_wallet_entries (
    organization_id, kind, amount_cents, currency, provider, external_reference, simulated, actor_user_id
  ) values (
    p_org, 'topup_confirmed', p_amount_cents, 'BRL', trim(p_provider), trim(p_external_reference), v_sim, v_uid
  )
  returning id into v_existing;

  insert into public.media_wallets (organization_id, balance_cents, reserved_cents, currency)
  values (p_org, p_amount_cents, 0, 'BRL')
  on conflict (organization_id) do update
    set balance_cents = public.media_wallets.balance_cents + excluded.balance_cents
  returning * into v_wallet;

  insert into public.audit_events (organization_id, actor_user_id, action, entity_type, entity_id, correlation_id, metadata)
  values (
    p_org,
    v_uid,
    'media_wallet.topup_confirmed',
    'media_wallet_entry',
    v_existing,
    left(p_correlation_id, 64),
    jsonb_build_object('amount_cents', p_amount_cents, 'provider', trim(p_provider), 'simulated', v_sim)
  );

  -- Financia automaticamente campanhas que aguardavam verba (mais antigas primeiro).
  for v_pending in
    select c.id
      from public.campaigns c
     where c.organization_id = p_org
       and c.media_funding_status = 'awaiting_funds'
       and c.status in ('draft', 'paused')
     order by c.created_at asc
  loop
    if private.try_auto_fund_campaign(v_pending.id, v_uid, p_correlation_id) then
      v_funded := v_funded + 1;
    end if;
  end loop;

  select * into v_wallet from public.media_wallets w where w.organization_id = p_org;
  return jsonb_build_object(
    'replayed', false,
    'entry_id', v_existing,
    'balance_cents', coalesce(v_wallet.balance_cents, 0),
    'reserved_cents', coalesce(v_wallet.reserved_cents, 0),
    'funded_campaigns', v_funded
  );
end;
$$;

-- Reserva saldo existente da carteira para uma campanha específica.
create function public.fund_campaign_from_wallet(
  p_campaign uuid,
  p_correlation_id text default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_camp public.campaigns%rowtype;
begin
  select * into v_camp from public.campaigns c where c.id = p_campaign;
  if v_uid is null or v_camp.id is null or not (
    private.is_platform_operator()
    or private.has_org_role(v_camp.organization_id, array['owner', 'admin']::public.member_role[])
  ) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if v_camp.media_funding_status = 'funded' then
    return jsonb_build_object('funded', true, 'replayed', true, 'amount_cents', v_camp.funded_amount_cents);
  end if;
  if v_camp.media_funding_status = 'not_required' then
    return jsonb_build_object('funded', true, 'replayed', true, 'amount_cents', 0);
  end if;

  if not private.try_auto_fund_campaign(p_campaign, v_uid, p_correlation_id) then
    raise exception 'insufficient_media_balance' using errcode = 'P0001';
  end if;

  return jsonb_build_object(
    'funded', true,
    'replayed', false,
    'amount_cents', v_camp.daily_budget_cents * v_camp.duration_days
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Publicação e ativação integradas com saldo na conta compartilhada
-- ---------------------------------------------------------------------------
create or replace function public.start_real_publication(
  p_org uuid,
  p_strategy uuid,
  p_name text,
  p_objective public.brief_objective,
  p_daily_budget_cents integer,
  p_duration_days integer,
  p_creative_ids uuid[],
  p_idempotency_key text,
  p_correlation_id text default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_existing uuid;
  v_conn public.meta_connections%rowtype;
  v_approved integer;
  v_campaign_id uuid;
  v_cid uuid;
  v_funding_status text;
begin
  if v_uid is null or not private.has_org_role(p_org, array['owner']::public.member_role[]) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('campaign_publication:' || p_org::text, 0));

  select op.campaign_id into v_existing
    from public.publication_operations op
   where op.organization_id = p_org and op.idempotency_key = p_idempotency_key;
  if v_existing is not null then
    if not exists (select 1 from public.publication_operations op where op.organization_id = p_org and op.idempotency_key = p_idempotency_key and op.operation = 'publish_paused' and op.simulated = false) then
      raise exception 'idempotency_conflict';
    end if;
    return jsonb_build_object('campaign_id', v_existing, 'replayed', true);
  end if;

  select * into v_conn from public.meta_connections m where m.organization_id = p_org;
  if v_conn.organization_id is null or v_conn.status <> 'connected' then
    raise exception 'meta_not_connected' using errcode = 'P0001';
  end if;
  if v_conn.simulated then
    raise exception 'meta_connection_simulated' using errcode = 'P0001';
  end if;

  if coalesce(cardinality(p_creative_ids), 0) < 1 then
    raise exception 'no_creatives_selected' using errcode = 'P0001';
  end if;
  select count(*) into v_approved
    from public.creatives c
   where c.organization_id = p_org and c.strategy_id = p_strategy and c.status = 'approved'
     and c.id = any (p_creative_ids);
  if v_approved <> cardinality(p_creative_ids) then
    raise exception 'creatives_not_approved' using errcode = 'P0001';
  end if;

  v_funding_status := case when v_conn.shared_account then 'awaiting_funds' else 'not_required' end;

  insert into public.campaigns (
    organization_id, strategy_id, name, objective, status, meta_review_status,
    simulated, daily_budget_cents, currency, duration_days, spend_confirmed_by, spend_confirmed_at,
    media_funding_status
  ) values (
    p_org, p_strategy, trim(p_name), p_objective, 'draft', 'not_submitted',
    false, p_daily_budget_cents, 'BRL', p_duration_days, v_uid, now(),
    v_funding_status
  )
  returning id into v_campaign_id;

  foreach v_cid in array p_creative_ids loop
    insert into public.campaign_creatives (campaign_id, creative_id, organization_id)
    values (v_campaign_id, v_cid, p_org);
  end loop;

  insert into public.publication_operations (
    organization_id, campaign_id, operation, idempotency_key, simulated, actor_user_id, snapshot
  ) values (
    p_org, v_campaign_id, 'publish_paused', p_idempotency_key, false, v_uid,
    jsonb_build_object('daily_budget_cents', p_daily_budget_cents, 'duration_days', p_duration_days,
                       'creative_ids', to_jsonb(p_creative_ids), 'ad_account_id', v_conn.ad_account_id,
                       'page_id', v_conn.page_id)
  );

  perform private.campaign_audit(p_org, v_uid, 'campaigns.publication_started', v_campaign_id, p_correlation_id,
    jsonb_build_object('daily_budget_cents', p_daily_budget_cents, 'duration_days', p_duration_days));

  if v_conn.shared_account then
    perform private.try_auto_fund_campaign(v_campaign_id, v_uid, p_correlation_id);
  end if;

  return jsonb_build_object('campaign_id', v_campaign_id, 'replayed', false);
end;
$$;

create or replace function public.publish_campaign_paused(
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
  v_funding_status text;
begin
  -- p_simulated é ignorado: este RPC só cria campanha simulada. A real usa start_real_publication.
  if v_uid is null or not private.has_org_role(p_org, array['owner']::public.member_role[]) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('campaign_publication:' || p_org::text, 0));

  select op.campaign_id into v_existing_campaign
  from public.publication_operations op
  where op.organization_id = p_org and op.idempotency_key = p_idempotency_key;
  if v_existing_campaign is not null then
    if not exists (select 1 from public.publication_operations op where op.organization_id = p_org and op.idempotency_key = p_idempotency_key and op.operation = 'publish_paused' and op.simulated = true) then
      raise exception 'idempotency_conflict';
    end if;
    return jsonb_build_object('campaign_id', v_existing_campaign, 'replayed', true);
  end if;

  select * into v_conn from public.meta_connections m where m.organization_id = p_org;
  if v_conn.organization_id is null or v_conn.status <> 'connected' then
    raise exception 'meta_not_connected' using errcode = 'P0001';
  end if;

  if coalesce(cardinality(p_creative_ids), 0) < 1 then
    raise exception 'no_creatives_selected' using errcode = 'P0001';
  end if;

  select count(*) into v_approved_count
  from public.creatives c
  where c.organization_id = p_org and c.strategy_id = p_strategy and c.status = 'approved'
    and c.id = any (p_creative_ids);
  if v_approved_count <> cardinality(p_creative_ids) then
    raise exception 'creatives_not_approved' using errcode = 'P0001';
  end if;

  v_funding_status := case when v_conn.shared_account then 'awaiting_funds' else 'not_required' end;

  insert into public.campaigns (
    organization_id, strategy_id, name, objective, status, meta_review_status,
    simulated, daily_budget_cents, currency, duration_days,
    external_campaign_id, external_adset_id, spend_confirmed_by, spend_confirmed_at, paused_at,
    media_funding_status
  )
  values (
    p_org, p_strategy, trim(p_name), p_objective, 'paused', 'pending_review',
    true, p_daily_budget_cents, 'BRL', p_duration_days,
    p_external_campaign_id, p_external_adset_id, v_uid, now(), now(),
    v_funding_status
  )
  returning id into v_campaign_id;

  foreach v_cid in array p_creative_ids loop
    insert into public.campaign_creatives (campaign_id, creative_id, organization_id, external_ad_id)
    values (v_campaign_id, v_cid, p_org, 'sim_ad_' || substr(v_cid::text, 1, 8));
  end loop;

  insert into public.publication_operations (
    organization_id, campaign_id, operation, idempotency_key, simulated, actor_user_id, snapshot
  )
  values (
    p_org, v_campaign_id, 'publish_paused', p_idempotency_key, true, v_uid,
    jsonb_build_object('daily_budget_cents', p_daily_budget_cents, 'duration_days', p_duration_days,
                       'creative_ids', to_jsonb(p_creative_ids))
  );

  perform public.log_audit_event(p_org, 'campaigns.published_paused', 'campaign', v_campaign_id, p_correlation_id,
    jsonb_build_object('simulated', true, 'daily_budget_cents', p_daily_budget_cents, 'duration_days', p_duration_days));

  if v_conn.shared_account then
    perform private.try_auto_fund_campaign(v_campaign_id, v_uid, p_correlation_id);
  end if;

  return jsonb_build_object('campaign_id', v_campaign_id, 'replayed', false);
end;
$$;

create or replace function public.activate_campaign(
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
  if v_uid is null or v_camp.id is null or not (
    private.has_org_role(v_camp.organization_id, array['owner']::public.member_role[])
    or private.is_platform_operator()
  ) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if not v_camp.simulated then
    raise exception 'real_campaign_requires_server' using errcode = 'P0001';
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
  if v_camp.daily_budget_cents <> p_confirmed_daily_budget_cents
     or v_camp.duration_days <> p_confirmed_duration_days then
    raise exception 'budget_snapshot_mismatch' using errcode = 'P0001';
  end if;

  -- Na conta compartilhada, se ainda aguarda verba, tenta reservar da carteira antes de ativar.
  if v_camp.media_funding_status = 'awaiting_funds' then
    if not private.try_auto_fund_campaign(p_campaign, v_uid, p_correlation_id) then
      raise exception 'media_funding_required' using errcode = 'P0001';
    end if;
  end if;

  update public.campaigns
     set status = 'active', activated_by = v_uid, activated_at = now(), paused_at = null
   where id = p_campaign;

  insert into public.publication_operations (
    organization_id, campaign_id, operation, idempotency_key, simulated, actor_user_id, snapshot
  )
  values (
    v_camp.organization_id, p_campaign, 'activate', p_idempotency_key, v_camp.simulated, v_uid,
    jsonb_build_object('confirmed_daily_budget_cents', p_confirmed_daily_budget_cents,
                       'confirmed_duration_days', p_confirmed_duration_days)
  );

  perform private.campaign_audit(v_camp.organization_id, v_uid, 'campaigns.activated', p_campaign, p_correlation_id,
    jsonb_build_object('simulated', v_camp.simulated, 'daily_budget_cents', v_camp.daily_budget_cents,
                       'duration_days', v_camp.duration_days));
end;
$$;

create or replace function public.meta_check_activation(
  p_campaign uuid,
  p_actor uuid,
  p_budget integer,
  p_days integer,
  p_key text
) returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_camp public.campaigns%rowtype;
  v_conn public.meta_connections%rowtype;
begin
  select * into v_camp from public.campaigns where id = p_campaign and not simulated;
  if v_camp.id is null or not (
    private.is_member_with_role(v_camp.organization_id, p_actor, array['owner']::public.member_role[])
    or private.is_platform_operator_user(p_actor)
  ) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v_camp.status <> 'paused' then raise exception 'campaign_not_paused'; end if;
  if v_camp.daily_budget_cents <> p_budget or v_camp.duration_days <> p_days then raise exception 'budget_snapshot_mismatch'; end if;
  if exists (select 1 from public.publication_operations where organization_id = v_camp.organization_id and idempotency_key = p_key) then
    raise exception 'idempotency_conflict';
  end if;

  select c.* into v_conn from public.meta_connections c
  join public.publication_operations op on op.campaign_id = p_campaign and op.operation = 'publish_paused'
  where c.organization_id = v_camp.organization_id and c.status = 'connected' and not c.simulated
    and c.ad_account_id = op.snapshot ->> 'ad_account_id' and c.page_id = op.snapshot ->> 'page_id';
  if v_conn.ad_account_id is null then raise exception 'meta_not_connected'; end if;

  if v_conn.shared_account then
    if v_camp.media_funding_status = 'awaiting_funds' then
      perform private.try_auto_fund_campaign(p_campaign, p_actor, null);
      select * into v_camp from public.campaigns where id = p_campaign;
    end if;
    if v_camp.media_funding_status <> 'funded' or v_camp.funded_amount_cents < (p_budget * p_days) then
      raise exception 'media_funding_required' using errcode = 'P0001';
    end if;
  end if;

  return v_conn.ad_account_id;
end;
$$;

create or replace function public.meta_activate_campaign(
  p_campaign uuid,
  p_actor uuid,
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
  v_camp public.campaigns%rowtype;
  v_shared boolean;
begin
  select * into v_camp from public.campaigns c where c.id = p_campaign and not c.simulated for update;
  if v_camp.id is null or not (
    private.is_member_with_role(v_camp.organization_id, p_actor, array['owner']::public.member_role[])
    or private.is_platform_operator_user(p_actor)
  ) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if exists (select 1 from public.publication_operations op
              where op.organization_id = v_camp.organization_id and op.idempotency_key = p_idempotency_key) then
    return;
  end if;
  if v_camp.status <> 'paused' then
    raise exception 'campaign_not_paused' using errcode = 'P0001';
  end if;
  if v_camp.daily_budget_cents <> p_confirmed_daily_budget_cents
     or v_camp.duration_days <> p_confirmed_duration_days then
    raise exception 'budget_snapshot_mismatch' using errcode = 'P0001';
  end if;

  select coalesce(m.shared_account, false) into v_shared
    from public.meta_connections m
   where m.organization_id = v_camp.organization_id;

  if v_shared and (v_camp.media_funding_status <> 'funded' or v_camp.funded_amount_cents < (p_confirmed_daily_budget_cents * p_confirmed_duration_days)) then
    raise exception 'media_funding_required' using errcode = 'P0001';
  end if;

  update public.campaigns
     set status = 'active', activated_by = p_actor, activated_at = now(), paused_at = null
   where id = p_campaign;

  insert into public.publication_operations (
    organization_id, campaign_id, operation, idempotency_key, simulated, actor_user_id, snapshot
  ) values (
    v_camp.organization_id, p_campaign, 'activate', p_idempotency_key, false, p_actor,
    jsonb_build_object('confirmed_daily_budget_cents', p_confirmed_daily_budget_cents,
                       'confirmed_duration_days', p_confirmed_duration_days)
  );

  perform private.campaign_audit(v_camp.organization_id, p_actor, 'campaigns.activated', p_campaign, p_correlation_id,
    jsonb_build_object('simulated', false, 'daily_budget_cents', v_camp.daily_budget_cents,
                       'duration_days', v_camp.duration_days));
end;
$$;

-- Também permite que o operador da plataforma pause campanhas reais em caso de emergência.
create or replace function public.meta_pause_campaign(p_campaign uuid, p_actor uuid, p_correlation_id text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_camp public.campaigns%rowtype;
begin
  select * into v_camp from public.campaigns c where c.id = p_campaign and not c.simulated for update;
  if v_camp.id is null or not (
    private.is_member_with_role(v_camp.organization_id, p_actor, array['owner', 'admin']::public.member_role[])
    or private.is_platform_operator_user(p_actor)
  ) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  update public.campaigns set status = 'paused', paused_at = now() where id = p_campaign and status = 'active';
  perform private.campaign_audit(v_camp.organization_id, p_actor, 'campaigns.paused', p_campaign, p_correlation_id, '{}'::jsonb);
end;
$$;

-- Painel do operador: lista campanhas de clientes na conta compartilhada para conferência de saldo e ativação.
create function public.operator_shared_campaigns(p_simulated boolean) returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if (select auth.uid()) is null or not private.is_platform_operator() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(row_to_json(q)), '[]'::jsonb)
    into v_result
    from (
      select c.id,
             c.organization_id,
             o.name as organization_name,
             c.name,
             c.status,
             c.meta_review_status,
             c.simulated,
             c.daily_budget_cents,
             c.duration_days,
             c.currency,
             c.media_funding_status,
             c.funded_amount_cents,
             coalesce(w.balance_cents, 0) as wallet_balance_cents,
             c.created_at,
             c.activated_at
        from public.campaigns c
        join public.organizations o on o.id = c.organization_id
        join public.meta_connections m on m.organization_id = c.organization_id
        left join public.media_wallets w on w.organization_id = c.organization_id
       where m.shared_account = true
         and c.simulated = coalesce(p_simulated, true)
       order by
         case when c.status = 'paused' and c.media_funding_status = 'funded' then 0
              when c.status = 'paused' then 1
              when c.status = 'active' then 2
              else 3 end,
         c.created_at desc
       limit 100
    ) q;

  return v_result;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Configuração e sincronização automática de Facebook, Instagram e WhatsApp
-- ---------------------------------------------------------------------------
create or replace function public.meta_set_page(
  p_org uuid,
  p_status public.meta_step_status,
  p_page_id text default null,
  p_page_name text default null,
  p_correlation_id text default null
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_biz_whatsapp text;
begin
  if p_status = 'done' and (p_page_id is null or p_page_name is null) then
    raise exception 'page_required' using errcode = 'P0001';
  end if;

  select b.whatsapp_e164 into v_biz_whatsapp
    from public.businesses b
   where b.organization_id = p_org
   order by b.created_at desc
   limit 1;

  begin
    update public.meta_connections
       set page_access_status = p_status,
           status = case when p_status = 'done' then status else 'disconnected' end,
           page_id = case when p_status = 'done' then p_page_id end,
           page_name = case when p_status = 'done' then left(p_page_name, 120) end,
           whatsapp_phone_e164 = coalesce(whatsapp_phone_e164, v_biz_whatsapp)
     where organization_id = p_org;
    if not found then
      raise exception 'connection_not_found' using errcode = 'P0001';
    end if;
  exception when unique_violation then
    raise exception 'page_already_linked' using errcode = 'P0001';
  end;

  perform private.meta_audit(p_org, 'meta.page_linked', p_correlation_id,
    jsonb_build_object('status', p_status, 'page_id', p_page_id));
  perform private.meta_refresh_status(p_org);
end;
$$;

-- Atualiza e sincroniza WhatsApp e Instagram entre o cadastro do negócio e a conexão Meta.
create function public.set_business_contacts(
  p_org uuid,
  p_whatsapp_e164 text default null,
  p_instagram_handle text default null,
  p_correlation_id text default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_wpp text := nullif(trim(coalesce(p_whatsapp_e164, '')), '');
  v_ig text := nullif(regexp_replace(lower(trim(coalesce(p_instagram_handle, ''))), '^@', ''), '');
  v_biz public.businesses%rowtype;
begin
  if v_uid is null or not private.has_org_role(p_org, array['owner', 'admin']::public.member_role[]) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if v_wpp is not null and v_wpp !~ '^\+[1-9][0-9]{7,14}$' then
    raise exception 'invalid_whatsapp' using errcode = '22023';
  end if;
  if v_ig is not null and v_ig !~ '^[a-z0-9._]{1,30}$' then
    raise exception 'invalid_instagram' using errcode = '22023';
  end if;

  update public.businesses
     set whatsapp_e164 = coalesce(v_wpp, whatsapp_e164),
         instagram_handle = coalesce(v_ig, instagram_handle)
   where organization_id = p_org
  returning * into v_biz;

  if v_biz.id is null then
    raise exception 'business_not_found' using errcode = 'P0001';
  end if;

  if v_wpp is not null then
    update public.meta_connections
       set whatsapp_phone_e164 = v_wpp
     where organization_id = p_org;
  end if;

  perform public.log_audit_event(
    p_org,
    'business.contacts_updated',
    'business',
    v_biz.id,
    p_correlation_id,
    jsonb_build_object('whatsapp_updated', v_wpp is not null, 'instagram_updated', v_ig is not null)
  );

  return jsonb_build_object(
    'whatsapp_e164', v_biz.whatsapp_e164,
    'instagram_handle', v_biz.instagram_handle
  );
end;
$$;

-- Exportação LGPD inclui carteira de mídia e lançamentos.
create or replace function public.export_organization_data(
  p_org uuid,
  p_correlation_id text default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if (select auth.uid()) is null or not private.has_org_role(p_org, array['owner', 'admin']::public.member_role[]) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'exported_at', now(),
    'organization', (select to_jsonb(o) from public.organizations o where o.id = p_org),
    'members', coalesce((select jsonb_agg(to_jsonb(m)) from public.organization_members m where m.organization_id = p_org), '[]'::jsonb),
    'businesses', coalesce((select jsonb_agg(to_jsonb(b)) from public.businesses b where b.organization_id = p_org), '[]'::jsonb),
    'offers', coalesce((select jsonb_agg(to_jsonb(f)) from public.offers f where f.organization_id = p_org), '[]'::jsonb),
    'briefs', coalesce((select jsonb_agg(to_jsonb(r)) from public.briefs r where r.organization_id = p_org), '[]'::jsonb),
    'strategies', coalesce((select jsonb_agg(to_jsonb(s)) from public.strategies s where s.organization_id = p_org), '[]'::jsonb),
    'creatives', coalesce((select jsonb_agg(to_jsonb(c)) from public.creatives c where c.organization_id = p_org), '[]'::jsonb),
    'consents', coalesce((select jsonb_agg(to_jsonb(u)) from public.user_consents u where u.organization_id = p_org), '[]'::jsonb),
    'sales_records', coalesce((select jsonb_agg(to_jsonb(v)) from public.sales_records v where v.organization_id = p_org), '[]'::jsonb),
    'media_wallet', (select to_jsonb(w) from public.media_wallets w where w.organization_id = p_org),
    'media_wallet_entries', coalesce((select jsonb_agg(to_jsonb(e)) from public.media_wallet_entries e where e.organization_id = p_org), '[]'::jsonb)
  ) into v_result;

  perform public.log_audit_event(p_org, 'privacy.data_exported', 'organization', p_org, p_correlation_id, '{}'::jsonb);
  return v_result;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Grants
-- ---------------------------------------------------------------------------
revoke all on function public.add_media_balance(uuid, integer, text, text, boolean, text) from public, anon;
revoke all on function public.fund_campaign_from_wallet(uuid, text) from public, anon;
revoke all on function public.operator_shared_campaigns(boolean) from public, anon;
revoke all on function public.set_business_contacts(uuid, text, text, text) from public, anon;

grant execute on function public.add_media_balance(uuid, integer, text, text, boolean, text) to authenticated, service_role;
grant execute on function public.fund_campaign_from_wallet(uuid, text) to authenticated;
grant execute on function public.operator_shared_campaigns(boolean) to authenticated;
grant execute on function public.set_business_contacts(uuid, text, text, text) to authenticated;
