-- Criativos: jobs, estratégias e peças. Continua o cenário de 10_tenancy_rls (org A com brief
-- submetido, org B, user_c member de A).

create function tests.contents() returns jsonb
language sql immutable as $$
  select jsonb_agg(jsonb_build_object(
    'angle_key', k,
    'content', jsonb_build_object('template', k, 'headline', 'Título', 'body', 'Texto', 'cta', 'Chamar',
      'show_price', false, 'colors', jsonb_build_object('background', '#C2410C', 'accent', '#FFFFFF', 'text', '#FFFFFF'))))
  from unnest(array['oferta', 'problema', 'beneficio', 'demonstracao', 'conveniencia']) k
$$;

create function tests.plan() returns jsonb
language sql immutable as $$
  select jsonb_build_object('business_summary', 'Resumo', 'angles', (select jsonb_agg(c) from jsonb_array_elements(tests.contents()) c))
$$;

set role authenticated;

-- ---------------------------------------------------------------- A gera estratégia
select tests.login(tests.id('user_a'));
insert into tests.ctx select 'job_a', (public.start_strategy_job(tests.id('brief_a'), 'corr-job') ->> 'job_id')::uuid;

select tests.eq(
  (select count(*) from public.start_strategy_job(tests.id('brief_a')) r
   where (r ->> 'reused')::boolean and (r ->> 'job_id')::uuid = tests.id('job_a')),
  1, 'segundo pedido reaproveita o job ativo');

select tests.throws(
  $$insert into public.generation_jobs (organization_id, kind, brief_id) values (tests.id('org_a'), 'strategy', tests.id('brief_a'))$$,
  '42501', 'job não aceita insert direto');

select tests.throws(
  format($$select public.finish_strategy_job(%L, tests.plan(), '[]'::jsonb, true, 'mock', 'simulacao', 'strategy.v1', 0, 0)$$, tests.id('job_a')),
  'P0001', 'finish exige 5 peças');

insert into tests.ctx select 'strategy_a',
  public.finish_strategy_job(tests.id('job_a'), tests.plan(), tests.contents(), true, 'mock', 'simulacao', 'strategy.v1', 0, 0);

select tests.eq((select count(*) from public.creatives where strategy_id = tests.id('strategy_a')), 5, 'finish cria 5 peças');
select tests.eq((select count(*) from public.generation_jobs where id = tests.id('job_a') and status = 'succeeded'), 1, 'job concluído');

select tests.throws(
  format($$select public.finish_strategy_job(%L, tests.plan(), tests.contents(), true, 'mock', 'simulacao', 'strategy.v1', 0, 0)$$, tests.id('job_a')),
  'P0001', 'job concluído não recebe segunda estratégia');

insert into tests.ctx select 'creative_a', id from public.creatives where angle_key = 'oferta' and strategy_id = tests.id('strategy_a');

-- ---------------------------------------------------------------- edição e aprovação
with u as (update public.creatives set content = content || '{"headline":"Novo título"}' where id = tests.id('creative_a') returning 1)
select tests.eq((select count(*) from u), 1, 'membro edita o conteúdo');

select tests.throws(
  format($$update public.creatives set status = 'approved', approved_at = now() where id = %L$$, tests.id('creative_a')),
  '42501', 'status não muda por update direto');

select public.approve_creative(tests.id('creative_a'));
select tests.eq((select count(*) from public.creatives where id = tests.id('creative_a') and status = 'approved'), 1, 'owner aprova');

update public.creatives set content = content || '{"headline":"Mudou depois"}' where id = tests.id('creative_a');
select tests.eq((select count(*) from public.creatives where id = tests.id('creative_a') and status = 'draft' and approved_at is null), 1,
  'editar peça aprovada volta para rascunho');

-- ---------------------------------------------------------------- member não aprova
select tests.login(tests.id('user_c'));
select tests.eq((select count(*) from public.creatives), 5, 'member vê as peças da org');
select tests.throws(format($$select public.approve_creative(%L)$$, tests.id('creative_a')), '42501', 'member não aprova');

-- ---------------------------------------------------------------- B não acessa A
select tests.login(tests.id('user_b'));
select tests.eq((select count(*) from public.generation_jobs), 0, 'B não vê jobs de A');
select tests.eq((select count(*) from public.strategies), 0, 'B não vê estratégias de A');
select tests.eq((select count(*) from public.creatives), 0, 'B não vê peças de A');

with u as (update public.creatives set content = '{}' where id = tests.id('creative_a') returning 1)
select tests.eq((select count(*) from u), 0, 'B não edita peça de A');

select tests.throws(format($$select public.start_strategy_job(%L)$$, tests.id('brief_a')), '42501', 'B não inicia job no brief de A');
select tests.throws(format($$select public.approve_creative(%L)$$, tests.id('creative_a')), '42501', 'B não aprova peça de A');
select tests.throws(format($$select public.fail_generation_job(%L, 'x')$$, tests.id('job_a')), '42501', 'B não falha job de A');

-- ---------------------------------------------------------------- anon
reset role;
set role anon;
select tests.throws('select count(*) from public.creatives', '42501', 'anon não lê peças');
reset role;
