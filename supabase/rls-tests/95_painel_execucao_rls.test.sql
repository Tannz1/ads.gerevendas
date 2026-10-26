-- Complementa 90: isolamento do painel, trava e intenções duráveis.
reset role;
set role authenticated;
select tests.login(tests.id('user_b'));
select tests.eq((select count(*) from public.campaigns where id = tests.id('campaign_real')), 0,
  'painel de B não acessa campanha de A');
select tests.eq((select count(*) from public.meta_ad_account_pool where organization_id = tests.id('org_a')), 0,
  'B não acessa conta atribuída a A');
select tests.throws(format($$select public.meta_claim_execution(%L, gen_random_uuid())$$, tests.id('campaign_real')),
  '42501', 'cliente não controla trava de execução');
select tests.throws(format($$select public.meta_begin_publication_step(%L, 'campaign')$$, tests.id('campaign_real')),
  '42501', 'cliente não altera intenções de publicação');
select tests.throws('select * from public.meta_publication_snapshots', '42501', 'snapshot não fica exposto ao cliente');
select tests.throws(format($$select public.meta_check_activation(%L, %L, 3000, 7, 'check')$$,
  tests.id('campaign_real'), tests.id('user_a')), '42501', 'cliente não chama preflight privilegiado');

reset role;
set role service_role;
select tests.throws(format($$select public.meta_check_activation(%L, %L, 3000, 7, 'new_auth')$$,
  tests.id('campaign_real'), tests.id('user_b')), '42501', 'dono de outra empresa não autoriza ativação');
select tests.throws(format($$select public.meta_check_activation(%L, %L, 3000, 7, 'idemp_real_act_ok')$$,
  tests.id('campaign_real'), tests.id('user_a')), 'P0001', 'autorização já usada não é reutilizada');
select public.meta_set_ad_account_status(tests.id('org_a'), 'done', 'corr-recovered');
select tests.eq((public.meta_check_activation(tests.id('campaign_real'), tests.id('user_a'), 3000, 7, 'new_authorization') is not null)::int,
  1, 'autorização válida confere conta original e conexão antes da Meta');
select tests.throws(format($$select public.meta_check_activation(%L, %L, 9000, 7, 'wrong_budget')$$,
  tests.id('campaign_real'), tests.id('user_a')), 'P0001', 'preflight impede orçamento divergente antes da Meta');
select tests.eq(public.meta_claim_execution(tests.id('campaign_real'), '10000000-0000-0000-0000-000000000001')::int, 1,
  'primeira execução adquire trava');
select tests.eq(public.meta_claim_execution(tests.id('campaign_real'), '10000000-0000-0000-0000-000000000002')::int, 0,
  'segunda execução não adquire a mesma trava');
reset role;
set role authenticated;
select tests.login(tests.id('user_b'));
select tests.eq((select count(*) from public.meta_execution_overview(tests.id('org_a'))), 0,
  'execuções de A não aparecem para B');
select tests.login(tests.id('user_a'));
select tests.eq((select count(*) from public.meta_execution_overview(tests.id('org_a'))), 1,
  'A vê operação pendente sem receber o token');
reset role;
set role service_role;
select public.meta_release_execution(tests.id('campaign_real'), '10000000-0000-0000-0000-000000000002');
select tests.eq(public.meta_claim_execution(tests.id('campaign_real'), '10000000-0000-0000-0000-000000000003')::int, 0,
  'token errado não libera a execução');
select public.meta_release_execution(tests.id('campaign_real'), '10000000-0000-0000-0000-000000000001');
select tests.eq(public.meta_claim_execution(tests.id('campaign_real'), '10000000-0000-0000-0000-000000000003')::int, 1,
  'depois da liberação outra execução pode entrar');
select public.meta_release_execution(tests.id('campaign_real'), '10000000-0000-0000-0000-000000000003');
select public.meta_freeze_publication(tests.id('campaign_real'), '{"name":"original"}');
select tests.eq((public.meta_freeze_publication(tests.id('campaign_real'), '{"name":"alterado"}') ->> 'name' = 'original')::int, 1,
  'retomada preserva snapshot original');

reset role;
update public.campaigns set status = 'draft' where id = tests.id('campaign_real');
set role service_role;
select public.meta_begin_publication_step(tests.id('campaign_real'), 'campaign');
select tests.throws(format($$select public.meta_begin_publication_step(%L, 'campaign')$$, tests.id('campaign_real')),
  'P0001', 'resposta incerta não permite repetir escrita externa');
select public.meta_record_publication(tests.id('campaign_real'), '{"external_campaign_id":"120001"}');
reset role;
select tests.eq((select confirmed::int from public.meta_publication_steps
  where campaign_id = tests.id('campaign_real') and step = 'campaign'), 1,
  'registro do ID confirma intenção na mesma transação');
update public.campaigns set status = 'paused' where id = tests.id('campaign_real');
reset role;
