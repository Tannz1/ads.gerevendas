-- Conta de anúncios compartilhada (ADR 0009). Roda depois de 10..97.

reset role;
insert into tests.ctx values ('user_e', gen_random_uuid()), ('user_f', gen_random_uuid());
insert into auth.users (id, email) values
  (tests.id('user_e'), 'dona.e@empresa.test'),
  (tests.id('user_f'), 'dono.f@empresa.test');

set role authenticated;
select tests.login(tests.id('user_e'));
insert into tests.ctx select 'org_e', public.create_organization('Empresa E');
select tests.login(tests.id('user_f'));
insert into tests.ctx select 'org_f', public.create_organization('Empresa F');

-- 1. O dono não escolhe a conta: só o servidor vincula
select tests.login(tests.id('user_e'));
select tests.throws(
  format($$select public.meta_assign_shared_account(%L, 'act_999000111', 'X', true, null)$$, tests.id('org_e')),
  '42501', 'dono não vincula conta compartilhada direto'
);

-- 2. Duas empresas na mesma conta
reset role;
set role service_role;
select public.meta_assign_shared_account(tests.id('org_e'), 'act_999000111', 'BM 001', true, tests.id('user_e'), 'corr-sh-e');
select public.meta_assign_shared_account(tests.id('org_f'), 'act_999000111', 'BM 001', true, tests.id('user_f'), 'corr-sh-f');
select tests.eq((select count(*) from public.meta_connections
  where ad_account_id = 'act_999000111' and shared_account and ad_account_status = 'done'), 2, 'E e F na mesma conta');
select tests.throws(
  format($$select public.meta_assign_shared_account(%L, 'conta_errada', 'X', true, null)$$, tests.id('org_e')),
  '22023', 'ID de conta inválido é recusado'
);

-- 3. Conectada com conta + Página, sem convite nem pagamento na Meta
select tests.eq((select count(*) from public.meta_connections
  where organization_id = tests.id('org_e') and status = 'disconnected'), 1, 'sem Página continua desconectada');
select public.meta_set_page(tests.id('org_e'), 'done', 'page_e_1', 'Página E', 'corr-page-e');
select tests.eq((select count(*) from public.meta_connections
  where organization_id = tests.id('org_e') and status = 'connected' and not billing_verified_on_meta),
  1, 'conta compartilhada conecta só com a Página');

-- 4. Cada empresa vê só a própria conexão
reset role;
set role authenticated;
select tests.login(tests.id('user_f'));
select tests.eq((select count(*) from public.meta_connections), 1, 'F vê só a própria conexão');
select tests.eq((select count(*) from public.meta_connections where organization_id = tests.id('org_e')), 0,
  'F não vê a conexão de E');

reset role;
