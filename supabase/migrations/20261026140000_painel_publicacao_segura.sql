-- Painel por empresa e execução segura. Apenas no projeto isolado GereVendas Ads.
-- Não altera dados do CRM nem executa operações na Meta.
create table public.meta_campaign_executions (
  campaign_id uuid primary key,
  organization_id uuid not null,
  token uuid not null,
  started_at timestamptz not null default now(),
  foreign key (campaign_id, organization_id) references public.campaigns(id, organization_id) on delete cascade
);
create table public.meta_publication_steps (
  campaign_id uuid not null,
  organization_id uuid not null,
  step text not null check (length(step) between 1 and 100),
  confirmed boolean not null default false,
  started_at timestamptz not null default now(),
  primary key (campaign_id, step),
  foreign key (campaign_id, organization_id) references public.campaigns(id, organization_id) on delete cascade
);
create table public.meta_publication_snapshots (
  campaign_id uuid primary key,
  organization_id uuid not null,
  input jsonb not null check (jsonb_typeof(input) = 'object'),
  foreign key (campaign_id, organization_id) references public.campaigns(id, organization_id) on delete cascade
);
revoke all on public.meta_campaign_executions, public.meta_publication_steps, public.meta_publication_snapshots from public, anon, authenticated;
alter table public.meta_campaign_executions enable row level security;
alter table public.meta_publication_steps enable row level security;
alter table public.meta_publication_snapshots enable row level security;

create function public.meta_claim_execution(p_campaign uuid, p_token uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.meta_campaign_executions(campaign_id, organization_id, token)
  select id, organization_id, p_token from public.campaigns where id = p_campaign and not simulated
  on conflict (campaign_id) do nothing;
  return found;
end; $$;
create function public.meta_release_execution(p_campaign uuid, p_token uuid) returns void
language sql security definer set search_path = '' as $$
  delete from public.meta_campaign_executions where campaign_id = p_campaign and token = p_token;
$$;
create function public.meta_freeze_publication(p_campaign uuid, p_input jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_input jsonb;
begin
  insert into public.meta_publication_snapshots(campaign_id, organization_id, input)
  select id, organization_id, p_input from public.campaigns where id = p_campaign and not simulated
  on conflict (campaign_id) do nothing;
  select input into v_input from public.meta_publication_snapshots where campaign_id = p_campaign;
  if v_input is null then raise exception 'campaign_not_found'; end if;
  return v_input;
end; $$;
create function public.meta_begin_publication_step(p_campaign uuid, p_step text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.meta_publication_steps(campaign_id, organization_id, step)
  select id, organization_id, p_step from public.campaigns where id = p_campaign and not simulated and status = 'draft'
  on conflict (campaign_id, step) do nothing;
  if not found then raise exception 'publication_reconciliation_required' using errcode = 'P0001'; end if;
end; $$;

-- Gravação dos IDs e confirmação da intenção ocorrem na mesma transação.
alter function public.meta_record_publication(uuid, jsonb) set schema private;
revoke all on function private.meta_record_publication(uuid, jsonb) from public, anon, authenticated, service_role;
create function public.meta_record_publication(p_campaign uuid, p_payload jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare item jsonb;
begin
  perform private.meta_record_publication(p_campaign, p_payload);
  if p_payload ? 'external_campaign_id' then
    update public.meta_publication_steps set confirmed = true where campaign_id = p_campaign and step = 'campaign';
  end if;
  if p_payload ? 'external_adset_id' then
    update public.meta_publication_steps set confirmed = true where campaign_id = p_campaign and step = 'adset';
  end if;
  for item in select * from jsonb_array_elements(coalesce(p_payload -> 'creatives', '[]'::jsonb)) loop
    update public.meta_publication_steps set confirmed = true where campaign_id = p_campaign and (
      (item ? 'image_hash' and step = 'image:' || (item ->> 'creative_id')) or
      (item ? 'external_creative_id' and step = 'creative:' || (item ->> 'creative_id')) or
      (item ? 'external_ad_id' and step = 'ad:' || (item ->> 'creative_id'))
    );
  end loop;
end; $$;

revoke all on function public.meta_claim_execution(uuid, uuid) from public, anon, authenticated;
revoke all on function public.meta_release_execution(uuid, uuid) from public, anon, authenticated;
revoke all on function public.meta_freeze_publication(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.meta_begin_publication_step(uuid, text) from public, anon, authenticated;
revoke all on function public.meta_record_publication(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.meta_claim_execution(uuid, uuid) to service_role;
grant execute on function public.meta_release_execution(uuid, uuid) to service_role;
grant execute on function public.meta_freeze_publication(uuid, jsonb) to service_role;
grant execute on function public.meta_begin_publication_step(uuid, text) to service_role;
grant execute on function public.meta_record_publication(uuid, jsonb) to service_role;


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

-- Valida a autorização antes de tentar ativar na Meta.
create function public.meta_check_activation(p_campaign uuid, p_actor uuid, p_budget integer, p_days integer, p_key text)
returns text language plpgsql security definer set search_path = '' as $$
declare v_camp public.campaigns%rowtype; v_account text;
begin
  select * into v_camp from public.campaigns where id = p_campaign and not simulated;
  if v_camp.id is null or not private.is_member_with_role(v_camp.organization_id, p_actor, array['owner']::public.member_role[]) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v_camp.status <> 'paused' then raise exception 'campaign_not_paused'; end if;
  if v_camp.daily_budget_cents <> p_budget or v_camp.duration_days <> p_days then raise exception 'budget_snapshot_mismatch'; end if;
  if exists (select 1 from public.publication_operations where organization_id = v_camp.organization_id and idempotency_key = p_key) then
    raise exception 'idempotency_conflict';
  end if;
  select c.ad_account_id into v_account from public.meta_connections c
  join public.publication_operations op on op.campaign_id = p_campaign and op.operation = 'publish_paused'
  where c.organization_id = v_camp.organization_id and c.status = 'connected' and not c.simulated
    and c.ad_account_id = op.snapshot ->> 'ad_account_id' and c.page_id = op.snapshot ->> 'page_id';
  if v_account is null then raise exception 'meta_not_connected'; end if;
  return v_account;
end; $$;
revoke all on function public.meta_check_activation(uuid, uuid, integer, integer, text) from public, anon, authenticated;
grant execute on function public.meta_check_activation(uuid, uuid, integer, integer, text) to service_role;

-- Apenas o estado da execução é público aos membros; nunca retorna tokens ou snapshots.
create function public.meta_execution_overview(p_org uuid)
returns table (campaign_id uuid, started_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select e.campaign_id, e.started_at from public.meta_campaign_executions e
  where e.organization_id = p_org and private.is_org_member(p_org);
$$;
revoke all on function public.meta_execution_overview(uuid) from public, anon;
grant execute on function public.meta_execution_overview(uuid) to authenticated;
