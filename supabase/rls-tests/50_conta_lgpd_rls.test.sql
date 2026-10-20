-- Testes de RLS para convites, logo da empresa, consentimentos e LGPD (Etapa 1).

set role authenticated;

-- 1. Convites: member (user_c na org_a) não pode criar convite nem listar convites
select tests.login(tests.id('user_c'));
select tests.throws(
  format($$select public.create_organization_invite(%L, 'novo@exemplo.test', 'member', 'token_valido_1234567890')$$, tests.id('org_a')),
  '42501', 'member não cria convite'
);
select tests.eq((select count(*) from public.organization_invites), 0, 'member não lê convites');

-- 2. Owner (user_a) cria convite para user_b entrar na org_a
select tests.login(tests.id('user_a'));
insert into tests.ctx
select 'invite_b', public.create_organization_invite(tests.id('org_a'), 'b@exemplo.test', 'admin', 'convite_token_b_123456', 'corr-inv');

select tests.eq((select count(*) from public.organization_invites where organization_id = tests.id('org_a')), 1, 'owner lê convite criado');

-- Não pode criar convite com papel owner
select tests.throws(
  format($$select public.create_organization_invite(%L, 'outro@exemplo.test', 'owner', 'token_owner_1234567890')$$, tests.id('org_a')),
  'P0001', 'convite rejeita papel owner'
);

-- 3. Usuário C (c@exemplo.test) tenta aceitar o convite endereçado a B (b@exemplo.test) -> falha
select tests.login(tests.id('user_c'));
select tests.throws(
  $$select public.accept_organization_invite('convite_token_b_123456')$$,
  '42501', 'outro e-mail não aceita convite alheio'
);

-- 4. Usuário B (b@exemplo.test) inspeciona e aceita o convite
select tests.login(tests.id('user_b'));
select tests.eq(
  (select ((public.inspect_organization_invite('convite_token_b_123456')) ->> 'organization_id')::uuid = tests.id('org_a'))::int,
  1, 'inspect_organization_invite retorna dados do convite'
);
select tests.eq(
  (select public.accept_organization_invite('convite_token_b_123456', 'corr-acc') = tests.id('org_a'))::int,
  1, 'usuário B aceita convite para org_a'
);

-- Convite já aceito não pode ser aceito de novo
select tests.throws(
  $$select public.accept_organization_invite('convite_token_b_123456')$$,
  'P0001', 'convite já aceito não aceita replay'
);

-- Remove B da org_a para manter isolamento nos próximos testes
reset role;
delete from public.organization_members where organization_id = tests.id('org_a') and user_id = tests.id('user_b');
set role authenticated;

-- 5. Termos e consentimentos LGPD
select tests.login(tests.id('user_a'));
select public.record_user_consents(
  tests.id('org_a'),
  '2026-10-v1',
  array['terms_of_use', 'privacy_policy', 'ai_processing']::public.consent_kind[],
  'corr-cons'
);
select tests.eq((select count(*) from public.user_consents where organization_id = tests.id('org_a')), 3, '3 consentimentos gravados');

-- Empresa B não vê consentimentos de A
select tests.login(tests.id('user_b'));
select tests.eq((select count(*) from public.user_consents where organization_id = tests.id('org_a')), 0, 'B não vê consentimentos de A');
select tests.throws(
  format($$select public.record_user_consents(%L, '2026-10-v1', array['terms_of_use']::public.consent_kind[])$$, tests.id('org_a')),
  '42501', 'B não grava consentimentos em A'
);

-- 6. Logo da empresa
select tests.login(tests.id('user_b'));
select tests.throws(
  format($$select public.register_business_logo(%L, '11111111-1111-1111-1111-111111111111', %L, 'image/png', 1024)$$,
    tests.id('business_a'), tests.id('org_a') || '/11111111-1111-1111-1111-111111111111.png'),
  '42501', 'B não registra logo no negócio de A'
);

select tests.login(tests.id('user_a'));
select tests.eq(
  (select public.register_business_logo(
    tests.id('business_a'),
    '11111111-1111-4111-8111-111111111111',
    tests.id('org_a') || '/11111111-1111-4111-8111-111111111111.png',
    'image/png',
    2048,
    'corr-logo'
  ) = '11111111-1111-4111-8111-111111111111'::uuid)::int,
  1, 'A registra logo no próprio negócio'
);

-- 7. Exportação e exclusão LGPD
select tests.login(tests.id('user_c'));
select tests.throws(
  format($$select public.export_organization_data(%L)$$, tests.id('org_a')),
  '42501', 'member não exporta dados da organização'
);
select tests.throws(
  format($$select public.delete_organization(%L, 'Padaria A')$$, tests.id('org_a')),
  '42501', 'member não exclui organização'
);

select tests.login(tests.id('user_a'));
select tests.eq(
  (select ((public.export_organization_data(tests.id('org_a'), 'corr-exp')) -> 'organization' ->> 'name') = 'Padaria A')::int,
  1, 'owner exporta dados da organização em JSON'
);
select tests.throws(
  format($$select public.delete_organization(%L, 'Nome Errado')$$, tests.id('org_a')),
  'P0001', 'delete_organization exige nome exato'
);

reset role;
