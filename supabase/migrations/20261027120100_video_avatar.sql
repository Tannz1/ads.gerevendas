-- GereVendas Ads — vídeo com avatar falante (ADR 0008), parte 2. Migration aditiva.
-- Guardrails:
-- 1. A foto do avatar exige declaração de direito de uso e consentimento de uso do rosto.
-- 2. Vídeo é sempre cobrável (provedor real; não existe vídeo simulado) e tem limite mensal.
-- 3. A ElevenLabs cobra ao criar a geração: o ID externo é gravado para nunca recriar a mesma.
-- Arquivos no Storage privado `creative-videos` em `{organization_id}/{video_id}.mp4`.

-- ---------------------------------------------------------------------------
-- 1. Jobs de vídeo
-- ---------------------------------------------------------------------------
alter table public.generation_jobs
  add column external_generation_id text check (char_length(external_generation_id) between 1 and 128),
  add column input jsonb check (input is null or jsonb_typeof(input) = 'object');

alter table public.generation_jobs add constraint generation_jobs_video_has_creative
  check (kind <> 'video' or creative_id is not null);
create unique index generation_jobs_one_active_video on public.generation_jobs (creative_id)
  where kind = 'video' and status in ('queued', 'running');

create or replace function private.generation_jobs_image_billable() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if new.kind in ('image', 'video') then
    new.billable := true;
  end if;
  return new;
end;
$$;

create or replace function private.credit_limit(p_resource public.credit_resource) returns integer
language sql immutable set search_path = ''
as $$ select case p_resource when 'strategy' then 100 when 'image' then 200 when 'video' then 20 end $$;

create or replace function public.credit_summary(p_org uuid) returns jsonb
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
    'video', jsonb_build_object('used', private.credits_used(p_org, 'video', v_period), 'limit', private.credit_limit('video')),
    'tokens', (
      select coalesce(sum(coalesce(j.input_tokens, 0) + coalesce(j.output_tokens, 0)), 0)
      from public.generation_jobs j
      where j.organization_id = p_org
        and to_char(j.created_at at time zone 'America/Sao_Paulo', 'YYYY-MM') = v_period
    )
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Vídeos
-- ---------------------------------------------------------------------------
create table public.videos (
  id uuid primary key,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  job_id uuid not null,
  storage_path text not null unique check (storage_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.mp4$'),
  bytes integer not null check (bytes between 1 and 52428800),
  script text not null check (char_length(script) between 1 and 600),
  voice_id text not null check (char_length(voice_id) between 1 and 64),
  photo_asset_id uuid not null,
  provider text not null check (char_length(provider) <= 20),
  model_id text not null check (char_length(model_id) <= 80),
  likeness_consent_at timestamptz not null,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (id, organization_id),
  check (split_part(storage_path, '/', 1) = organization_id::text),
  foreign key (job_id, organization_id) references public.generation_jobs (id, organization_id) on delete cascade,
  foreign key (photo_asset_id, organization_id) references public.assets (id, organization_id) on delete cascade
);

alter table public.creatives add column video_id uuid;
alter table public.creatives add constraint creatives_video_fk
  foreign key (video_id, organization_id) references public.videos (id, organization_id)
  on delete set null (video_id);

-- Trocar ou tirar o vídeo de uma peça aprovada também volta a rascunho.
create or replace function private.creatives_on_update() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  if (new.content is distinct from old.content
      or new.image_asset_id is distinct from old.image_asset_id
      or new.video_id is distinct from old.video_id)
     and old.status = 'approved' then
    new.status := 'draft';
    new.approved_by := null;
    new.approved_at := null;
  end if;
  return new;
end;
$$;

revoke all on public.videos from anon, authenticated, public;
grant select on public.videos to authenticated;
-- Editor pode tirar o vídeo da peça (null) ou trocar por um vídeo da mesma org (FK composta).
grant update (video_id) on public.creatives to authenticated;

alter table public.videos enable row level security;
create policy videos_select on public.videos
  for select to authenticated using (private.is_org_member(organization_id));

-- ---------------------------------------------------------------------------
-- 3. RPCs do job de vídeo (sessão do usuário, como os jobs de imagem)
-- ---------------------------------------------------------------------------

-- Registra a foto do avatar (já no Storage) e abre o job. Um job ativo por peça.
create function public.start_video_job(
  p_creative uuid,
  p_script text,
  p_voice_id text,
  p_photo_asset uuid,
  p_photo_path text,
  p_photo_mime text,
  p_photo_bytes integer,
  p_likeness_consent boolean,
  p_correlation_id text default null
) returns jsonb
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
  if p_likeness_consent is not true then
    raise exception 'likeness_consent_required' using errcode = 'P0001';
  end if;
  if char_length(coalesce(trim(p_script), '')) not between 1 and 600
     or char_length(coalesce(p_voice_id, '')) not between 1 and 64 then
    raise exception 'invalid_input' using errcode = 'P0001';
  end if;
  if p_photo_path !~ ('^' || v_org || '/' || p_photo_asset || '\.(jpg|png)$') then
    raise exception 'invalid_path' using errcode = 'P0001';
  end if;

  -- Sem ID externo após 5 min: a criação não chegou à ElevenLabs (ou o processo caiu antes).
  update public.generation_jobs
     set status = 'failed', error_code = 'timeout', finished_at = now()
   where creative_id = p_creative and kind = 'video' and status in ('queued', 'running')
     and external_generation_id is null and started_at < now() - interval '5 minutes';

  select j.id into v_job from public.generation_jobs j
   where j.creative_id = p_creative and j.kind = 'video' and j.status in ('queued', 'running');
  if v_job is not null then
    return jsonb_build_object('job_id', v_job, 'reused', true);
  end if;

  begin
    insert into public.generation_jobs (organization_id, kind, status, brief_id, creative_id, correlation_id, created_by, input)
    values (v_org, 'video', 'running', v_brief, p_creative, p_correlation_id, (select auth.uid()),
            jsonb_build_object('script', trim(p_script), 'voice_id', p_voice_id, 'photo_asset_id', p_photo_asset,
                               'likeness_consent_at', now()))
    returning id into v_job;
  exception when unique_violation then
    select j.id into v_job from public.generation_jobs j
     where j.creative_id = p_creative and j.kind = 'video' and j.status in ('queued', 'running');
    return jsonb_build_object('job_id', v_job, 'reused', true);
  end;

  insert into public.assets (id, organization_id, kind, storage_path, mime, bytes, rights_confirmed_at, job_id, created_by)
  values (p_photo_asset, v_org, 'photo', p_photo_path, p_photo_mime, p_photo_bytes, now(), v_job, (select auth.uid()));

  perform public.log_audit_event(v_org, 'creatives.video_requested', 'generation_job', v_job, p_correlation_id,
    jsonb_build_object('voice_id', p_voice_id, 'likeness_consent', true));
  return jsonb_build_object('job_id', v_job, 'reused', false);
end;
$$;

-- Grava o ID da geração na ElevenLabs assim que ela responde. Nunca sobrescreve.
create function public.set_video_generation(p_job uuid, p_generation_id text) returns void
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
     set external_generation_id = p_generation_id
   where id = p_job and kind = 'video' and status = 'running' and external_generation_id is null;
  if not found then
    raise exception 'job_not_running' using errcode = 'P0001';
  end if;
end;
$$;

-- Conclui: o ID do vídeo é o ID do job (duas conclusões simultâneas não criam dois vídeos).
create function public.finish_video_job(
  p_job uuid,
  p_storage_path text,
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
  if v_job.kind <> 'video' or v_job.status <> 'running' or v_job.external_generation_id is null then
    raise exception 'job_not_running' using errcode = 'P0001';
  end if;
  if p_storage_path <> (v_job.organization_id || '/' || v_job.id || '.mp4') then
    raise exception 'invalid_path' using errcode = 'P0001';
  end if;

  insert into public.videos (id, organization_id, job_id, storage_path, bytes, script, voice_id, photo_asset_id,
                             provider, model_id, likeness_consent_at, created_by)
  values (v_job.id, v_job.organization_id, v_job.id, p_storage_path, p_bytes, v_job.input ->> 'script',
          v_job.input ->> 'voice_id', (v_job.input ->> 'photo_asset_id')::uuid, p_provider, p_model,
          (v_job.input ->> 'likeness_consent_at')::timestamptz, v_job.created_by);

  update public.creatives set video_id = v_job.id where id = v_job.creative_id;

  update public.generation_jobs
     set status = 'succeeded', finished_at = now(), provider = p_provider, model_id = p_model
   where id = p_job;

  perform public.log_audit_event(v_job.organization_id, 'creatives.video_generated', 'video', v_job.id,
    v_job.correlation_id, jsonb_build_object('provider', p_provider, 'model', p_model));
  return v_job.id;
end;
$$;

revoke all on function public.start_video_job(uuid, text, text, uuid, text, text, integer, boolean, text) from public, anon;
revoke all on function public.set_video_generation(uuid, text) from public, anon;
revoke all on function public.finish_video_job(uuid, text, integer, text, text) from public, anon;
grant execute on function public.start_video_job(uuid, text, text, uuid, text, text, integer, boolean, text) to authenticated;
grant execute on function public.set_video_generation(uuid, text) to authenticated;
grant execute on function public.finish_video_job(uuid, text, integer, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Publicação: ID do vídeo na Meta por peça
-- ---------------------------------------------------------------------------
alter table public.campaign_creatives
  add column external_video_id text check (char_length(external_video_id) between 1 and 128);

create or replace function private.meta_record_publication(p_campaign uuid, p_payload jsonb) returns void
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
           external_video_id = coalesce(v_item ->> 'external_video_id', external_video_id),
           external_creative_id = coalesce(v_item ->> 'external_creative_id', external_creative_id),
           external_ad_id = coalesce(v_item ->> 'external_ad_id', external_ad_id)
     where campaign_id = p_campaign and creative_id = (v_item ->> 'creative_id')::uuid;
  end loop;
end;
$$;
revoke all on function private.meta_record_publication(uuid, jsonb) from public, anon, authenticated, service_role;

create or replace function public.meta_record_publication(p_campaign uuid, p_payload jsonb) returns void
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
      (item ? 'external_video_id' and step = 'video:' || (item ->> 'creative_id')) or
      (item ? 'external_creative_id' and step = 'creative:' || (item ->> 'creative_id')) or
      (item ? 'external_ad_id' and step = 'ad:' || (item ->> 'creative_id'))
    );
  end loop;
end; $$;
revoke all on function public.meta_record_publication(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.meta_record_publication(uuid, jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- 5. Storage (só existe no Supabase; o Postgres puro do CI não tem o schema)
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('creative-videos', 'creative-videos', false, 52428800, array['video/mp4'])
    on conflict (id) do nothing;

    create policy creative_videos_select on storage.objects for select to authenticated
      using (bucket_id = 'creative-videos' and private.storage_org_member(name));
    create policy creative_videos_insert on storage.objects for insert to authenticated
      with check (bucket_id = 'creative-videos' and private.storage_org_member(name));
    create policy creative_videos_delete on storage.objects for delete to authenticated
      using (bucket_id = 'creative-videos' and private.storage_org_member(name));
  end if;
end;
$$;
