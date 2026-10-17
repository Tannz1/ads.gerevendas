-- GereVendas Ads — criativos, subprojeto 2: imagem-base (foto do cliente ou gerada por IA).
-- Arquivos no Storage privado `creative-assets` em `{organization_id}/{asset_id}.{jpg|png}`.

create type public.asset_kind as enum ('photo', 'generated');

create table public.assets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  kind public.asset_kind not null,
  storage_path text not null unique check (storage_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png)$'),
  mime text not null check (mime in ('image/jpeg', 'image/png')),
  bytes integer not null check (bytes between 1 and 10485760),
  rights_confirmed_at timestamptz,
  job_id uuid,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (id, organization_id),
  -- O arquivo fica na pasta da própria organização.
  check (split_part(storage_path, '/', 1) = organization_id::text),
  -- Foto do cliente exige declaração de direito de uso.
  check (kind <> 'photo' or rights_confirmed_at is not null)
);

alter table public.creatives add column image_asset_id uuid;
alter table public.creatives add constraint creatives_image_asset_fk
  foreign key (image_asset_id, organization_id) references public.assets (id, organization_id)
  on delete set null (image_asset_id);

-- Jobs de imagem apontam para a peça; um job ativo por peça (e um de estratégia por brief).
alter table public.generation_jobs add column creative_id uuid;
alter table public.generation_jobs add constraint generation_jobs_creative_fk
  foreign key (creative_id, organization_id) references public.creatives (id, organization_id) on delete cascade;
alter table public.generation_jobs add constraint generation_jobs_image_has_creative
  check (kind <> 'image' or creative_id is not null);
drop index public.generation_jobs_one_active;
create unique index generation_jobs_one_active_strategy on public.generation_jobs (brief_id)
  where kind = 'strategy' and status in ('queued', 'running');
create unique index generation_jobs_one_active_image on public.generation_jobs (creative_id)
  where kind = 'image' and status in ('queued', 'running');

-- Trocar a imagem de uma peça aprovada também volta a rascunho.
create or replace function private.creatives_on_update() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  if (new.content is distinct from old.content or new.image_asset_id is distinct from old.image_asset_id)
     and old.status = 'approved' then
    new.status := 'draft';
    new.approved_by := null;
    new.approved_at := null;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants e RLS
-- ---------------------------------------------------------------------------
revoke all on public.assets from anon, authenticated, public;
grant select on public.assets to authenticated;
-- Editor pode remover a imagem (null) ou trocar por um asset da mesma org (FK composta).
grant update (image_asset_id) on public.creatives to authenticated;

alter table public.assets enable row level security;
create policy assets_select on public.assets
  for select to authenticated using (private.is_org_member(organization_id));

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------
create function public.start_image_job(p_creative uuid, p_correlation_id text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_brief uuid;
  v_job uuid;
begin
  select c.organization_id, s.brief_id into v_org, v_brief
  from public.creatives c join public.strategies s on s.id = c.strategy_id
  where c.id = p_creative;
  if (select auth.uid()) is null or v_org is null or not private.is_org_member(v_org) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  update public.generation_jobs
     set status = 'failed', error_code = 'timeout', finished_at = now()
   where creative_id = p_creative and kind = 'image' and status in ('queued', 'running')
     and started_at < now() - interval '5 minutes';

  select j.id into v_job from public.generation_jobs j
   where j.creative_id = p_creative and j.kind = 'image' and j.status in ('queued', 'running');
  if v_job is not null then
    return jsonb_build_object('job_id', v_job, 'reused', true);
  end if;

  begin
    insert into public.generation_jobs (organization_id, kind, status, brief_id, creative_id, correlation_id, created_by)
    values (v_org, 'image', 'running', v_brief, p_creative, p_correlation_id, (select auth.uid()))
    returning id into v_job;
  exception when unique_violation then
    select j.id into v_job from public.generation_jobs j
     where j.creative_id = p_creative and j.kind = 'image' and j.status in ('queued', 'running');
    return jsonb_build_object('job_id', v_job, 'reused', true);
  end;

  perform public.log_audit_event(v_org, 'creatives.image_requested', 'generation_job', v_job, p_correlation_id, '{}'::jsonb);
  return jsonb_build_object('job_id', v_job, 'reused', false);
end;
$$;

create function public.finish_image_job(
  p_job uuid,
  p_asset uuid,
  p_storage_path text,
  p_mime text,
  p_bytes integer,
  p_provider text,
  p_model text
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.generation_jobs%rowtype;
begin
  select * into v_job from public.generation_jobs j where j.id = p_job for update;
  if (select auth.uid()) is null or v_job.id is null or not private.is_org_member(v_job.organization_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v_job.kind <> 'image' or v_job.status <> 'running' then
    raise exception 'job_not_running' using errcode = 'P0001';
  end if;
  if p_storage_path !~ ('^' || v_job.organization_id || '/' || p_asset || '\.(jpg|png)$') then
    raise exception 'invalid_path' using errcode = 'P0001';
  end if;

  insert into public.assets (id, organization_id, kind, storage_path, mime, bytes, job_id, created_by)
  values (p_asset, v_job.organization_id, 'generated', p_storage_path, p_mime, p_bytes, p_job, (select auth.uid()));

  update public.creatives set image_asset_id = p_asset where id = v_job.creative_id;

  update public.generation_jobs
     set status = 'succeeded', finished_at = now(), provider = p_provider, model_id = p_model
   where id = p_job;

  perform public.log_audit_event(v_job.organization_id, 'creatives.image_generated', 'asset', p_asset,
    v_job.correlation_id, jsonb_build_object('provider', p_provider, 'model', p_model));
  return p_asset;
end;
$$;

-- Registra a foto já enviada ao Storage e coloca na peça. O cliente declarou ter direito de uso.
create function public.register_photo(
  p_creative uuid,
  p_asset uuid,
  p_storage_path text,
  p_mime text,
  p_bytes integer,
  p_correlation_id text default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
begin
  select c.organization_id into v_org from public.creatives c where c.id = p_creative;
  if (select auth.uid()) is null or v_org is null or not private.is_org_member(v_org) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_storage_path !~ ('^' || v_org || '/' || p_asset || '\.(jpg|png)$') then
    raise exception 'invalid_path' using errcode = 'P0001';
  end if;

  insert into public.assets (id, organization_id, kind, storage_path, mime, bytes, rights_confirmed_at, created_by)
  values (p_asset, v_org, 'photo', p_storage_path, p_mime, p_bytes, now(), (select auth.uid()));
  update public.creatives set image_asset_id = p_asset where id = p_creative;

  perform public.log_audit_event(v_org, 'creatives.photo_added', 'asset', p_asset, p_correlation_id,
    jsonb_build_object('rights_confirmed', true));
  return p_asset;
end;
$$;

revoke all on function public.start_image_job(uuid, text) from public, anon;
revoke all on function public.finish_image_job(uuid, uuid, text, text, integer, text, text) from public, anon;
revoke all on function public.register_photo(uuid, uuid, text, text, integer, text) from public, anon;
grant execute on function public.start_image_job(uuid, text) to authenticated;
grant execute on function public.finish_image_job(uuid, uuid, text, text, integer, text, text) to authenticated;
grant execute on function public.register_photo(uuid, uuid, text, text, integer, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Storage (só existe no Supabase; o Postgres puro do CI não tem o schema)
-- ---------------------------------------------------------------------------
create function private.storage_org_member(p_name text) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when split_part(p_name, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then private.is_org_member(split_part(p_name, '/', 1)::uuid)
    else false
  end
$$;
revoke all on function private.storage_org_member(text) from public;
grant execute on function private.storage_org_member(text) to authenticated;

do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('creative-assets', 'creative-assets', false, 10485760, array['image/jpeg', 'image/png'])
    on conflict (id) do nothing;

    create policy creative_assets_select on storage.objects for select to authenticated
      using (bucket_id = 'creative-assets' and private.storage_org_member(name));
    create policy creative_assets_insert on storage.objects for insert to authenticated
      with check (bucket_id = 'creative-assets' and private.storage_org_member(name));
    create policy creative_assets_delete on storage.objects for delete to authenticated
      using (bucket_id = 'creative-assets' and private.storage_org_member(name));
  end if;
end;
$$;
