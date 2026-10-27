-- Vídeo com avatar (ADR 0008): job, consentimento, créditos, vídeo da peça e ID da Meta.
-- Continua os cenários anteriores (org A com `creative_a`, org B, user_c member de A, `campaign_real`).

set role authenticated;
select tests.login(tests.id('user_a'));

insert into tests.ctx values ('avatar_photo', gen_random_uuid());

select tests.throws(
  format($$select public.start_video_job(%L, 'Oi', 'voz1', %L, %L, 'image/jpeg', 100, false)$$,
    tests.id('creative_a'), tests.id('avatar_photo'), tests.id('org_a') || '/' || tests.id('avatar_photo') || '.jpg'),
  'P0001', 'sem consentimento de uso do rosto não abre job');
select tests.throws(
  format($$select public.start_video_job(%L, 'Oi', 'voz1', %L, %L, 'image/jpeg', 100, true)$$,
    tests.id('creative_a'), tests.id('avatar_photo'), tests.id('org_b') || '/' || tests.id('avatar_photo') || '.jpg'),
  'P0001', 'foto do avatar não vai para a pasta de outra org');

insert into tests.ctx select 'video_job', (public.start_video_job(tests.id('creative_a'), ' Venha conhecer. ', 'voz1',
  tests.id('avatar_photo'), tests.id('org_a') || '/' || tests.id('avatar_photo') || '.jpg', 'image/jpeg', 100, true,
  'corr-video') ->> 'job_id')::uuid;
select tests.eq((select count(*) from public.generation_jobs where id = tests.id('video_job')
  and kind = 'video' and billable and input ->> 'script' = 'Venha conhecer.'), 1, 'job de vídeo é cobrável e guarda o roteiro');
select tests.eq((select count(*) from public.assets where id = tests.id('avatar_photo') and rights_confirmed_at is not null), 1,
  'foto do avatar guarda declaração de direito de uso');
select tests.eq((select count(*) from public.usage_ledger where job_id = tests.id('video_job') and resource = 'video' and entry = 'reserve'), 1,
  'job de vídeo reserva crédito');
insert into tests.ctx values ('avatar_photo_2', gen_random_uuid());
select tests.eq((select count(*) from public.start_video_job(tests.id('creative_a'), 'Outro', 'voz1', tests.id('avatar_photo_2'),
  tests.id('org_a') || '/' || tests.id('avatar_photo_2') || '.jpg', 'image/jpeg', 100, true) r where (r ->> 'reused')::boolean), 1,
  'segundo pedido reaproveita o job ativo');

select tests.throws(format($$select public.finish_video_job(%L, %L, 1000, 'elevenlabs', 'creatify-aurora')$$,
  tests.id('video_job'), tests.id('org_a') || '/' || tests.id('video_job') || '.mp4'),
  'P0001', 'não conclui sem o ID da geração externa');
select public.set_video_generation(tests.id('video_job'), 'gen_1');
select tests.throws(format($$select public.set_video_generation(%L, 'gen_2')$$, tests.id('video_job')),
  'P0001', 'ID da geração externa não é sobrescrito');
select tests.throws(format($$select public.finish_video_job(%L, %L, 1000, 'elevenlabs', 'creatify-aurora')$$,
  tests.id('video_job'), tests.id('org_a') || '/' || gen_random_uuid() || '.mp4'),
  'P0001', 'vídeo só vai para o caminho do próprio job');

select public.approve_creative(tests.id('creative_a'));
select public.finish_video_job(tests.id('video_job'), tests.id('org_a') || '/' || tests.id('video_job') || '.mp4',
  1000, 'elevenlabs', 'creatify-aurora');
select tests.eq((select count(*) from public.creatives where id = tests.id('creative_a')
  and video_id = tests.id('video_job') and status = 'draft'), 1, 'vídeo entra na peça e ela volta a rascunho');
select tests.eq((select count(*) from public.usage_ledger where job_id = tests.id('video_job') and entry = 'commit'), 1,
  'sucesso consome o crédito');
select tests.eq((select count(*) from public.credit_summary(tests.id('org_a')) s
  where (s -> 'video' ->> 'used')::int = 1), 1, 'resumo de créditos mostra vídeo');

select tests.throws(
  $$insert into public.videos (id, organization_id, job_id, storage_path, bytes, script, voice_id, photo_asset_id, provider, model_id, likeness_consent_at)
    values (gen_random_uuid(), tests.id('org_a'), tests.id('video_job'), 'x', 1, 'x', 'x', tests.id('avatar_photo'), 'x', 'x', now())$$,
  '42501', 'vídeo não aceita insert direto');

-- ---------------------------------------------------------------- B não acessa A
select tests.login(tests.id('user_b'));
select tests.eq((select count(*) from public.videos), 0, 'B não vê vídeos de A');
select tests.throws(format($$select public.start_video_job(%L, 'Oi', 'voz1', %L, %L, 'image/jpeg', 100, true)$$,
  tests.id('creative_a'), tests.id('avatar_photo_2'), tests.id('org_a') || '/' || tests.id('avatar_photo_2') || '.jpg'),
  '42501', 'B não gera vídeo na peça de A');
select tests.throws(format($$select public.set_video_generation(%L, 'gen_x')$$, tests.id('video_job')),
  '42501', 'B não mexe no job de A');

-- ---------------------------------------------------------------- member
select tests.login(tests.id('user_c'));
select tests.eq((select count(*) from public.videos), 1, 'member vê vídeos da org');

-- ---------------------------------------------------------------- publicação
reset role;
set role service_role;
select public.meta_record_publication(tests.id('campaign_real'), jsonb_build_object('creatives', jsonb_build_array(
  jsonb_build_object('creative_id', tests.id('creative_a'), 'external_video_id', '120099'))));
reset role;
select tests.eq((select count(*) from public.campaign_creatives where campaign_id = tests.id('campaign_real')
  and creative_id = tests.id('creative_a') and external_video_id = '120099' and image_hash = 'abc123'), 1,
  'ID do vídeo na Meta é gravado sem apagar os demais');

do $$
begin
  if to_regclass('storage.objects') is not null then
    perform tests.eq((select count(*) from storage.buckets where id = 'creative-videos' and not public), 1, 'bucket de vídeos privado existe');
  end if;
end;
$$;
