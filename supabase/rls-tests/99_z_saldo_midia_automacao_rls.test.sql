-- Testes de RLS e regras de negócio: Saldo de Mídia (ADR 0009), ativação pelo operador
-- na conta compartilhada e sincronização automática de contatos (Facebook, Instagram e WhatsApp).

reset role;
set role authenticated;

-- 1. Sincronização de contatos (WhatsApp e Instagram)
select tests.login(tests.id('user_b'));
select tests.throws(
  format($$select public.set_business_contacts(%L, '+5511988887777', '@novoinsta')$$, tests.id('org_a')),
  '42501', 'outra organização não altera contatos de A'
);

select tests.login(tests.id('user_c'));
select tests.throws(
  format($$select public.set_business_contacts(%L, '+5511988887777', '@novoinsta')$$, tests.id('org_a')),
  '42501', 'member não altera contatos do negócio'
);

select tests.login(tests.id('user_a'));
select tests.throws(
  format($$select public.set_business_contacts(%L, '11988887777', null)$$, tests.id('org_a')),
  '22023', 'WhatsApp fora do padrão E.164 é recusado'
);

select public.set_business_contacts(tests.id('org_a'), '+5511977776666', '@padaria.central', 'corr-contacts-a');
select tests.eq(
  (select count(*) from public.businesses where organization_id = tests.id('org_a')
    and whatsapp_e164 = '+5511977776666' and instagram_handle = 'padaria.central'),
  1, 'set_business_contacts atualiza WhatsApp e Instagram no negócio'
);
select tests.eq(
  (select count(*) from public.meta_connections where organization_id = tests.id('org_a')
    and whatsapp_phone_e164 = '+5511977776666'),
  1, 'set_business_contacts sincroniza WhatsApp na conexão Meta'
);

-- 2. Carteira de verba de mídia (media_wallets) e isolamento RLS
select tests.login(tests.id('user_c'));
select tests.throws(
  format($$select public.add_media_balance(%L, 15000, 'mock', 'topup_member', true)$$, tests.id('org_a')),
  '42501', 'member não adiciona saldo'
);

select tests.login(tests.id('user_a'));
select tests.throws(
  format($$select public.add_media_balance(%L, 15000, 'pix', 'topup_real_client', false)$$, tests.id('org_a')),
  '42501', 'cliente não consegue adicionar saldo real (não simulado) direto sem webhook/operador'
);

-- Saldo simulado pelo owner funciona e é idempotente
select public.add_media_balance(tests.id('org_a'), 14000, 'mock', 'topup_sim_001', true, 'corr-topup-1');
select tests.eq(
  (select balance_cents::bigint from public.media_wallets where organization_id = tests.id('org_a')),
  14000, 'saldo simulado creditado na carteira de A'
);
select tests.eq(
  (select ((public.add_media_balance(tests.id('org_a'), 14000, 'mock', 'topup_sim_001', true) ->> 'replayed')::boolean)::int),
  1, 'mesma referência externa não duplica saldo'
);

-- Isolamento entre empresas
select tests.login(tests.id('user_b'));
select tests.eq((select count(*) from public.media_wallets where organization_id = tests.id('org_a')), 0,
  'B não vê carteira de A');
select tests.eq((select count(*) from public.media_wallet_entries where organization_id = tests.id('org_a')), 0,
  'B não vê lançamentos de A');

-- 3. Campanha na conta compartilhada exige saldo e auto-financia quando há saldo
reset role;
set role service_role;
select public.meta_assign_shared_account(tests.id('org_a'), 'act_999000111', 'BM 001', true, tests.id('user_a'), 'corr-sh-a');
select public.meta_set_page(tests.id('org_a'), 'done', 'page_a_shared', 'Página A Shared', 'corr-page-sh-a');

reset role;
set role authenticated;
select tests.login(tests.id('user_a'));
select public.approve_creative(tests.id('creative_a'), 'corr-approve-sh');

-- Cria campanha de R$ 20/dia por 7 dias = R$ 140,00 (14000 centavos) -> usa exatamente os 14000 da carteira!
insert into tests.ctx
select 'camp_shared_1', (public.publish_campaign_paused(
  tests.id('org_a'),
  tests.id('strategy_a'),
  'Campanha com Saldo Automático',
  'mensagens_whatsapp',
  2000,
  7,
  array[tests.id('creative_a')],
  'idem_shared_camp_1',
  'sim_ext_camp_sh1',
  'sim_ext_adset_sh1',
  true,
  'corr-pub-sh1'
) ->> 'campaign_id')::uuid;

select tests.eq(
  (select count(*) from public.campaigns where id = tests.id('camp_shared_1')
    and media_funding_status = 'funded' and funded_amount_cents = 14000),
  1, 'campanha na conta compartilhada reserva automaticamente o saldo existente na criação'
);
select tests.eq(
  (select balance_cents::bigint from public.media_wallets where organization_id = tests.id('org_a')),
  0, 'saldo livre descontado após reserva da campanha'
);
select tests.eq(
  (select reserved_cents::bigint from public.media_wallets where organization_id = tests.id('org_a')),
  14000, 'saldo reservado registrado na carteira'
);

-- Segunda campanha sem saldo nasce awaiting_funds e bloqueia ativação até receber saldo
insert into tests.ctx
select 'camp_shared_2', (public.publish_campaign_paused(
  tests.id('org_a'),
  tests.id('strategy_a'),
  'Campanha Aguardando Saldo',
  'mensagens_whatsapp',
  2000,
  5,
  array[tests.id('creative_a')],
  'idem_shared_camp_2',
  'sim_ext_camp_sh2',
  'sim_ext_adset_sh2',
  true,
  'corr-pub-sh2'
) ->> 'campaign_id')::uuid;

select tests.eq(
  (select count(*) from public.campaigns where id = tests.id('camp_shared_2')
    and media_funding_status = 'awaiting_funds' and funded_amount_cents = 0),
  1, 'campanha sem saldo nasce awaiting_funds'
);

select tests.throws(
  format($$select public.activate_campaign(%L, 2000, 5, 'act_sem_saldo_sh2')$$, tests.id('camp_shared_2')),
  'P0001', 'não ativa campanha em conta compartilhada sem saldo confirmado'
);

-- Ao adicionar saldo suficiente (R$ 100,00 = 10000 centavos), a campanha pendente é financiada automaticamente!
select public.add_media_balance(tests.id('org_a'), 10000, 'mock', 'topup_sim_002', true, 'corr-topup-2');
select tests.eq(
  (select count(*) from public.campaigns where id = tests.id('camp_shared_2')
    and media_funding_status = 'funded' and funded_amount_cents = 10000),
  1, 'adicionar saldo financia automaticamente a campanha que aguardava verba'
);

-- 4. Operador da plataforma lista e ativa campanha de cliente na conta compartilhada
-- Em 80_meta_pool_rls.test.sql, 'operator' é o operador da plataforma.
select tests.login(tests.id('operator'));
select tests.eq(
  (select jsonb_array_length(public.operator_shared_campaigns(true)) >= 2)::int,
  1, 'operador lista campanhas da conta compartilhada'
);
select public.activate_campaign(tests.id('camp_shared_2'), 2000, 5, 'act_op_sh2', 'corr-act-op');

-- 5. Exportação LGPD inclui carteira de mídia e lançamentos, e dono vê campanha ativada pelo operador
select tests.login(tests.id('user_a'));
select tests.eq(
  (select count(*) from public.campaigns where id = tests.id('camp_shared_2')
    and status = 'active' and activated_by = tests.id('operator')),
  1, 'operador ativa campanha financiada de cliente na conta compartilhada'
);
select tests.eq(
  (select (public.export_organization_data(tests.id('org_a')) -> 'media_wallet' ->> 'reserved_cents')::bigint),
  24000, 'exportação LGPD inclui carteira de mídia com saldo reservado'
);

-- 6. Campanha REAL na conta compartilhada: meta_check_activation exige saldo e aceita operador
reset role;
set role service_role;
select public.meta_assign_shared_account(tests.id('org_e'), 'act_999000111', 'BM 001', false, tests.id('user_e'), 'corr-sh-e-real');
select public.meta_set_page(tests.id('org_e'), 'done', 'page_e_real', 'Página E Real', 'corr-page-e-real');

reset role;
set role authenticated;
select tests.login(tests.id('user_a'));
-- Torna org_a conectada em modo real na conta compartilhada para testar start_real_publication + meta_check_activation
reset role;
set role service_role;
select public.meta_assign_shared_account(tests.id('org_a'), 'act_999000111', 'BM 001', false, tests.id('user_a'), 'corr-sh-a-real');
select public.meta_set_page(tests.id('org_a'), 'done', 'page_a_real_sh', 'Página A Real Shared', 'corr-page-a-real');

reset role;
set role authenticated;
select tests.login(tests.id('user_a'));
insert into tests.ctx
select 'camp_real_sh', (public.start_real_publication(
  tests.id('org_a'),
  tests.id('strategy_a'),
  'Campanha Real Shared',
  'mensagens_whatsapp',
  3000,
  5,
  array[tests.id('creative_a')],
  'idem_real_sh_1',
  'corr-real-sh-1'
) ->> 'campaign_id')::uuid;

reset role;
set role service_role;
select public.meta_begin_publication_step(tests.id('camp_real_sh'), 'campaign');
select public.meta_record_publication(tests.id('camp_real_sh'), jsonb_build_object('external_campaign_id', 'ext_c_sh'));
select public.meta_begin_publication_step(tests.id('camp_real_sh'), 'adset');
select public.meta_record_publication(tests.id('camp_real_sh'), jsonb_build_object('external_adset_id', 'ext_as_sh'));
select public.meta_begin_publication_step(tests.id('camp_real_sh'), 'ad:' || tests.id('creative_a')::text);
select public.meta_record_publication(tests.id('camp_real_sh'), jsonb_build_object(
  'creatives', jsonb_build_array(jsonb_build_object('creative_id', tests.id('creative_a'), 'external_ad_id', 'ext_ad_sh'))
));
select public.meta_finish_publication(tests.id('camp_real_sh'), 'corr-fin-sh');

-- Sem saldo, meta_check_activation bloqueia mesmo para o operador
select tests.throws(
  format($$select public.meta_check_activation(%L, %L, 3000, 5, 'act_real_sh_1')$$, tests.id('camp_real_sh'), tests.id('operator')),
  'P0001', 'meta_check_activation bloqueia campanha real na conta compartilhada sem verba paga'
);

-- Webhook/service_role credita saldo real de R$ 150,00 (15000 centavos) -> financia automaticamente!
select public.add_media_balance(tests.id('org_a'), 15000, 'pix_webhook', 'pix_tx_998877', false, 'corr-pix-real');

select tests.eq(
  (public.meta_check_activation(tests.id('camp_real_sh'), tests.id('operator'), 3000, 5, 'act_real_sh_1') = 'act_999000111')::int,
  1,
  'meta_check_activation libera operador após verba confirmada'
);
select public.meta_activate_campaign(tests.id('camp_real_sh'), tests.id('operator'), 3000, 5, 'act_real_sh_1', 'corr-act-real-op');

reset role;
set role authenticated;
select tests.login(tests.id('user_a'));
select tests.eq(
  (select count(*) from public.campaigns where id = tests.id('camp_real_sh') and status = 'active' and not simulated),
  1, 'campanha real na conta compartilhada ativada pelo operador após confirmação do saldo'
);

reset role;
