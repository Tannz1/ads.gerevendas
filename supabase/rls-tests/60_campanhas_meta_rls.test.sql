-- Testes de RLS e guardrails para Campanhas e Conexão Meta (Milestone 3 / ADR 0004).

set role authenticated;

-- 1. Member (user_c na org_a) não pode conectar Meta
select tests.login(tests.id('user_c'));
select tests.throws(
  format($$select public.upsert_meta_connection(%L, 'act_1001', 'Conta A', 'page_1001', 'Página A')$$, tests.id('org_a')),
  '42501', 'member não conecta ativos Meta'
);

-- 2. Tentativa de publicar campanha sem conexão Meta conectada falha
select tests.login(tests.id('user_a'));
select public.approve_creative(tests.id('creative_a'), 'corr-approve-camp');

select tests.throws(
  format($$select public.publish_campaign_paused(
    %L, %L, 'Campanha Padaria', 'mensagens_whatsapp', 3000, 7, array[%L]::uuid[],
    'idemp_key_0001', 'ext_camp_1', 'ext_adset_1', true
  )$$, tests.id('org_a'), tests.id('strategy_a'), tests.id('creative_a')),
  'P0001', 'não publica campanha sem conexão Meta ativa'
);

-- 3. Owner (user_a) conecta ativos Meta em modo simulação
select public.upsert_meta_connection(
  tests.id('org_a'),
  'act_998877',
  'Padaria A Ads',
  'page_112233',
  'Padaria A Oficial',
  'ig_445566',
  '+5519999990000',
  true,
  true,
  'corr-meta'
);

select tests.eq((select count(*) from public.meta_connections where organization_id = tests.id('org_a') and status = 'connected'), 1, 'conexão Meta gravada para org_a');

-- Empresa B não vê conexão Meta de A
select tests.login(tests.id('user_b'));
select tests.eq((select count(*) from public.meta_connections where organization_id = tests.id('org_a')), 0, 'B não vê conexão Meta de A');

-- 4. Peça em rascunho não pode ser publicada em campanha
select tests.login(tests.id('user_a'));
insert into tests.ctx select 'draft_creative_a', id from public.creatives where organization_id = tests.id('org_a') and status = 'draft' limit 1;

select tests.throws(
  format($$select public.publish_campaign_paused(
    %L, %L, 'Campanha Rascunho', 'mensagens_whatsapp', 3000, 7, array[%L]::uuid[],
    'idemp_key_draft', 'ext_camp_d', 'ext_adset_d', true
  )$$, tests.id('org_a'), tests.id('strategy_a'), tests.id('draft_creative_a')),
  'P0001', 'peça não aprovada não pode entrar em campanha'
);

-- 5. Member não pode publicar campanha (exige owner)
select tests.login(tests.id('user_c'));
select tests.throws(
  format($$select public.publish_campaign_paused(
    %L, %L, 'Campanha Member', 'mensagens_whatsapp', 3000, 7, array[%L]::uuid[],
    'idemp_key_member', 'ext_camp_m', 'ext_adset_m', true
  )$$, tests.id('org_a'), tests.id('strategy_a'), tests.id('creative_a')),
  '42501', 'member não publica campanha nem autoriza orçamento'
);

-- 6. Owner publica campanha -> nasce obrigatoriamente PAUSED e é idempotente
select tests.login(tests.id('user_a'));
insert into tests.ctx
select 'campaign_a', (public.publish_campaign_paused(
  tests.id('org_a'), tests.id('strategy_a'), 'Campanha Café da Manhã', 'mensagens_whatsapp',
  2500, 7, array[tests.id('creative_a')]::uuid[], 'idemp_publish_001', 'sim_camp_1', 'sim_adset_1', true, 'corr-pub'
) ->> 'campaign_id')::uuid;

select tests.eq((select count(*) from public.campaigns where id = tests.id('campaign_a') and status = 'paused'), 1, 'campanha nasce obrigatoriamente PAUSED');

-- Replay com mesma idempotency_key devolve a mesma campanha sem duplicar
select tests.eq(
  (select ((public.publish_campaign_paused(
    tests.id('org_a'), tests.id('strategy_a'), 'Campanha Café da Manhã', 'mensagens_whatsapp',
    2500, 7, array[tests.id('creative_a')]::uuid[], 'idemp_publish_001', 'sim_camp_1', 'sim_adset_1', true
  )) ->> 'replayed')::boolean)::int,
  1, 'publish_campaign_paused é idempotente por idempotency_key'
);
select tests.eq((select count(*) from public.campaigns where organization_id = tests.id('org_a')), 1, 'replay não duplica campanha');

-- 7. Segunda confirmação para ativar: falha se orçamento divergente ou se for member
select tests.login(tests.id('user_c'));
select tests.throws(
  format($$select public.activate_campaign(%L, 2500, 7, 'idemp_act_member')$$, tests.id('campaign_a')),
  '42501', 'member não ativa campanha'
);

select tests.login(tests.id('user_a'));
select tests.throws(
  format($$select public.activate_campaign(%L, 9999, 7, 'idemp_act_wrong')$$, tests.id('campaign_a')),
  'P0001', 'activate_campaign rejeita orçamento divergente do snapshot aprovado'
);

-- Owner ativa com orçamento e duração exatos
select public.activate_campaign(tests.id('campaign_a'), 2500, 7, 'idemp_act_001', 'corr-act');
select tests.eq((select count(*) from public.campaigns where id = tests.id('campaign_a') and status = 'active'), 1, 'owner ativa campanha após confirmação');

-- Owner pausa campanha novamente
select public.pause_campaign(tests.id('campaign_a'), 'corr-pause');
select tests.eq((select count(*) from public.campaigns where id = tests.id('campaign_a') and status = 'paused'), 1, 'campanha volta para paused');

-- Empresa B não vê campanhas nem operações de A
select tests.login(tests.id('user_b'));
select tests.eq((select count(*) from public.campaigns where organization_id = tests.id('org_a')), 0, 'B não vê campanhas de A');
select tests.eq((select count(*) from public.publication_operations where organization_id = tests.id('org_a')), 0, 'B não vê operações de publicação de A');

reset role;
