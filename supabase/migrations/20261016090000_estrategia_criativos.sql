-- GereVendas Ads — fase 2: estratégia e conceitos gerados por IA, peças editáveis e jobs.
-- Escritas somente via RPCs (que validam membro, transições de estado e veracidade de preço);
-- clientes autenticados têm apenas SELECT, sempre sob RLS. Ver docs/adr/0003.

-- brief precisa ser referenciável junto com a organização (FKs compostas anti-cruzamento).
alter table public.briefs add constraint briefs_id_organization_id_key unique (id, organization_id);

create type public.job_status as enum ('queued', 'running', 'succeeded', 'failed');
create type public.creative_status as enum ('draft', 'approved');

-- ---------------------------------------------------------------------------
-- Tabelas
-- ---------------------------------------------------------------------------
create table public.generation_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  brief_id uuid not null,
  kind text not null default 'strategy' check (kind in ('strategy')),
  status public.job_status not null default 'queued',
  idempotency_key text not null check (idempotency_key ~ '^[A-Za-z0-9-]{8,64}$'),
  provider text not null check (provider in ('mock', 'openai')),
  model text check (char_length(model) <= 80),
  is_simulation boolean not null,
  attempts smallint not null default 0 check (attempts >= 0),
  max_attempts smallint not null default 3 check (max_attempts between 1 and 5),
  error_code text check (error_code ~ '^[a-z_]{3,40}$'),
  input_tokens integer not null default 0 check (input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  cost_micro_usd bigint not null default 0 check (cost_micro_usd >= 0),
  correlation_id text check (char_length(correlation_id) <= 64),
  result_strategy_id uuid,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  unique (organization_id, idempotency_key),
  foreign key (brief_id, organization_id) references public.briefs (id, organization_id) on delete cascade,
  check (status <> 'succeeded' or result_strategy_id is not null),
  check (provider <> 'mock' or is_simulation)
);

create index generation_jobs_org_created_idx on public.generation_jobs (organization_id, created_at desc);
create index generation_jobs_brief_status_idx on public.generation_jobs (brief_id, status);

create table public.strategies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  brief_id uuid not null,
  job_id uuid references public.generation_jobs (id) on delete set null,
  version integer not null check (version > 0),
  provider text not null check (provider in ('mock', 'openai')),
  model text check (char_length(model) <= 80),
  is_simulation boolean not null,
  content jsonb not null check (jsonb_typeof(content) = 'object' and pg_column_size(content) < 32768),
  created_at timestamptz not null default now(),
  unique (brief_id, version),
  unique (id, organization_id),
  foreign key (brief_id, organization_id) references public.briefs (id, organization_id) on delete cascade
);

create index strategies_org_brief_idx on public.strategies (organization_id, brief_id, version desc);

alter table public.generation_jobs
  add constraint generation_jobs_result_strategy_fk
  foreign key (result_strategy_id) references public.strategies (id) on delete set null;

create table public.creative_concepts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  strategy_id uuid not null,
  position smallint not null check (position between 1 and 5),
  content jsonb not null check (jsonb_typeof(content) = 'object' and pg_column_size(content) < 8192),
  created_at timestamptz not null default now(),
  unique (strategy_id, position),
  unique (id, organization_id),
  foreign key (strategy_id, organization_id) references public.strategies (id, organization_id) on delete cascade
);

create table public.creatives (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  concept_id uuid,
  offer_id uuid not null,
  design jsonb not null check (
    jsonb_typeof(design) = 'object'
    and pg_column_size(design) < 8192
    and design ->> 'format' in ('feed_4x5', 'stories_9x16')
  ),
  status public.creative_status not null default 'draft',
  version integer not null default 1 check (version > 0),
  approved_at timestamptz,
  approved_by uuid references auth.users (id) on delete set null,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status = 'draft' or approved_at is not null),
  foreign key (concept_id, organization_id)
    references public.creative_concepts (id, organization_id) on delete set null (concept_id),
  foreign key (offer_id, organization_id) references public.offers (id, organization_id) on delete cascade
);

create index creatives_org_updated_idx on public.creatives (organization_id, updated_at desc);

create trigger creatives_updated_at before update on public.creatives
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------
-- Grants e RLS: somente leitura direta, por membros.
-- ---------------------------------------------------------------------------
revoke all on public.generation_jobs, public.strategies, public.creative_concepts, public.creatives
  from anon, public;
grant select on public.generation_jobs, public.strategies, public.creative_concepts, public.creatives
  to authenticated;

alter table public.generation_jobs enable row level security;
alter table public.strategies enable row level security;
alter table public.creative_concepts enable row level security;
alter table public.creatives enable row level security;

create policy generation_jobs_select on public.generation_jobs
  for select to authenticated using (private.is_org_member(organization_id));
create policy strategies_select on public.strategies
  for select to authenticated using (private.is_org_member(organization_id));
create policy creative_concepts_select on public.creative_concepts
  for select to authenticated using (private.is_org_member(organization_id));
create policy creatives_select on public.creatives
  for select to authenticated using (private.is_org_member(organization_id));

-- ---------------------------------------------------------------------------
-- Auxiliares
-- ---------------------------------------------------------------------------

-- Preço na peça/conceito só com preço confirmado e sempre igual ao da oferta.
create function private.assert_price_allowed(p_offer uuid, p_show_price boolean, p_price_cents integer, p_currency text)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_offer record;
begin
  if not coalesce(p_show_price, false) then
    return;
  end if;
  select o.price_cents, o.currency, o.price_confirmed_by_client into v_offer
  from public.offers o where o.id = p_offer;
  if v_offer.price_cents is null or not v_offer.price_confirmed_by_client then
    raise exception 'price_not_confirmed' using errcode = 'P0001';
  end if;
  if p_price_cents is distinct from v_offer.price_cents
     or coalesce(p_currency, 'BRL') is distinct from v_offer.currency::text then
    raise exception 'price_mismatch' using errcode = 'P0001';
  end if;
end;
$$;

revoke all on function private.assert_price_allowed(uuid, boolean, integer, text) from public;

create function private.require_member(p_org uuid) returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or p_org is null or not private.is_org_member(p_org) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
end;
$$;

revoke all on function private.require_member(uuid) from public;

-- ---------------------------------------------------------------------------
-- RPCs de jobs de geração
-- ---------------------------------------------------------------------------

-- Enfileira geração de estratégia para um brief submetido. Idempotente por chave; se já
-- houver job em andamento para o brief, devolve esse job. Limite: 20 por organização/24h.
create function public.enqueue_generation_job(
  p_org uuid,
  p_brief uuid,
  p_idempotency_key text,
  p_provider text,
  p_model text default null,
  p_correlation_id text default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job uuid;
begin
  perform private.require_member(p_org);

  select j.id into v_job from public.generation_jobs j
  where j.organization_id = p_org and j.idempotency_key = p_idempotency_key;
  if v_job is not null then
    return v_job;
  end if;

  if not exists (
    select 1 from public.briefs b
    where b.id = p_brief and b.organization_id = p_org and b.status = 'submitted'
  ) then
    raise exception 'brief_not_ready' using errcode = 'P0001';
  end if;

  select j.id into v_job from public.generation_jobs j
  where j.brief_id = p_brief and j.status in ('queued', 'running')
  order by j.created_at desc limit 1;
  if v_job is not null then
    return v_job;
  end if;

  if (select count(*) from public.generation_jobs j
      where j.organization_id = p_org and j.created_at > now() - interval '24 hours') >= 20 then
    raise exception 'generation_quota_exceeded' using errcode = 'P0001';
  end if;

  insert into public.generation_jobs (
    organization_id, brief_id, idempotency_key, provider, model, is_simulation, correlation_id, created_by
  ) values (
    p_org, p_brief, p_idempotency_key, p_provider, p_model, p_provider = 'mock', p_correlation_id, (select auth.uid())
  ) returning id into v_job;

  insert into public.audit_events (organization_id, actor_user_id, action, entity_type, entity_id, correlation_id, metadata)
  values (p_org, (select auth.uid()), 'generation.requested', 'generation_job', v_job, p_correlation_id,
          jsonb_build_object('provider', p_provider));

  return v_job;
end;
$$;

-- queued -> running. Devolve o número da tentativa.
create function public.start_generation_job(p_job uuid) returns smallint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.generation_jobs%rowtype;
begin
  select * into v_row from public.generation_jobs j where j.id = p_job for update;
  perform private.require_member(v_row.organization_id);
  if v_row.status <> 'queued' then
    raise exception 'invalid_transition' using errcode = 'P0001';
  end if;
  update public.generation_jobs
    set status = 'running', attempts = attempts + 1, started_at = now(), error_code = null
    where id = p_job;
  return v_row.attempts + 1;
end;
$$;

-- running -> succeeded. Persiste estratégia (nova versão) e conceitos numa transação.
-- Provider, modelo e simulação vêm do job, nunca do chamador.
create function public.complete_generation_job(
  p_job uuid,
  p_strategy jsonb,
  p_concepts jsonb,
  p_usage jsonb default '{}'::jsonb
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.generation_jobs%rowtype;
  v_offer uuid;
  v_strategy uuid;
  v_version integer;
  v_concept jsonb;
  v_count integer;
begin
  select * into v_job from public.generation_jobs j where j.id = p_job for update;
  perform private.require_member(v_job.organization_id);
  if v_job.status <> 'running' then
    raise exception 'invalid_transition' using errcode = 'P0001';
  end if;

  if jsonb_typeof(p_strategy) <> 'object' or jsonb_typeof(p_concepts) <> 'array' then
    raise exception 'invalid_output' using errcode = 'P0001';
  end if;
  v_count := jsonb_array_length(p_concepts);
  if v_count < 3 or v_count > 5 then
    raise exception 'invalid_output' using errcode = 'P0001';
  end if;

  select b.offer_id into v_offer from public.briefs b where b.id = v_job.brief_id;
  for v_concept in select * from jsonb_array_elements(p_concepts) loop
    if jsonb_typeof(v_concept) <> 'object' then
      raise exception 'invalid_output' using errcode = 'P0001';
    end if;
    if coalesce((v_concept ->> 'show_price')::boolean, false) then
      perform private.assert_price_allowed(v_offer, true,
        (select o.price_cents from public.offers o where o.id = v_offer),
        (select o.currency::text from public.offers o where o.id = v_offer));
    end if;
  end loop;

  select coalesce(max(s.version), 0) + 1 into v_version from public.strategies s where s.brief_id = v_job.brief_id;

  insert into public.strategies (organization_id, brief_id, job_id, version, provider, model, is_simulation, content)
  values (v_job.organization_id, v_job.brief_id, v_job.id, v_version, v_job.provider, v_job.model,
          v_job.is_simulation, p_strategy)
  returning id into v_strategy;

  insert into public.creative_concepts (organization_id, strategy_id, position, content)
  select v_job.organization_id, v_strategy, e.ord::smallint, e.value
  from jsonb_array_elements(p_concepts) with ordinality as e(value, ord);

  update public.generation_jobs set
    status = 'succeeded',
    finished_at = now(),
    result_strategy_id = v_strategy,
    input_tokens = input_tokens + greatest(coalesce((p_usage ->> 'input_tokens')::integer, 0), 0),
    output_tokens = output_tokens + greatest(coalesce((p_usage ->> 'output_tokens')::integer, 0), 0),
    cost_micro_usd = cost_micro_usd + greatest(coalesce((p_usage ->> 'cost_micro_usd')::bigint, 0), 0)
  where id = p_job;

  insert into public.audit_events (organization_id, actor_user_id, action, entity_type, entity_id, correlation_id, metadata)
  values (v_job.organization_id, (select auth.uid()), 'generation.succeeded', 'strategy', v_strategy,
          v_job.correlation_id, jsonb_build_object('job_id', v_job.id, 'version', v_version));

  return v_strategy;
end;
$$;

-- running -> queued (retentável e com tentativas restantes) ou -> failed.
create function public.fail_generation_job(
  p_job uuid,
  p_error_code text,
  p_retryable boolean,
  p_usage jsonb default '{}'::jsonb
) returns public.job_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.generation_jobs%rowtype;
  v_next public.job_status;
begin
  select * into v_job from public.generation_jobs j where j.id = p_job for update;
  perform private.require_member(v_job.organization_id);
  if v_job.status <> 'running' then
    raise exception 'invalid_transition' using errcode = 'P0001';
  end if;

  v_next := case when p_retryable and v_job.attempts < v_job.max_attempts then 'queued' else 'failed' end;

  update public.generation_jobs set
    status = v_next,
    error_code = p_error_code,
    finished_at = case when v_next = 'failed' then now() else null end,
    input_tokens = input_tokens + greatest(coalesce((p_usage ->> 'input_tokens')::integer, 0), 0),
    output_tokens = output_tokens + greatest(coalesce((p_usage ->> 'output_tokens')::integer, 0), 0),
    cost_micro_usd = cost_micro_usd + greatest(coalesce((p_usage ->> 'cost_micro_usd')::bigint, 0), 0)
  where id = p_job;

  if v_next = 'failed' then
    insert into public.audit_events (organization_id, actor_user_id, action, entity_type, entity_id, correlation_id, metadata)
    values (v_job.organization_id, (select auth.uid()), 'generation.failed', 'generation_job', v_job.id,
            v_job.correlation_id, jsonb_build_object('error_code', p_error_code));
  end if;

  return v_next;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPCs de peças
-- ---------------------------------------------------------------------------

create function public.create_creative(p_concept uuid, p_design jsonb) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_offer uuid;
  v_creative uuid;
begin
  select c.organization_id, b.offer_id into v_org, v_offer
  from public.creative_concepts c
  join public.strategies s on s.id = c.strategy_id
  join public.briefs b on b.id = s.brief_id
  where c.id = p_concept;
  perform private.require_member(v_org);

  perform private.assert_price_allowed(v_offer, (p_design ->> 'show_price')::boolean,
    (p_design ->> 'price_cents')::integer, p_design ->> 'currency');

  insert into public.creatives (organization_id, concept_id, offer_id, design, created_by)
  values (v_org, p_concept, v_offer, p_design, (select auth.uid()))
  returning id into v_creative;

  insert into public.audit_events (organization_id, actor_user_id, action, entity_type, entity_id)
  values (v_org, (select auth.uid()), 'creative.created', 'creative', v_creative);

  return v_creative;
end;
$$;

-- Salva com controle de concorrência otimista. Qualquer edição desfaz a aprovação.
create function public.save_creative(p_creative uuid, p_version integer, p_design jsonb) returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.creatives%rowtype;
begin
  select * into v_row from public.creatives c where c.id = p_creative for update;
  perform private.require_member(v_row.organization_id);
  if v_row.version <> p_version then
    raise exception 'version_conflict' using errcode = 'P0001';
  end if;

  perform private.assert_price_allowed(v_row.offer_id, (p_design ->> 'show_price')::boolean,
    (p_design ->> 'price_cents')::integer, p_design ->> 'currency');

  update public.creatives set
    design = p_design,
    version = version + 1,
    status = 'draft',
    approved_at = null,
    approved_by = null
  where id = p_creative;

  return v_row.version + 1;
end;
$$;

create function public.approve_creative(p_creative uuid, p_version integer) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.creatives%rowtype;
begin
  select * into v_row from public.creatives c where c.id = p_creative for update;
  perform private.require_member(v_row.organization_id);
  if v_row.version <> p_version then
    raise exception 'version_conflict' using errcode = 'P0001';
  end if;

  update public.creatives set status = 'approved', approved_at = now(), approved_by = (select auth.uid())
  where id = p_creative;

  insert into public.audit_events (organization_id, actor_user_id, action, entity_type, entity_id)
  values (v_row.organization_id, (select auth.uid()), 'creative.approved', 'creative', p_creative);
end;
$$;

-- ---------------------------------------------------------------------------
-- Permissões das RPCs
-- ---------------------------------------------------------------------------
revoke all on function public.enqueue_generation_job(uuid, uuid, text, text, text, text) from public, anon;
revoke all on function public.start_generation_job(uuid) from public, anon;
revoke all on function public.complete_generation_job(uuid, jsonb, jsonb, jsonb) from public, anon;
revoke all on function public.fail_generation_job(uuid, text, boolean, jsonb) from public, anon;
revoke all on function public.create_creative(uuid, jsonb) from public, anon;
revoke all on function public.save_creative(uuid, integer, jsonb) from public, anon;
revoke all on function public.approve_creative(uuid, integer) from public, anon;

grant execute on function public.enqueue_generation_job(uuid, uuid, text, text, text, text) to authenticated;
grant execute on function public.start_generation_job(uuid) to authenticated;
grant execute on function public.complete_generation_job(uuid, jsonb, jsonb, jsonb) to authenticated;
grant execute on function public.fail_generation_job(uuid, text, boolean, jsonb) to authenticated;
grant execute on function public.create_creative(uuid, jsonb) to authenticated;
grant execute on function public.save_creative(uuid, integer, jsonb) to authenticated;
grant execute on function public.approve_creative(uuid, integer) to authenticated;
