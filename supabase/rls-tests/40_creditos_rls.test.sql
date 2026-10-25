-- Créditos: reserva, consumo, devolução, limite mensal e isolamento. Continua 10/20/30
-- (A já gerou 1 estratégia cobrável e 1 imagem; ambas concluídas).

create function tests.used(p_resource text) returns bigint
language sql as $$
  select ((public.credit_summary(tests.id('org_a')) -> p_resource ->> 'used'))::bigint
$$;

set role authenticated;
select tests.login(tests.id('user_a'));

select tests.eq(tests.used('strategy'), 1, 'estratégia concluída consumiu 1 crédito');
select tests.eq(tests.used('image'), 1, 'imagem concluída consumiu 1 crédito');
select tests.eq((select count(*) from public.usage_ledger where entry = 'commit'), 2, 'sucessos viraram commit');

select tests.throws(
  $$insert into public.usage_ledger (organization_id, period, resource, entry, job_id) values (tests.id('org_a'), '2026-10', 'strategy', 'release', tests.id('job_a'))$$,
  '42501', 'ledger não aceita insert direto');

-- Falha devolve o crédito.
insert into tests.ctx select 'job_fail', (public.start_strategy_job(tests.id('brief_a')) ->> 'job_id')::uuid;
select tests.eq(tests.used('strategy'), 2, 'job em andamento reserva crédito');
select public.fail_generation_job(tests.id('job_fail'), 'external_unavailable');
select tests.eq(tests.used('strategy'), 1, 'falha devolve o crédito');
select public.fail_generation_job(tests.id('job_fail'), 'external_unavailable');
select tests.eq((select count(*) from public.usage_ledger where job_id = tests.id('job_fail') and entry = 'release'), 1,
  'devolução é idempotente');

-- Simulação não consome.
insert into tests.ctx select 'job_mock', (public.start_strategy_job(tests.id('brief_a'), null, false) ->> 'job_id')::uuid;
select public.finish_strategy_job(tests.id('job_mock'), tests.plan(), tests.contents(), true, 'mock', 'simulacao', 'strategy.v1', 0, 0);
select tests.eq(tests.used('strategy'), 1, 'estratégia simulada não consome crédito');

-- Esgota o mês: preenche até o limite vigente (100); a seguinte é recusada.
do $$
declare
  v_job uuid;
  v_limit integer := private.credit_limit('strategy');
  v_used integer := tests.used('strategy');
begin
  for i in 1..(v_limit - v_used) loop
    v_job := (public.start_strategy_job(tests.id('brief_a')) ->> 'job_id')::uuid;
    perform public.finish_strategy_job(v_job, tests.plan(), tests.contents(), false, 'openai', 'm', 'strategy.v1', 100, 50);
  end loop;
end;
$$;
select tests.eq(tests.used('strategy'), private.credit_limit('strategy'), 'limite de estratégias atingido no mês');
select tests.throws(format($$select public.start_strategy_job(%L)$$, tests.id('brief_a')), 'P0001', 'estratégia além do limite é recusada');
select tests.eq((select count(*) from public.generation_jobs where brief_id = tests.id('brief_a') and status = 'running'), 0,
  'recusa não deixa job pendurado');
select tests.eq(((public.credit_summary(tests.id('org_a')) ->> 'tokens'))::bigint, ((tests.used('strategy') - 1) * 150)::bigint, 'resumo soma os tokens do mês');

-- ---------------------------------------------------------------- B não vê A
select tests.login(tests.id('user_b'));
select tests.eq((select count(*) from public.usage_ledger), 0, 'B não vê o ledger de A');
select tests.throws(format($$select public.credit_summary(%L)$$, tests.id('org_a')), '42501', 'B não lê o resumo de A');

reset role;
