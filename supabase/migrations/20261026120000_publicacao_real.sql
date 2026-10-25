-- GereVendas Ads — publicação real na Meta e acompanhamento (ADR 0006).
-- Guardrails:
-- 1. Toda campanha real nasce `draft` e só vira `paused` quando a Meta devolveu todos os IDs.
-- 2. IDs, status de revisão e métricas da Meta só são gravados pelo servidor (service_role).
-- 3. Campanha real só muda de status pelo servidor, depois da Meta, com o dono como responsável.
-- 4. Ativar não marca "aprovada pela Meta": isso só vem da Meta.

-- ---------------------------------------------------------------------------
-- 1. Colunas e tabela de métricas
-- ---------------------------------------------------------------------------
alter table public.campaign_creatives
  add column external_creative_id text check (char_length(external_creative_id) between 1 and 128),
  add column image_hash text check (char_length(image_hash) between 1 and 128);

alter table public.campaigns
  add column last_synced_at timestamptz;

create table public.campaign_insights (
  campaign_id uuid primary key,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  spend_cents bigint not null check (spend_cents >= 0),
  impressions bigint not null check (impressions >= 0),
  reach bigint not null check (reach >= 0),
  clicks bigint not null check (clicks >= 0),
  conversations bigint not null check (conversations >= 0),
  fetched_at timestamptz not null default now(),
  foreign key (campaign_id, organization_id) references public.campaigns (id, organization_id) on delete cascade
);

revoke all on public.campaign_insights from anon, authenticated, public;
grant select on public.campaign_insights to authenticated;
alter table public.campaign_insights enable row level security;
create policy campaign_insights_select on public.campaign_insights
  for select to authenticated using (private.is_org_member(organization_id));

-- ---------------------------------------------------------------------------
-- 2. Auxiliares
-- ---------------------------------------------------------------------------
create function private.campaign_audit(
  p_org uuid, p_actor uuid, p_action text, p_campaign uuid, p_correlation_id text, p_metadata jsonb
) returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.audit_events (organization_id, actor_user_id, action, entity_type, entity_id, correlation_id, metadata)
  values (p_org, p_actor, p_action, 'campaign', p_campaign, left(p_correlation_id, 64), coalesce(p_metadata, '{}'::jsonb));
$$;
revoke all on function private.campaign_audit(uuid, uuid, text, uuid, text, jsonb) from public;

create function private.is_member_with_role(p_org uuid, p_user uuid, p_roles public.member_role[]) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.organization_members m
     where m.organization_id = p_org and m.user_id = p_user and m.role = any (p_roles)
  )
$$;
revoke all on function private.is_member_with_role(uuid, uuid, public.member_role[]) from public;

-- Atribui uma conta do estoque a uma organização (usado pelo pedido do dono e pela fila de espera).
create function private.meta_assign_pool_row(p_org uuid, p_pool_id uuid, p_actor uuid, p_correlation_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pool public.meta_ad_account_pool%rowtype;
begin
  update public.meta_ad_account_pool
     set status = 'assigned', organization_id = p_org, assigned_at = coalesce(assigned_at, now())
   where id = p_pool_id
  returning * into v_pool;

  insert into public.meta_connections (
    organization_id, simulated, ad_account_id, ad_account_name, ad_account_status, pool_requested_at, connected_by
  ) values (p_org, v_pool.simulated, v_pool.ad_account_id, v_pool.name, 'done', null, p_actor)
  on conflict (organization_id) do update set
    simulated = excluded.simulated,
    ad_account_id = excluded.ad_account_id,
    ad_account_name = excluded.ad_account_name,
    ad_account_status = 'done',
    pool_requested_at = null,
    connected_by = coalesce(excluded.connected_by, public.meta_connections.connected_by);

  perform private.meta_audit(p_org, 'meta.ad_account_assigned', p_correlation_id,
    jsonb_build_object('ad_account_id', v_pool.ad_account_id, 'simulated', v_pool.simulated));
  perform private.meta_refresh_status(p_org);
end;
$$;
revoke all on function private.meta_assign_pool_row(uuid, uuid, uuid, text) from public;

-- ---------------------------------------------------------------------------
-- 3. Estoque: pedido do dono e fila de espera atendida ao registrar contas
-- ---------------------------------------------------------------------------
create or replace function public.assign_pool_account(
  p_org uuid,
  p_simulated boolean,
  p_correlation_id text default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_conn public.meta_connections%rowtype;
  v_pool public.meta_ad_account_pool%rowtype;
begin
  if v_uid is null or not private.has_org_role(p_org, array['owner']::public.member_role[]) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  -- Serializa pedidos da mesma organização (clique duplo, duas abas).
  perform pg_advisory_xact_lock(hashtext('meta_pool:' || p_org::text));

  select * into v_conn from public.meta_connections c where c.organization_id = p_org;
  if v_conn.ad_account_status = 'done' and v_conn.ad_account_id is not null then
    return jsonb_build_object('pool_empty', false, 'replayed', true,
                              'ad_account_id', v_conn.ad_account_id, 'name', v_conn.ad_account_name);
  end if;

  select * into v_pool from public.meta_ad_account_pool p where p.organization_id = p_org;
  if v_pool.id is null then
    select * into v_pool
      from public.meta_ad_account_pool p
     where p.status = 'available' and p.simulated = coalesce(p_simulated, true)
     order by p.created_at
     limit 1
     for update skip locked;
  end if;

  if v_pool.id is null then
    insert into public.meta_connections (organization_id, simulated, ad_account_status, pool_requested_at)
    values (p_org, coalesce(p_simulated, true), 'awaiting_meta', now())
    on conflict (organization_id) do update
      set ad_account_status = 'awaiting_meta',
          simulated = excluded.simulated,
          pool_requested_at = coalesce(public.meta_connections.pool_requested_at, now());
    perform private.meta_audit(p_org, 'meta.pool_empty', p_correlation_id, '{}'::jsonb);
    return jsonb_build_object('pool_empty', true, 'replayed', false);
  end if;

  perform private.meta_assign_pool_row(p_org, v_pool.id, v_uid, p_correlation_id);
  return jsonb_build_object('pool_empty', false, 'replayed', false, 'newly_assigned', true,
                            'ad_account_id', v_pool.ad_account_id, 'name', v_pool.name);
end;
$$;

create or replace function public.register_pool_accounts(
  p_accounts jsonb,
  p_simulated boolean,
  p_source text,
  p_correlation_id text default null
) returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
  v_waiting record;
  v_pool_id uuid;
begin
  if (select auth.uid()) is null or not private.is_platform_operator() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_source not in ('api', 'imported') then
    raise exception 'invalid_source' using errcode = 'P0001';
  end if;
  if jsonb_typeof(p_accounts) <> 'array' then
    raise exception 'invalid_accounts' using errcode = 'P0001';
  end if;

  with ins as (
    insert into public.meta_ad_account_pool (ad_account_id, name, currency, timezone_id, source, simulated)
    select a ->> 'ad_account_id',
           left(coalesce(nullif(a ->> 'name', ''), a ->> 'ad_account_id'), 120),
           coalesce(nullif(a ->> 'currency', ''), 'BRL'),
           nullif(a ->> 'timezone_id', '')::integer,
           p_source,
           coalesce(p_simulated, true)
      from jsonb_array_elements(p_accounts) a
    on conflict (ad_account_id) do nothing
    returning 1
  )
  select count(*) into v_count from ins;

  insert into public.meta_pool_events (actor_user_id, action, metadata)
  values ((select auth.uid()), 'registered',
          jsonb_build_object('count', v_count, 'source', p_source, 'simulated', coalesce(p_simulated, true),
                             'correlation_id', p_correlation_id));

  -- Fila de espera: quem pediu primeiro recebe primeiro.
  for v_waiting in
    select c.organization_id
      from public.meta_connections c
     where c.pool_requested_at is not null and c.ad_account_status <> 'done'
       and c.simulated = coalesce(p_simulated, true)
     order by c.pool_requested_at
  loop
    select p.id into v_pool_id
      from public.meta_ad_account_pool p
     where p.status = 'available' and p.simulated = coalesce(p_simulated, true)
     order by p.created_at
     limit 1
     for update skip locked;
    exit when v_pool_id is null;
    perform private.meta_assign_pool_row(v_waiting.organization_id, v_pool_id, null, p_correlation_id);
    v_pool_id := null;
  end loop;

  return v_count;
end;
$$;

-- Conta de anúncios bloqueada/desativada na Meta (ou recuperada).
create function public.meta_set_ad_account_status(
  p_org uuid,
  p_status public.meta_step_status,
  p_correlation_id text default null
) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.meta_connections set ad_account_status = p_status where organization_id = p_org;
  if not found then
    raise exception 'connection_not_found' using errcode = 'P0001';
  end if;
  perform private.meta_audit(p_org, 'meta.ad_account_status', p_correlation_id, jsonb_build_object('status', p_status));
  perform private.meta_refresh_status(p_org);
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Campanhas simuladas: sempre Simulação; ativar não inventa aprovação da Meta
-- ---------------------------------------------------------------------------
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
begin
  -- p_simulated é ignorado: este RPC só cria campanha simulada. A real usa start_real_publication.
  if v_uid is null or not private.has_org_role(p_org, array['owner']::public.member_role[]) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select op.campaign_id into v_existing_campaign
  from public.publication_operations op
  where op.organization_id = p_org and op.idempotency_key = p_idempotency_key;
  if v_existing_campaign is not null then
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

  insert into public.campaigns (
    organization_id, strategy_id, name, objective, status, meta_review_status,
    simulated, daily_budget_cents, currency, duration_days,
    external_campaign_id, external_adset_id, spend_confirmed_by, spend_confirmed_at, paused_at
  )
  values (
    p_org, p_strategy, trim(p_name), p_objective, 'paused', 'pending_review',
    true, p_daily_budget_cents, 'BRL', p_duration_days,
    p_external_campaign_id, p_external_adset_id, v_uid, now(), now()
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
  if v_uid is null or v_camp.id is null or not private.has_org_role(v_camp.organization_id, array['owner']::public.member_role[]) then
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

  perform public.log_audit_event(v_camp.organization_id, 'campaigns.activated', 'campaign', p_campaign, p_correlation_id,
    jsonb_build_object('simulated', v_camp.simulated, 'daily_budget_cents', v_camp.daily_budget_cents,
                       'duration_days', v_camp.duration_days));
end;
$$;

create or replace function public.pause_campaign(
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
  if not v_camp.simulated then
    raise exception 'real_campaign_requires_server' using errcode = 'P0001';
  end if;

  update public.campaigns set status = 'paused', paused_at = now() where id = p_campaign and status = 'active';
  perform public.log_audit_event(v_camp.organization_id, 'campaigns.paused', 'campaign', p_campaign, p_correlation_id, '{}'::jsonb);
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Publicação real em etapas
-- ---------------------------------------------------------------------------
create function public.start_real_publication(
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
begin
  if v_uid is null or not private.has_org_role(p_org, array['owner']::public.member_role[]) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select op.campaign_id into v_existing
    from public.publication_operations op
   where op.organization_id = p_org and op.idempotency_key = p_idempotency_key;
  if v_existing is not null then
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

  insert into public.campaigns (
    organization_id, strategy_id, name, objective, status, meta_review_status,
    simulated, daily_budget_cents, currency, duration_days, spend_confirmed_by, spend_confirmed_at
  ) values (
    p_org, p_strategy, trim(p_name), p_objective, 'draft', 'not_submitted',
    false, p_daily_budget_cents, 'BRL', p_duration_days, v_uid, now()
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

  return jsonb_build_object('campaign_id', v_campaign_id, 'replayed', false);
end;
$$;

-- Grava os IDs que a Meta devolveu (campanha, conjunto e, por peça, imagem/criativo/anúncio).
create function public.meta_record_publication(p_campaign uuid, p_payload jsonb) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item jsonb;
begin
  update public.campaigns
     set external_campaign_id = coalesce(p_payload ->> 'external_campaign_id', external_campaign_id),
         external_adset_id = coalesce(p_payload ->> 'external_adset_id', external_adset_id)
   where id = p_campaign and not simulated;
  if not found then
    raise exception 'campaign_not_found' using errcode = 'P0001';
  end if;

  for v_item in select * from jsonb_array_elements(coalesce(p_payload -> 'creatives', '[]'::jsonb)) loop
    update public.campaign_creatives
       set image_hash = coalesce(v_item ->> 'image_hash', image_hash),
           external_creative_id = coalesce(v_item ->> 'external_creative_id', external_creative_id),
           external_ad_id = coalesce(v_item ->> 'external_ad_id', external_ad_id)
     where campaign_id = p_campaign and creative_id = (v_item ->> 'creative_id')::uuid;
  end loop;
end;
$$;

create function public.meta_finish_publication(p_campaign uuid, p_correlation_id text default null) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_camp public.campaigns%rowtype;
begin
  select * into v_camp from public.campaigns c where c.id = p_campaign and not c.simulated for update;
  if v_camp.id is null then
    raise exception 'campaign_not_found' using errcode = 'P0001';
  end if;
  if v_camp.status <> 'draft' then
    return;
  end if;
  if v_camp.external_campaign_id is null or v_camp.external_adset_id is null
     or exists (select 1 from public.campaign_creatives cc
                 where cc.campaign_id = p_campaign and cc.external_ad_id is null) then
    raise exception 'publication_incomplete' using errcode = 'P0001';
  end if;

  update public.campaigns
     set status = 'paused', meta_review_status = 'pending_review', paused_at = now()
   where id = p_campaign;

  perform private.campaign_audit(v_camp.organization_id, v_camp.spend_confirmed_by, 'campaigns.published_paused',
    p_campaign, p_correlation_id, jsonb_build_object('simulated', false));
end;
$$;

-- Ativação real: o servidor já ativou na Meta; grava com o dono como responsável.
create function public.meta_activate_campaign(
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
begin
  select * into v_camp from public.campaigns c where c.id = p_campaign and not c.simulated for update;
  if v_camp.id is null or not private.is_member_with_role(v_camp.organization_id, p_actor, array['owner']::public.member_role[]) then
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

create function public.meta_pause_campaign(p_campaign uuid, p_actor uuid, p_correlation_id text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_camp public.campaigns%rowtype;
begin
  select * into v_camp from public.campaigns c where c.id = p_campaign and not c.simulated for update;
  if v_camp.id is null
     or not private.is_member_with_role(v_camp.organization_id, p_actor, array['owner', 'admin']::public.member_role[]) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  update public.campaigns set status = 'paused', paused_at = now() where id = p_campaign and status = 'active';
  perform private.campaign_audit(v_camp.organization_id, p_actor, 'campaigns.paused', p_campaign, p_correlation_id, '{}'::jsonb);
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Acompanhamento
-- ---------------------------------------------------------------------------
create function public.meta_set_campaign_review(p_campaign uuid, p_status public.meta_review_status) returns void
language sql
security definer
set search_path = ''
as $$
  update public.campaigns set meta_review_status = p_status where id = p_campaign and not simulated;
$$;

create function public.meta_record_insights(
  p_campaign uuid,
  p_spend_cents bigint,
  p_impressions bigint,
  p_reach bigint,
  p_clicks bigint,
  p_conversations bigint
) returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.campaign_insights (campaign_id, organization_id, spend_cents, impressions, reach, clicks, conversations, fetched_at)
  select c.id, c.organization_id, p_spend_cents, p_impressions, p_reach, p_clicks, p_conversations, now()
    from public.campaigns c
   where c.id = p_campaign and not c.simulated
  on conflict (campaign_id) do update set
    spend_cents = excluded.spend_cents,
    impressions = excluded.impressions,
    reach = excluded.reach,
    clicks = excluded.clicks,
    conversations = excluded.conversations,
    fetched_at = excluded.fetched_at;
$$;

create function public.meta_touch_campaign_sync(p_campaign uuid, p_min_interval_seconds integer) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.campaigns
     set last_synced_at = now()
   where id = p_campaign
     and (last_synced_at is null or last_synced_at < now() - make_interval(secs => p_min_interval_seconds));
  return found;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Grants
-- ---------------------------------------------------------------------------
revoke all on function public.start_real_publication(uuid, uuid, text, public.brief_objective, integer, integer, uuid[], text, text) from public, anon;
grant execute on function public.start_real_publication(uuid, uuid, text, public.brief_objective, integer, integer, uuid[], text, text) to authenticated;

revoke all on function public.meta_set_ad_account_status(uuid, public.meta_step_status, text) from public, anon, authenticated;
revoke all on function public.meta_record_publication(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.meta_finish_publication(uuid, text) from public, anon, authenticated;
revoke all on function public.meta_activate_campaign(uuid, uuid, integer, integer, text, text) from public, anon, authenticated;
revoke all on function public.meta_pause_campaign(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.meta_set_campaign_review(uuid, public.meta_review_status) from public, anon, authenticated;
revoke all on function public.meta_record_insights(uuid, bigint, bigint, bigint, bigint, bigint) from public, anon, authenticated;
revoke all on function public.meta_touch_campaign_sync(uuid, integer) from public, anon, authenticated;

grant execute on function public.meta_set_ad_account_status(uuid, public.meta_step_status, text) to service_role;
grant execute on function public.meta_record_publication(uuid, jsonb) to service_role;
grant execute on function public.meta_finish_publication(uuid, text) to service_role;
grant execute on function public.meta_activate_campaign(uuid, uuid, integer, integer, text, text) to service_role;
grant execute on function public.meta_pause_campaign(uuid, uuid, text) to service_role;
grant execute on function public.meta_set_campaign_review(uuid, public.meta_review_status) to service_role;
grant execute on function public.meta_record_insights(uuid, bigint, bigint, bigint, bigint, bigint) to service_role;
grant execute on function public.meta_touch_campaign_sync(uuid, integer) to service_role;
