-- Fase 2: jobs de geração, estratégias, conceitos e peças.
-- Reaproveita o schema `tests`, usuários e org/brief criados em 10_tenancy_rls.test.sql.

create function tests.concepts(p_show_price boolean) returns jsonb
language sql immutable as $$
  select jsonb_agg(jsonb_build_object(
    'angle', 'oferta_direta', 'title', 'Conceito ' || i, 'rationale', 'Motivo do conceito ' || i,
    'headline', 'Título ' || i, 'body', 'Texto curto', 'primary_text', 'Texto principal do anúncio',
    'cta', 'Pedir no WhatsApp', 'show_price', p_show_price and i = 1, 'template_key', 'destaque',
    'visual_direction', 'Mesa de café da manhã com luz natural'))
  from generate_series(1, 3) as i
$$;

create function tests.design(p_show_price boolean, p_price integer) returns jsonb
language sql immutable as $$
  select jsonb_build_object(
    'format', 'feed_4x5', 'template_key', 'destaque', 'business_name', 'Padaria Exemplo',
    'headline', 'Café da manhã completo', 'body', '', 'cta', 'Pedir no WhatsApp',
    'show_price', p_show_price, 'price_cents', p_price, 'currency', 'BRL',
    'brand_color', '#C2410C', 'background', 'gradiente')
$$;

set role authenticated;

-- ---------------------------------------------------------------- enfileirar
select tests.login(tests.id('user_a'));

insert into tests.ctx values
  ('job_1', public.enqueue_generation_job(tests.id('org_a'), tests.id('brief_a'), 'chave-idem-0001', 'mock', null, 'corr-g1'));

select tests.eq(
  (select count(*) from public.generation_jobs where id = public.enqueue_generation_job(tests.id('org_a'), tests.id('brief_a'), 'chave-idem-0001', 'mock')),
  1, 'enqueue idempotente pela chave');
select tests.eq(
  (select count(*) from public.generation_jobs where id = tests.id('job_1')
     and id = public.enqueue_generation_job(tests.id('org_a'), tests.id('brief_a'), 'outra-chave-0002', 'mock')),
  1, 'job em andamento do mesmo brief é reaproveitado');
select tests.eq((select count(*) from public.generation_jobs), 1, 'nenhum job duplicado');
select tests.eq((select count(*) from public.generation_jobs where is_simulation and provider = 'mock'), 1,
  'job mock é marcado como simulação');

select tests.throws(
  format($$select public.complete_generation_job(%L, '{}'::jsonb, tests.concepts(false))$$, tests.id('job_1')),
  'P0001', 'não conclui job que não começou');

-- ---------------------------------------------------------------- B não acessa A
select tests.login(tests.id('user_b'));
select tests.throws(
  format($$select public.enqueue_generation_job(%L, %L, 'chave-invasor-01', 'mock')$$, tests.id('org_a'), tests.id('brief_a')),
  '42501', 'B não enfileira para A');
select tests.throws(format($$select public.start_generation_job(%L)$$, tests.id('job_1')), '42501', 'B não inicia job de A');
select tests.eq((select count(*) from public.generation_jobs), 0, 'B não vê jobs de A');
select tests.throws(
  format($$select public.enqueue_generation_job(%L, %L, 'chave-cruzada-01', 'mock')$$, tests.id('org_b'), tests.id('brief_a')),
  'P0001', 'B não usa brief de A na própria org');

-- ---------------------------------------------------------------- ciclo de vida
select tests.login(tests.id('user_a'));
select tests.eq(public.start_generation_job(tests.id('job_1')), 1, 'start devolve tentativa 1');
select tests.throws(format($$select public.start_generation_job(%L)$$, tests.id('job_1')), 'P0001', 'start duplo é bloqueado');

select tests.eq(
  (select count(*) from (select public.fail_generation_job(tests.id('job_1'), 'provider_timeout', true) as s) x where s = 'queued'),
  1, 'falha retentável volta para a fila');
select public.start_generation_job(tests.id('job_1'));

select tests.throws(
  format($$select public.complete_generation_job(%L, '{"summary":"x"}'::jsonb, '[]'::jsonb)$$, tests.id('job_1')),
  'P0001', 'conclusão exige 3 a 5 conceitos');

insert into tests.ctx select 'strategy_1',
  public.complete_generation_job(tests.id('job_1'), '{"summary":"estratégia"}'::jsonb, tests.concepts(true),
    '{"input_tokens": 100, "output_tokens": 50, "cost_micro_usd": 1200}'::jsonb);

select tests.eq((select count(*) from public.generation_jobs where id = tests.id('job_1') and status = 'succeeded'
  and result_strategy_id = tests.id('strategy_1') and attempts = 2 and input_tokens = 100), 1, 'job concluído com uso registrado');
select tests.eq((select count(*) from public.strategies where id = tests.id('strategy_1') and version = 1
  and provider = 'mock' and is_simulation), 1, 'estratégia v1 herda provider/simulação do job');
select tests.eq((select count(*) from public.creative_concepts where strategy_id = tests.id('strategy_1')), 3, '3 conceitos gravados');

-- Nova geração do mesmo brief gera versão 2.
insert into tests.ctx values
  ('job_2', public.enqueue_generation_job(tests.id('org_a'), tests.id('brief_a'), 'chave-idem-0003', 'mock'));
select public.start_generation_job(tests.id('job_2'));
select public.complete_generation_job(tests.id('job_2'), '{"summary":"v2"}'::jsonb, tests.concepts(false));
select tests.eq((select max(version) from public.strategies), 2, 'regenerar cria versão 2');

-- Falha definitiva após esgotar tentativas.
insert into tests.ctx values
  ('job_3', public.enqueue_generation_job(tests.id('org_a'), tests.id('brief_a'), 'chave-idem-0004', 'mock'));
select public.start_generation_job(tests.id('job_3'));
select public.fail_generation_job(tests.id('job_3'), 'provider_unavailable', true);
select public.start_generation_job(tests.id('job_3'));
select public.fail_generation_job(tests.id('job_3'), 'provider_unavailable', true);
select public.start_generation_job(tests.id('job_3'));
select tests.eq(
  (select count(*) from (select public.fail_generation_job(tests.id('job_3'), 'provider_unavailable', true) as s) x where s = 'failed'),
  1, 'após 3 tentativas o job falha de vez');

-- Escritas diretas bloqueadas.
select tests.throws(
  format($$insert into public.strategies (organization_id, brief_id, version, provider, is_simulation, content)
           values (%L, %L, 9, 'openai', false, '{}')$$, tests.id('org_a'), tests.id('brief_a')),
  '42501', 'estratégia não aceita insert direto');
select tests.throws(
  format($$update public.generation_jobs set status = 'queued' where id = %L$$, tests.id('job_3')),
  '42501', 'job não aceita update direto');

-- ---------------------------------------------------------------- preço não confirmado
-- Brief com oferta sem preço (criado direto, como membro).
with o as (
  insert into public.offers (organization_id, business_id, name, description)
  values (tests.id('org_a'), tests.id('business_a'), 'Pão de queijo', 'Pão de queijo assado na hora')
  returning id)
insert into tests.ctx select 'offer_np', id from o;
with b as (
  insert into public.briefs (organization_id, business_id, offer_id, objective, audience_description,
                             age_min, age_max, status, facts_confirmed_at)
  values (tests.id('org_a'), tests.id('business_a'), tests.id('offer_np'), 'visitas_perfil',
          'Moradores do bairro', 18, 60, 'submitted', now())
  returning id)
insert into tests.ctx select 'brief_np', id from b;
insert into tests.ctx values
  ('job_np', public.enqueue_generation_job(tests.id('org_a'), tests.id('brief_np'), 'chave-sem-preco1', 'mock'));
select public.start_generation_job(tests.id('job_np'));
select tests.throws(
  format($$select public.complete_generation_job(%L, '{"summary":"x"}'::jsonb, tests.concepts(true))$$, tests.id('job_np')),
  'P0001', 'conceito com preço é recusado se a oferta não tem preço confirmado');

-- ---------------------------------------------------------------- peças
insert into tests.ctx select 'concept_1', id from public.creative_concepts
  where strategy_id = tests.id('strategy_1') and position = 1;

select tests.throws(
  format($$select public.create_creative(%L, tests.design(true, 1990))$$, tests.id('concept_1')),
  'P0001', 'peça não aceita preço diferente do confirmado');
insert into tests.ctx values ('creative_1', public.create_creative(tests.id('concept_1'), tests.design(true, 2490)));

select tests.eq(public.save_creative(tests.id('creative_1'), 1, tests.design(false, null)), 2, 'salvar incrementa versão');
select tests.throws(
  format($$select public.save_creative(%L, 1, tests.design(false, null))$$, tests.id('creative_1')),
  'P0001', 'versão desatualizada gera conflito');

select public.approve_creative(tests.id('creative_1'), 2);
select tests.eq((select count(*) from public.creatives where id = tests.id('creative_1') and status = 'approved'), 1, 'peça aprovada');
select public.save_creative(tests.id('creative_1'), 2, tests.design(false, null));
select tests.eq((select count(*) from public.creatives where id = tests.id('creative_1') and status = 'draft'
  and approved_at is null), 1, 'editar desfaz a aprovação');

select tests.throws(
  format($$update public.creatives set status = 'approved' where id = %L$$, tests.id('creative_1')),
  '42501', 'peça não aceita update direto');

-- member (C) edita; B não.
select tests.login(tests.id('user_c'));
select tests.eq(public.save_creative(tests.id('creative_1'), 3, tests.design(false, null)), 4, 'member edita peça da org');

select tests.login(tests.id('user_b'));
select tests.eq((select count(*) from public.creatives), 0, 'B não vê peças de A');
select tests.eq((select count(*) from public.strategies), 0, 'B não vê estratégias de A');
select tests.throws(
  format($$select public.save_creative(%L, 4, tests.design(false, null))$$, tests.id('creative_1')),
  '42501', 'B não edita peça de A');
select tests.throws(
  format($$select public.approve_creative(%L, 4)$$, tests.id('creative_1')),
  '42501', 'B não aprova peça de A');

-- ---------------------------------------------------------------- cota diária
reset role;
insert into public.businesses (id, organization_id, name, segment, city, state)
values ('00000000-0000-0000-0000-0000000000b1', tests.id('org_b'), 'Loja B', 'Moda', 'Recife', 'PE');
insert into public.offers (id, organization_id, business_id, name, description)
values ('00000000-0000-0000-0000-0000000000b2', tests.id('org_b'), '00000000-0000-0000-0000-0000000000b1', 'Camisetas', 'Camisetas de algodão');
insert into public.briefs (id, organization_id, business_id, offer_id, objective, audience_description, age_min, age_max, status, facts_confirmed_at)
values ('00000000-0000-0000-0000-0000000000b3', tests.id('org_b'), '00000000-0000-0000-0000-0000000000b1',
        '00000000-0000-0000-0000-0000000000b2', 'visitas_perfil', 'Jovens adultos da cidade', 18, 35, 'submitted', now());
insert into public.generation_jobs (organization_id, brief_id, idempotency_key, provider, is_simulation, status, finished_at)
select tests.id('org_b'), '00000000-0000-0000-0000-0000000000b3', 'cota-' || lpad(i::text, 8, '0'), 'mock', true, 'failed', now()
from generate_series(1, 20) i;
set role authenticated;

select tests.login(tests.id('user_b'));
select tests.throws(
  $$select public.enqueue_generation_job(tests.id('org_b'), '00000000-0000-0000-0000-0000000000b3', 'cota-estourada-1', 'mock')$$,
  'P0001', 'cota diária de 20 gerações');

-- ---------------------------------------------------------------- anon
reset role;
set role anon;
select tests.throws($$select count(*) from public.strategies$$, '42501', 'anon não lê estratégias');
select tests.throws(
  $$select public.enqueue_generation_job('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000f2', 'anon-chave-0001', 'mock')$$,
  '42501', 'anon não enfileira');
reset role;
