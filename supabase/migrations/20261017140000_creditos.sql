-- GereVendas Ads — criativos, subprojeto 3: créditos e limites mensais.
-- Ledger só de inserção: reserve ao criar job cobrável, commit no sucesso, release na falha.
-- Limites por mês (fuso de São Paulo): 4 estratégias e 20 imagens geradas por IA por organização.

create type public.credit_resource as enum ('strategy', 'image');
create type public.ledger_entry as enum ('reserve', 'commit', 'release');

create table public.usage_ledger (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  period text not null check (period ~ '^[0-9]{4}-[0-9]{2}$'),
  resource public.credit_resource not null,
  entry public.ledger_entry not null,
  units smallint not null default 1 check (units = 1),
  job_id uuid not null references public.generation_jobs (id) on delete cascade,
  created_at timestamptz not null default now(),
  -- Idempotência: uma reserva por job e no máximo um fechamento (commit ou release).
  unique (job_id, entry)
);
create index usage_ledger_org_period on public.usage_ledger (organization_id, period, resource);

-- Job cobrável: usa provedor real (simulação não consome crédito).
alter table public.generation_jobs add column billable boolean not null default false;

revoke all on public.usage_ledger from anon, authenticated, public;
grant select on public.usage_ledger to authenticated;
alter table public.usage_ledger enable row level security;
create policy usage_ledger_select on public.usage_ledger
  for select to authenticated using (private.is_org_member(organization_id));

-- ---------------------------------------------------------------------------
-- Funções de crédito
-- ---------------------------------------------------------------------------
create function private.current_period() returns text
language sql stable set search_path = ''
as $$ select to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM') $$;

create function private.credit_limit(p_resource public.credit_resource) returns integer
language sql immutable set search_path = ''
as $$ select case p_resource when 'strategy' then 4 when 'image' then 20 end $$;

-- Em uso = reservas - devoluções (commit só confirma a reserva).
create function private.credits_used(p_org uuid, p_resource public.credit_resource, p_period text) returns integer
language sql stable security definer set search_path = ''
as $$
  select (count(*) filter (where entry = 'reserve') - count(*) filter (where entry = 'release'))::integer
  from public.usage_ledger
  where organization_id = p_org and resource = p_resource and period = p_period
$$;

-- Reserva ao nascer um job cobrável; sem saldo, a criação do job falha.
create function private.generation_jobs_reserve() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_resource public.credit_resource := new.kind::text::public.credit_resource;
  v_period text := private.current_period();
begin
  if not new.billable then
    return new;
  end if;
  -- Serializa reservas da mesma organização e recurso (dois cliques simultâneos).
  perform pg_advisory_xact_lock(hashtextextended(new.organization_id::text || ':' || v_resource::text, 0));
  if private.credits_used(new.organization_id, v_resource, v_period) >= private.credit_limit(v_resource) then
    raise exception 'credit_limit_reached' using errcode = 'P0001';
  end if;
  insert into public.usage_ledger (organization_id, period, resource, entry, job_id)
  values (new.organization_id, v_period, v_resource, 'reserve', new.id);
  return new;
end;
$$;

create trigger generation_jobs_reserve after insert on public.generation_jobs
  for each row execute function private.generation_jobs_reserve();

-- Fecha a reserva quando o job termina: sucesso consome, falha (inclusive timeout) devolve.
create function private.generation_jobs_settle() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.status in ('succeeded', 'failed') and old.status not in ('succeeded', 'failed') then
    insert into public.usage_ledger (organization_id, period, resource, entry, job_id)
    select l.organization_id, l.period, l.resource,
           case when new.status = 'succeeded' then 'commit' else 'release' end::public.ledger_entry, l.job_id
    from public.usage_ledger l
    where l.job_id = new.id and l.entry = 'reserve'
      and not exists (select 1 from public.usage_ledger x where x.job_id = new.id and x.entry in ('commit', 'release'));
  end if;
  return new;
end;
$$;

create trigger generation_jobs_settle after update of status on public.generation_jobs
  for each row execute function private.generation_jobs_settle();

-- Resumo para a tela: créditos do mês e tokens de IA usados.
create function public.credit_summary(p_org uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_period text := private.current_period();
begin
  if (select auth.uid()) is null or not private.is_org_member(p_org) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'period', v_period,
    'strategy', jsonb_build_object('used', private.credits_used(p_org, 'strategy', v_period), 'limit', private.credit_limit('strategy')),
    'image', jsonb_build_object('used', private.credits_used(p_org, 'image', v_period), 'limit', private.credit_limit('image')),
    'tokens', (
      select coalesce(sum(coalesce(j.input_tokens, 0) + coalesce(j.output_tokens, 0)), 0)
      from public.generation_jobs j
      where j.organization_id = p_org
        and to_char(j.created_at at time zone 'America/Sao_Paulo', 'YYYY-MM') = v_period
    )
  );
end;
$$;

revoke all on function public.credit_summary(uuid) from public, anon;
grant execute on function public.credit_summary(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- start_strategy_job ganha p_billable (o servidor sabe se o provedor é real). Job de imagem é
-- sempre cobrável: só existe com provedor real.
-- ---------------------------------------------------------------------------
drop function public.start_strategy_job(uuid, text);

create function public.start_strategy_job(p_brief uuid, p_correlation_id text default null, p_billable boolean default true)
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
    insert into public.generation_jobs (organization_id, kind, status, brief_id, correlation_id, created_by, billable)
    values (v_org, 'strategy', 'running', p_brief, p_correlation_id, (select auth.uid()), coalesce(p_billable, true))
    returning id into v_job;
  exception when unique_violation then
    select j.id into v_job from public.generation_jobs j
     where j.brief_id = p_brief and j.kind = 'strategy' and j.status in ('queued', 'running');
    return jsonb_build_object('job_id', v_job, 'reused', true);
  end;

  perform public.log_audit_event(v_org, 'creatives.strategy_requested', 'generation_job', v_job, p_correlation_id,
    jsonb_build_object('billable', coalesce(p_billable, true)));
  return jsonb_build_object('job_id', v_job, 'reused', false);
end;
$$;

revoke all on function public.start_strategy_job(uuid, text, boolean) from public, anon;
grant execute on function public.start_strategy_job(uuid, text, boolean) to authenticated;

-- Jobs de imagem são sempre cobráveis.
create function private.generation_jobs_image_billable() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if new.kind = 'image' then
    new.billable := true;
  end if;
  return new;
end;
$$;
create trigger generation_jobs_image_billable before insert on public.generation_jobs
  for each row execute function private.generation_jobs_image_billable();
