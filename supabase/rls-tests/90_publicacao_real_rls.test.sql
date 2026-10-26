-- Testes de RLS e guardrails da publicação real e do acompanhamento (ADR 0006).
-- Roda depois de 60 (org_a conectada em Simulação, creative_a aprovada, campaign_a simulada) e 80
-- (operador, org_d na fila de espera do estoque real).

reset role;
grant select on public.campaigns, public.campaign_creatives, public.campaign_insights to service_role;

set role authenticated;

-- 1. Ativar não inventa aprovação da Meta (campaign_a foi ativada no teste 60)
select tests.eq((select count(*) from public.campaigns
  where id = tests.id('campaign_a') and meta_review_status = 'approved'), 0, 'ativação não marca aprovada pela Meta');

-- 2. Publicação simulada continua simulada mesmo se pedirem p_simulated = false
select tests.login(tests.id('user_a'));
insert into tests.ctx
select 'campaign_sim2', (public.publish_campaign_paused(
  tests.id('org_a'), tests.id('strategy_a'), 'Campanha Simulada 2', 'mensagens_whatsapp',
  2000, 5, array[tests.id('creative_a')]::uuid[], 'idemp_sim_real_flag', 'x_camp', 'x_adset', false
) ->> 'campaign_id')::uuid;
select tests.eq((select count(*) from public.campaigns where id = tests.id('campaign_sim2') and simulated), 1,
  'RPC simulado nunca grava campanha como real');

-- 3. Publicação real exige conexão real
select tests.throws(
  format($$select public.start_real_publication(%L, %L, 'Campanha Real', 'trafego_site', 3000, 7, array[%L]::uuid[], 'idemp_real_0001')$$,
    tests.id('org_a'), tests.id('strategy_a'), tests.id('creative_a')),
  'P0001', 'publicação real exige conexão real'
);

reset role;
update public.meta_connections set simulated = false where organization_id = tests.id('org_a');
set role authenticated;

-- 4. member não inicia publicação real
select tests.login(tests.id('user_c'));
select tests.throws(
  format($$select public.start_real_publication(%L, %L, 'Campanha Real', 'trafego_site', 3000, 7, array[%L]::uuid[], 'idemp_real_0001')$$,
    tests.id('org_a'), tests.id('strategy_a'), tests.id('creative_a')),
  '42501', 'member não inicia publicação real'
);

-- 5. owner inicia: nasce em rascunho, real, sem IDs; repetir devolve a mesma
select tests.login(tests.id('user_a'));
insert into tests.ctx
select 'campaign_real', (public.start_real_publication(
  tests.id('org_a'), tests.id('strategy_a'), 'Campanha Real', 'trafego_site', 3000, 7,
  array[tests.id('creative_a')]::uuid[], 'idemp_real_0001', 'corr-real'
) ->> 'campaign_id')::uuid;
select tests.eq((select count(*) from public.campaigns where id = tests.id('campaign_real')
  and status = 'draft' and not simulated and external_campaign_id is null), 1, 'publicação real começa em rascunho');
select tests.eq((select count(*) from public.campaigns where id = (public.start_real_publication(
  tests.id('org_a'), tests.id('strategy_a'), 'Campanha Real', 'trafego_site', 3000, 7,
  array[tests.id('creative_a')]::uuid[], 'idemp_real_0001') ->> 'campaign_id')::uuid), 1, 'repetir devolve a mesma campanha');
select tests.eq((select count(*) from public.campaigns where organization_id = tests.id('org_a') and not simulated), 1,
  'repetir não duplica');

-- 6. owner não grava IDs nem conclui a publicação
select tests.throws(format($$select public.meta_record_publication(%L, '{"external_campaign_id":"1"}'::jsonb)$$,
  tests.id('campaign_real')), '42501', 'cliente não grava IDs da Meta');
select tests.throws(format($$select public.meta_finish_publication(%L)$$, tests.id('campaign_real')),
  '42501', 'cliente não conclui publicação');

-- 7. Servidor: concluir sem todos os IDs falha; com IDs fica pausada e em análise
reset role;
set role service_role;
select tests.throws(format($$select public.meta_finish_publication(%L)$$, tests.id('campaign_real')),
  'P0001', 'não conclui sem os IDs da Meta');
select public.meta_record_publication(tests.id('campaign_real'),
  '{"external_campaign_id":"120001","external_adset_id":"120002"}'::jsonb);
select public.meta_record_publication(tests.id('campaign_real'), jsonb_build_object('creatives', jsonb_build_array(
  jsonb_build_object('creative_id', tests.id('creative_a'), 'image_hash', 'abc123',
                     'external_creative_id', '120003', 'external_ad_id', '120004'))));
select public.meta_finish_publication(tests.id('campaign_real'), 'corr-fin');
select tests.eq((select count(*) from public.campaigns where id = tests.id('campaign_real')
  and status = 'paused' and meta_review_status = 'pending_review' and external_adset_id = '120002'), 1,
  'publicação concluída fica pausada e em análise');

-- 8. Campanha real só é ativada/pausada pelo servidor, com o dono como responsável
reset role;
set role authenticated;
select tests.login(tests.id('user_a'));
select tests.throws(format($$select public.activate_campaign(%L, 3000, 7, 'idemp_real_act_direct')$$, tests.id('campaign_real')),
  'P0001', 'campanha real não é ativada direto pelo navegador');

reset role;
set role service_role;
select tests.throws(
  format($$select public.meta_activate_campaign(%L, %L, 3000, 7, 'idemp_real_act_member')$$, tests.id('campaign_real'), tests.id('user_c')),
  '42501', 'member não autoriza ativação real');
select tests.throws(
  format($$select public.meta_activate_campaign(%L, %L, 9999, 7, 'idemp_real_act_wrong')$$, tests.id('campaign_real'), tests.id('user_a')),
  'P0001', 'ativação real confere o orçamento confirmado');
select public.meta_activate_campaign(tests.id('campaign_real'), tests.id('user_a'), 3000, 7, 'idemp_real_act_ok', 'corr-act');
select tests.eq((select count(*) from public.campaigns where id = tests.id('campaign_real')
  and status = 'active' and meta_review_status = 'pending_review'), 1, 'ativação real não muda o status de revisão');
select public.meta_pause_campaign(tests.id('campaign_real'), tests.id('user_a'), 'corr-pause');
select tests.eq((select count(*) from public.campaigns where id = tests.id('campaign_real') and status = 'paused'), 1,
  'pausa real registrada');

-- 9. Revisão e métricas vindas da Meta
select public.meta_set_campaign_review(tests.id('campaign_real'), 'approved');
select public.meta_record_insights(tests.id('campaign_real'), 1234, 5000, 3000, 120, 7);
select tests.eq(public.meta_touch_campaign_sync(tests.id('campaign_real'), 60)::int, 1, 'primeira sincronização liberada');
select tests.eq(public.meta_touch_campaign_sync(tests.id('campaign_real'), 60)::int, 0, 'sincronização repetida em 60 s bloqueada');

reset role;
set role authenticated;
select tests.login(tests.id('user_a'));
select tests.eq((select spend_cents from public.campaign_insights where campaign_id = tests.id('campaign_real')), 1234,
  'A vê as métricas da própria campanha');
select tests.throws(format($$select public.meta_record_insights(%L, 1, 1, 1, 1, 1)$$, tests.id('campaign_real')),
  '42501', 'cliente não grava métricas');
select tests.login(tests.id('user_b'));
select tests.eq((select count(*) from public.campaign_insights where campaign_id = tests.id('campaign_real')), 0,
  'B não vê métricas de A');

-- 10. Conta desativada pela Meta derruba a conexão
reset role;
set role service_role;
select public.meta_set_ad_account_status(tests.id('org_a'), 'error', 'corr-disabled');
select tests.eq((select count(*) from public.meta_connections
  where organization_id = tests.id('org_a') and ad_account_status = 'error' and status = 'disconnected'), 1,
  'conta desativada desconecta a empresa');

-- 11. Conta nova no estoque atende a fila de espera
reset role;
set role authenticated;
select tests.login(tests.id('operator'));
select public.register_pool_accounts('[{"ad_account_id":"act_7770001","name":"Estoque real 1"}]'::jsonb, false, 'imported');
select tests.eq((select count(*) from public.meta_ad_account_pool
  where ad_account_id = 'act_7770001' and organization_id = tests.id('org_d') and status = 'assigned'), 1,
  'conta nova vai para quem estava na fila');
-- O operador não lê conexões das empresas (RLS); a conferência é feita fora da sessão dele.
reset role;
select tests.eq((select count(*) from public.meta_connections
  where organization_id = tests.id('org_d') and ad_account_status = 'done' and pool_requested_at is null), 1,
  'empresa sai da fila com a conta');

reset role;
