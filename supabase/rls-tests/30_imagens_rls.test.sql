-- Imagens: assets, imagem da peça e jobs de imagem. Continua os cenários de 10 e 20
-- (org A com estratégia e peça `creative_a`, org B, user_c member de A).

set role authenticated;
select tests.login(tests.id('user_a'));

insert into tests.ctx values ('asset_a', gen_random_uuid());

select tests.throws(
  format($$select public.register_photo(%L, %L, %L, 'image/png', 1000)$$,
    tests.id('creative_a'), tests.id('asset_a'), tests.id('org_b') || '/' || tests.id('asset_a') || '.png'),
  'P0001', 'foto não vai para a pasta de outra org');

select public.register_photo(tests.id('creative_a'), tests.id('asset_a'),
  tests.id('org_a') || '/' || tests.id('asset_a') || '.png', 'image/png', 1000, 'corr-foto');
select tests.eq((select count(*) from public.creatives where id = tests.id('creative_a') and image_asset_id = tests.id('asset_a')), 1,
  'foto registrada vira imagem da peça');
select tests.eq((select count(*) from public.assets where kind = 'photo' and rights_confirmed_at is not null), 1,
  'foto guarda declaração de direito de uso');

select tests.throws(
  $$insert into public.assets (organization_id, kind, storage_path, mime, bytes) values (tests.id('org_a'), 'generated', 'x', 'image/png', 1)$$,
  '42501', 'asset não aceita insert direto');

-- Aprovar e trocar a imagem volta a rascunho.
select public.approve_creative(tests.id('creative_a'));
update public.creatives set image_asset_id = null where id = tests.id('creative_a');
select tests.eq((select count(*) from public.creatives where id = tests.id('creative_a') and status = 'draft'), 1,
  'trocar imagem de peça aprovada volta a rascunho');

-- Job de imagem: um ativo por peça; conclusão grava asset e liga à peça.
insert into tests.ctx select 'img_job', (public.start_image_job(tests.id('creative_a')) ->> 'job_id')::uuid;
select tests.eq((select count(*) from public.start_image_job(tests.id('creative_a')) r where (r ->> 'reused')::boolean), 1,
  'segundo pedido de imagem reaproveita o job');
insert into tests.ctx values ('asset_gen', gen_random_uuid());
select public.finish_image_job(tests.id('img_job'), tests.id('asset_gen'),
  tests.id('org_a') || '/' || tests.id('asset_gen') || '.jpg', 'image/jpeg', 2000, 'openai', 'gpt-image-2.5-flare');
select tests.eq((select count(*) from public.creatives where id = tests.id('creative_a') and image_asset_id = tests.id('asset_gen')), 1,
  'imagem gerada vira imagem da peça');

-- ---------------------------------------------------------------- B não acessa A
select tests.login(tests.id('user_b'));
select tests.eq((select count(*) from public.assets), 0, 'B não vê assets de A');
select tests.throws(format($$select public.start_image_job(%L)$$, tests.id('creative_a')), '42501', 'B não gera imagem na peça de A');
insert into tests.ctx values ('asset_b', gen_random_uuid());
select tests.throws(
  format($$select public.register_photo(%L, %L, %L, 'image/png', 10)$$,
    tests.id('creative_a'), tests.id('asset_b'), tests.id('org_a') || '/' || tests.id('asset_b') || '.png'),
  '42501', 'B não coloca foto na peça de A');

-- ---------------------------------------------------------------- member
select tests.login(tests.id('user_c'));
select tests.eq((select count(*) from public.assets), 2, 'member vê assets da org');

reset role;

-- Storage (como postgres, ainda com o login de B): só quando o schema existe (Supabase).
select tests.login(tests.id('user_b'));
do $$
begin
  if to_regclass('storage.objects') is not null then
    perform tests.eq((select count(*) from storage.buckets where id = 'creative-assets' and not public), 1, 'bucket privado existe');
    perform tests.eq(
      (select count(*)::bigint from (select private.storage_org_member(tests.id('org_a') || '/x.png') as ok) t where not ok), 1,
      'B não tem acesso à pasta de A no Storage');
  end if;
end;
$$;

