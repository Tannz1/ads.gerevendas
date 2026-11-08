-- Fluxo simples (ADR 0010): foto do produto, produto → brief e vendas registradas. Roda depois de 10..98
-- (org A com cadastro concluído e `campaign_a`; user_c member de A; org B; org E sem cadastro).

set role authenticated;

-- 1. Foto do produto fica na pasta da própria empresa
select tests.login(tests.id('user_a'));
insert into tests.ctx values ('product_photo', gen_random_uuid());
select tests.throws(
  format($$select public.register_product_photo(%L, %L, %L, 'image/jpeg', 2000)$$,
    tests.id('org_a'), tests.id('product_photo'), tests.id('org_b') || '/' || tests.id('product_photo') || '.jpg'),
  'P0001', 'foto do produto não vai para a pasta de outra org');
select public.register_product_photo(tests.id('org_a'), tests.id('product_photo'),
  tests.id('org_a') || '/' || tests.id('product_photo') || '.jpg', 'image/jpeg', 2000, 'corr-prod-foto');
select tests.eq((select count(*) from public.assets
  where id = tests.id('product_photo') and kind = 'photo' and rights_confirmed_at is not null), 1,
  'foto do produto guarda declaração de direito de uso');

select tests.login(tests.id('user_b'));
select tests.throws(
  format($$select public.register_product_photo(%L, gen_random_uuid(), 'x/y.jpg', 'image/jpeg', 1)$$, tests.id('org_a')),
  '42501', 'B não registra foto na empresa A');

-- 2. Produto vira oferta + brief prontos para gerar
select tests.login(tests.id('user_c'));
select tests.throws(
  format($$select public.create_product_brief(%L, %L::jsonb)$$, tests.id('org_a'),
    jsonb_build_object('name', 'Kit de botas', 'description', 'Kit de botas femininas de couro', 'facts_confirmed', false)),
  'P0001', 'produto exige confirmação dos fatos');

insert into tests.ctx
select 'product_brief', (public.create_product_brief(tests.id('org_a'), jsonb_build_object(
  'name', 'Kit de botas femininas', 'description', 'Kit de botas femininas de couro', 'price_cents', 29990,
  'differentiators', jsonb_build_array('Até 3x sem juros'), 'photo_asset_id', tests.id('product_photo'),
  'request_key', 'prod_req_0001', 'facts_confirmed', true), 'corr-prod') ->> 'brief_id')::uuid;

select tests.eq((select count(*) from public.briefs b join public.offers o on o.id = b.offer_id
  where b.id = tests.id('product_brief') and b.status = 'submitted' and b.objective = 'mensagens_whatsapp'
    and o.photo_asset_id = tests.id('product_photo') and o.price_cents = 29990 and o.price_confirmed_by_client),
  1, 'produto cria brief submetido com foto, preço confirmado e objetivo WhatsApp');

select tests.eq(
  (select ((public.create_product_brief(tests.id('org_a'), jsonb_build_object(
    'name', 'Kit de botas femininas', 'description', 'Kit de botas femininas de couro',
    'request_key', 'prod_req_0001', 'facts_confirmed', true)) ->> 'replayed')::boolean)::int),
  1, 'mesma request_key não cria segundo produto');

select tests.throws(
  format($$select public.create_product_brief(%L, %L::jsonb)$$, tests.id('org_a'),
    jsonb_build_object('name', 'Kit', 'description', 'Kit de botas femininas', 'facts_confirmed', true,
      'photo_asset_id', gen_random_uuid())),
  'P0001', 'foto inexistente é recusada');

select tests.login(tests.id('user_b'));
select tests.throws(
  format($$select public.create_product_brief(%L, %L::jsonb)$$, tests.id('org_a'),
    jsonb_build_object('name', 'Invasão', 'description', 'Produto de outra empresa', 'facts_confirmed', true)),
  '42501', 'B não cria produto na empresa A');
select tests.eq((select count(*) from public.briefs where id = tests.id('product_brief')), 0, 'B não vê o produto de A');

select tests.login(tests.id('user_e'));
select tests.throws(
  format($$select public.create_product_brief(%L, %L::jsonb)$$, tests.id('org_e'),
    jsonb_build_object('name', 'Produto E', 'description', 'Produto sem cadastro concluído', 'facts_confirmed', true)),
  'P0001', 'sem cadastro concluído não cria produto');

-- 3. Vendas registradas
select tests.login(tests.id('user_c'));
insert into tests.ctx select 'sale_c', public.record_sale(tests.id('campaign_a'), 2, 59980, null, 'corr-venda');
select tests.eq((select count(*) from public.sales_records where campaign_id = tests.id('campaign_a')), 1,
  'membro registra venda da campanha');
select tests.throws(
  format($$select public.record_sale(%L, 0)$$, tests.id('campaign_a')), '23514', 'quantidade zero é recusada');
select tests.throws(
  format($$select public.record_sale(%L, 1, null, current_date + 1)$$, tests.id('campaign_a')),
  '22023', 'venda no futuro é recusada');
select tests.throws(
  $$insert into public.sales_records (organization_id, campaign_id, quantity) values (tests.id('org_a'), tests.id('campaign_a'), 1)$$,
  '42501', 'venda só entra pela RPC');

select tests.login(tests.id('user_b'));
select tests.eq((select count(*) from public.sales_records), 0, 'B não vê vendas de A');
select tests.throws(format($$select public.record_sale(%L, 1)$$, tests.id('campaign_a')), '42501',
  'B não registra venda na campanha de A');
select tests.throws(format($$select public.delete_sale(%L)$$, tests.id('sale_c')), '42501', 'B não apaga venda de A');

select tests.login(tests.id('user_a'));
insert into tests.ctx select 'sale_a', public.record_sale(tests.id('campaign_a'), 1, null);
select tests.login(tests.id('user_c'));
select tests.throws(format($$select public.delete_sale(%L)$$, tests.id('sale_a')), '42501',
  'member não apaga venda registrada por outra pessoa');
select tests.login(tests.id('user_a'));
select tests.eq(
  (select jsonb_array_length(public.export_organization_data(tests.id('org_a')) -> 'sales_records'))::bigint,
  2, 'exportação LGPD inclui as vendas registradas');
select tests.login(tests.id('user_c'));
select public.delete_sale(tests.id('sale_c'));
select tests.login(tests.id('user_a'));
select public.delete_sale(tests.id('sale_a'));
select tests.eq((select count(*) from public.sales_records where campaign_id = tests.id('campaign_a')), 0,
  'quem registrou e o dono desfazem registros');

reset role;
