-- Testes de RLS e guardrails do estoque de contas e dos passos Meta (ADR 0005).
-- Roda depois de 10..70: usa user_a (owner org_a), user_b (owner org_b), user_c (member org_a).

reset role;
grant usage on schema tests to service_role;
grant select on tests.ctx to service_role;
-- O Supabase concede leitura das tabelas ao service_role; o stub de teste não.
grant select on public.meta_connections to service_role;
insert into tests.ctx values ('operator', gen_random_uuid()), ('user_d', gen_random_uuid());
insert into auth.users (id, email) values
  (tests.id('operator'), 'operador@gerevendas.test'),
  (tests.id('user_d'), 'dona.d@empresa.test');
insert into private.platform_operators (user_id) values (tests.id('operator'));

set role authenticated;

-- 1. Cliente não registra contas no estoque
select tests.login(tests.id('user_a'));
select tests.throws(
  $$select public.register_pool_accounts('[{"ad_account_id":"act_5550001","name":"Estoque 1"}]'::jsonb, true, 'imported')$$,
  '42501', 'cliente não registra contas no estoque'
);

-- 2. Operador registra 2 contas simuladas; repetir não duplica
select tests.login(tests.id('operator'));
select tests.eq(public.register_pool_accounts(
  '[{"ad_account_id":"act_5550001","name":"Estoque 1"},{"ad_account_id":"act_5550002","name":"Estoque 2"}]'::jsonb,
  true, 'imported', 'corr-reg')::bigint, 2, 'operador registra 2 contas');
select tests.eq(public.register_pool_accounts(
  '[{"ad_account_id":"act_5550001","name":"Estoque 1"}]'::jsonb, true, 'imported')::bigint, 0, 'registrar de novo não duplica');
select tests.eq((select count(*) from public.meta_ad_account_pool), 2, 'operador vê todo o estoque');
select tests.eq(public.am_i_platform_operator()::int, 1, 'operador é reconhecido');

-- 3. Cliente não vê contas livres do estoque e não é operador
select tests.login(tests.id('user_b'));
select tests.eq((select count(*) from public.meta_ad_account_pool), 0, 'cliente sem conta não vê o estoque');
select tests.eq(public.am_i_platform_operator()::int, 0, 'cliente não é operador');
select tests.throws($$select public.meta_pool_overview(true)$$, '42501', 'cliente não vê o painel do estoque');

-- 4. member não pede conta
select tests.login(tests.id('user_c'));
select tests.throws(
  format($$select public.assign_pool_account(%L, true)$$, tests.id('org_a')),
  '42501', 'member não pede conta do estoque'
);

-- 5. Owner de B recebe conta; pedir de novo devolve a mesma
select tests.login(tests.id('user_b'));
select public.assign_pool_account(tests.id('org_b'), true, 'corr-assign-b');
select tests.eq((select count(*) from public.meta_ad_account_pool
  where organization_id = tests.id('org_b') and status = 'assigned'), 1, 'B recebe 1 conta');
select tests.eq((select count(*) from public.meta_ad_account_pool
  where organization_id = tests.id('org_b')
    and ad_account_id = (public.assign_pool_account(tests.id('org_b'), true) ->> 'ad_account_id')),
  1, 'pedir de novo devolve a mesma conta');
select tests.eq((select count(*) from public.meta_ad_account_pool), 1, 'B vê só a própria conta');
select tests.eq((select count(*) from public.meta_connections
  where organization_id = tests.id('org_b') and ad_account_status = 'done' and status = 'disconnected'),
  1, 'B tem conta mas ainda não está conectada');

-- 6. Sem conta real no estoque: fila de espera
reset role;
set role authenticated;
select tests.login(tests.id('user_d'));
insert into tests.ctx select 'org_d', public.create_organization('Empresa D');
select tests.eq(((public.assign_pool_account(tests.id('org_d'), false)) ->> 'pool_empty')::boolean::int, 1, 'estoque real vazio');
select tests.eq((select count(*) from public.meta_connections
  where organization_id = tests.id('org_d') and pool_requested_at is not null), 1, 'D entra na fila de espera');

-- 7. Cliente não grava a "verdade da Meta" direto
select tests.login(tests.id('user_b'));
select tests.throws(format($$select public.meta_set_billing(%L, true)$$, tests.id('org_b')),
  '42501', 'cliente não marca pagamento como verificado');
select tests.throws(format($$select public.meta_set_page(%L, 'done', 'page_777', 'Página B')$$, tests.id('org_b')),
  '42501', 'cliente não vincula Página direto');
select tests.throws(format($$select public.meta_set_invite(%L, 'accepted', null, 'bsu_1')$$, tests.id('org_b')),
  '42501', 'cliente não marca convite como aceito');

-- 8. Servidor vincula Página a B; a mesma Página não vai para A
reset role;
set role service_role;
select public.meta_set_page(tests.id('org_b'), 'done', 'page_777', 'Página B', 'corr-page');
select tests.throws(
  format($$select public.meta_set_page(%L, 'done', 'page_777', 'Página B')$$, tests.id('org_a')),
  'P0001', 'mesma Página não vai para duas empresas'
);
select public.meta_set_instagram(tests.id('org_b'), 'done', 'ig_777', 'corr-ig');

-- 9. Conectada só com os 4 passos
select public.meta_set_invite(tests.id('org_b'), 'pending', 'dono@b.test', null, 'corr-inv');
select public.meta_set_invite(tests.id('org_b'), 'accepted', null, 'bsu_123', 'corr-inv2');
select tests.eq((select count(*) from public.meta_connections
  where organization_id = tests.id('org_b') and status = 'connected'), 0, 'sem pagamento continua desconectada');
select public.meta_set_billing(tests.id('org_b'), true, 'corr-bill');
select tests.eq((select count(*) from public.meta_connections
  where organization_id = tests.id('org_b') and status = 'connected' and billing_verified_on_meta), 1, 'com 4 passos fica conectada');

-- 10. Limites de checagem e de tentativas
select tests.eq(public.meta_touch_checked(tests.id('org_b'), 15)::int, 1, 'primeira checagem liberada');
select tests.eq(public.meta_touch_checked(tests.id('org_b'), 15)::int, 0, 'segunda checagem em menos de 15 s bloqueada');
select public.meta_link_attempt(tests.id('org_b')) from generate_series(1, 10);
select tests.eq(public.meta_link_attempt(tests.id('org_b'))::int, 0, '11ª tentativa na hora é bloqueada');

-- 11. Owner de B desfaz a Página; A não desfaz a de B
reset role;
set role authenticated;
select tests.login(tests.id('user_a'));
select tests.throws(format($$select public.unlink_meta_page(%L)$$, tests.id('org_b')), '42501', 'A não desfaz Página de B');
select tests.login(tests.id('user_b'));
select public.unlink_meta_page(tests.id('org_b'), 'corr-unlink');
select tests.eq((select count(*) from public.meta_connections
  where organization_id = tests.id('org_b') and page_id is null and instagram_actor_id is null and status = 'disconnected'),
  1, 'owner desfaz a Página e a conexão volta a desconectada');

-- 12. Painel e aposentadoria pelo operador
select tests.login(tests.id('operator'));
select tests.eq((public.meta_pool_overview(true) ->> 'available')::bigint, 1, 'resta 1 conta simulada livre');
select tests.eq((public.meta_pool_overview(true) ->> 'waiting')::bigint, 1, 'D aparece na fila de espera');
select public.retire_pool_account((select id from public.meta_ad_account_pool where status = 'available'), 'corr-ret');
select tests.eq((public.meta_pool_overview(true) ->> 'available')::bigint, 0, 'conta aposentada sai do estoque');
select tests.login(tests.id('user_b'));
select tests.throws(
  format($$select public.retire_pool_account(%L)$$, (select id from public.meta_ad_account_pool limit 1)),
  '42501', 'cliente não aposenta conta'
);

reset role;
