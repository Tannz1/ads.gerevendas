-- GereVendas Ads — criativos (M2, subprojeto 1): jobs de geração, estratégias e peças.
-- ADR 0003. Leitura por membros via RLS; escrita só por RPC (exceto o conteúdo da peça, que o
-- editor altera com permissão por coluna). Migration aditiva.

create type public.generation_kind as enum ('strategy', 'image');
create type public.job_status as enum ('queued', 'running', 'succeeded', 'failed');
create type public.creative_status as enum ('draft', 'approved');

-- FK composta (id, organization_id) impede apontar para brief de outra organização.
alter table public.briefs add constraint briefs_id_organization_id_key unique (id, organization_id);

-- ---------------------------------------------------------------------------
-- Tabelas
-- ---------------------------------------------------------------------------
create table public.generation_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  kind public.generation_kind not null,
  status public.job_status not null default 'running',
  brief_id uuid not null,
  provider text check (char_length(provider) <= 20),
  model_id text check (char_length(model_id) <= 80),
  prompt_version text check (char_length(prompt_version) <= 40),
  input_tokens integer check (input_tokens >= 0),
  output_tokens integer check (output_tokens >= 0),
  error_code text check (error_code ~ '^[a-z_]{1,40}$'),
  correlation_id text check (char_length(correlation_id) <= 64),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  unique (id, organization_id),
  foreign key (brief_id, organization_id) references public.briefs (id, organization_id) on delete cascade,
  check ((status in ('succeeded', 'failed')) = (finished_at is not null)),
  check (status <> 'failed' or error_code is not null)
);

-- No máximo um job ativo por brief e tipo: dois cliques em "Gerar" não criam dois jobs.
create unique index generation_jobs_one_active on public.generation_jobs (brief_id, kind)
  where status in ('queued', 'running');
create index generation_jobs_org_created on public.generation_jobs (organization_id, created_at desc);

create table public.strategies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  brief_id uuid not null,
  job_id uuid not null,
  version integer not null check (version >= 1),
  plan jsonb not null check (jsonb_typeof(plan) = 'object' and jsonb_array_length(plan -> 'angles') = 5),
  simulated boolean not null,
  created_at timestamptz not null default now(),
  unique (id, organization_id),
  unique (brief_id, version),
  foreign key (brief_id, organization_id) references public.briefs (id, organization_id) on delete cascade,
  foreign key (job_id, organization_id) references public.generation_jobs (id, organization_id) on delete cascade
);

create table public.creatives (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  strategy_id uuid not null,
  angle_key text not null check (angle_key in ('oferta', 'problema', 'beneficio', 'demonstracao', 'conveniencia')),
  content jsonb not null check (jsonb_typeof(content) = 'object'),
  status public.creative_status not null default 'draft',
  approved_by uuid references auth.users (id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  unique (strategy_id, angle_key),
  foreign key (strategy_id, organization_id) references public.strategies (id, organization_id) on delete cascade,
  check (status = 'draft' or approved_at is not null)
);

-- Mudou o conteúdo de uma peça aprovada: volta a rascunho (a aprovação valia para o texto anterior).
create function private.creatives_on_update() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  if new.content is distinct from old.content and old.status = 'approved' then
    new.status := 'draft';
    new.approved_by := null;
    new.approved_at := null;
  end if;
  return new;
end;
$$;

create trigger creatives_on_update before update on public.creatives
  for each row execute function private.creatives_on_update();

-- ---------------------------------------------------------------------------
-- Grants e RLS
-- ---------------------------------------------------------------------------
-- O Supabase concede tudo a `authenticated` em tabelas novas por padrão: revoga e concede o mínimo.
revoke all on public.generation_jobs, public.strategies, public.creatives from anon, authenticated, public;
grant select on public.generation_jobs, public.strategies, public.creatives to authenticated;
-- O editor só pode mudar o conteúdo; status e aprovação passam por approve_creative.
grant update (content) on public.creatives to authenticated;

alter table public.generation_jobs enable row level security;
alter table public.strategies enable row level security;
alter table public.creatives enable row level security;

create policy generation_jobs_select on public.generation_jobs
  for select to authenticated using (private.is_org_member(organization_id));
create policy strategies_select on public.strategies
  for select to authenticated using (private.is_org_member(organization_id));
create policy creatives_select on public.creatives
  for select to authenticated using (private.is_org_member(organization_id));
create policy creatives_update on public.creatives
  for update to authenticated
  using (private.is_org_member(organization_id))
  with check (private.is_org_member(organization_id));

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------

-- Inicia (ou reaproveita) o job de estratégia de um brief. Job "running" há mais de 5 min é dado
-- como perdido (container reiniciado) e marcado como falho.
create function public.start_strategy_job(p_brief uuid, p_correlation_id text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_status public.brief_status;
  v_job uuid;
begin
  select b.organization_id, b.status into v_org, v_status from public.briefs b where b.id = p_brief;
  if (select auth.uid()) is null or v_org is null or not private.is_org_member(v_org) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v_status <> 'submitted' then
    raise exception 'brief_not_ready' using errcode = 'P0001';
  end if;

  update public.generation_jobs
     set status = 'failed', error_code = 'timeout', finished_at = now()
   where brief_id = p_brief and kind = 'strategy' and status in ('queued', 'running')
     and started_at < now() - interval '5 minutes';

  select j.id into v_job from public.generation_jobs j
   where j.brief_id = p_brief and j.kind = 'strategy' and j.status in ('queued', 'running');
  if v_job is not null then
    return jsonb_build_object('job_id', v_job, 'reused', true);
  end if;

  begin
    insert into public.generation_jobs (organization_id, kind, status, brief_id, correlation_id, created_by)
    values (v_org, 'strategy', 'running', p_brief, p_correlation_id, (select auth.uid()))
    returning id into v_job;
  exception when unique_violation then
    -- Outra requisição criou o job ao mesmo tempo.
    select j.id into v_job from public.generation_jobs j
     where j.brief_id = p_brief and j.kind = 'strategy' and j.status in ('queued', 'running');
    return jsonb_build_object('job_id', v_job, 'reused', true);
  end;

  perform public.log_audit_event(v_org, 'creatives.strategy_requested', 'generation_job', v_job, p_correlation_id, '{}'::jsonb);
  return jsonb_build_object('job_id', v_job, 'reused', false);
end;
$$;

-- Grava estratégia + 5 peças e conclui o job, numa transação. O conteúdo já chega validado (Zod +
-- checagem de fatos no servidor da aplicação).
create function public.finish_strategy_job(
  p_job uuid,
  p_plan jsonb,
  p_contents jsonb,
  p_simulated boolean,
  p_provider text,
  p_model text,
  p_prompt_version text,
  p_input_tokens integer,
  p_output_tokens integer
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.generation_jobs%rowtype;
  v_strategy uuid;
  v_version integer;
begin
  select * into v_job from public.generation_jobs j where j.id = p_job for update;
  if (select auth.uid()) is null or v_job.id is null or not private.is_org_member(v_job.organization_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v_job.kind <> 'strategy' or v_job.status <> 'running' then
    raise exception 'job_not_running' using errcode = 'P0001';
  end if;
  if jsonb_typeof(p_contents) <> 'array' or jsonb_array_length(p_contents) <> 5 then
    raise exception 'invalid_contents' using errcode = 'P0001';
  end if;

  select coalesce(max(s.version), 0) + 1 into v_version from public.strategies s where s.brief_id = v_job.brief_id;

  insert into public.strategies (organization_id, brief_id, job_id, version, plan, simulated)
  values (v_job.organization_id, v_job.brief_id, p_job, v_version, p_plan, p_simulated)
  returning id into v_strategy;

  insert into public.creatives (organization_id, strategy_id, angle_key, content)
  select v_job.organization_id, v_strategy, c ->> 'angle_key', c -> 'content'
  from jsonb_array_elements(p_contents) c;

  update public.generation_jobs
     set status = 'succeeded', finished_at = now(), provider = p_provider, model_id = p_model,
         prompt_version = p_prompt_version, input_tokens = p_input_tokens, output_tokens = p_output_tokens
   where id = p_job;

  perform public.log_audit_event(v_job.organization_id, 'creatives.strategy_generated', 'strategy', v_strategy,
    v_job.correlation_id, jsonb_build_object('simulated', p_simulated, 'provider', p_provider));
  return v_strategy;
end;
$$;

create function public.fail_generation_job(
  p_job uuid,
  p_code text,
  p_provider text default null,
  p_model text default null,
  p_prompt_version text default null
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
begin
  select j.organization_id into v_org from public.generation_jobs j where j.id = p_job;
  if (select auth.uid()) is null or v_org is null or not private.is_org_member(v_org) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update public.generation_jobs
     set status = 'failed', error_code = p_code, finished_at = now(),
         provider = coalesce(p_provider, provider), model_id = coalesce(p_model, model_id),
         prompt_version = coalesce(p_prompt_version, prompt_version)
   where id = p_job and status in ('queued', 'running');
end;
$$;

-- Aprovação é decisão do dono: só owner/admin.
create function public.approve_creative(p_creative uuid, p_correlation_id text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
begin
  select c.organization_id into v_org from public.creatives c where c.id = p_creative;
  if (select auth.uid()) is null or v_org is null
     or not private.has_org_role(v_org, array['owner', 'admin']::public.member_role[]) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update public.creatives
     set status = 'approved', approved_by = (select auth.uid()), approved_at = now()
   where id = p_creative;
  perform public.log_audit_event(v_org, 'creatives.approved', 'creative', p_creative, p_correlation_id, '{}'::jsonb);
end;
$$;

revoke all on function public.start_strategy_job(uuid, text) from public, anon;
revoke all on function public.finish_strategy_job(uuid, jsonb, jsonb, boolean, text, text, text, integer, integer) from public, anon;
revoke all on function public.fail_generation_job(uuid, text, text, text, text) from public, anon;
revoke all on function public.approve_creative(uuid, text) from public, anon;
grant execute on function public.start_strategy_job(uuid, text) to authenticated;
grant execute on function public.finish_strategy_job(uuid, jsonb, jsonb, boolean, text, text, text, integer, integer) to authenticated;
grant execute on function public.fail_generation_job(uuid, text, text, text, text) to authenticated;
grant execute on function public.approve_creative(uuid, text) to authenticated;
