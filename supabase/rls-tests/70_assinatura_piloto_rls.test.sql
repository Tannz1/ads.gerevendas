-- Testes de RLS para Assinatura SaaS, Webhooks Idempotentes e Feedback do Piloto (Etapas 4 e 5).

set role authenticated;

-- 1. Member (user_c) não processa eventos de cobrança nem lê billing_events
select tests.login(tests.id('user_c'));
select tests.throws(
  format($$select public.process_billing_event(%L, 'mock', 'evt_member_1', 'subscription.activated', 19900, true)$$, tests.id('org_a')),
  '42501', 'member não processa evento de cobrança'
);
select tests.eq((select count(*) from public.billing_events), 0, 'member não lê billing_events');

-- 2. Owner (user_a) ativa assinatura (em modo simulação) e verifica idempotência
select tests.login(tests.id('user_a'));
select tests.eq(
  (select ((public.process_billing_event(tests.id('org_a'), 'mock', 'evt_001', 'subscription.activated', 19900, true, 'corr-b1')) ->> 'replayed')::boolean)::int,
  0, 'primeiro evento de cobrança processado'
);

select tests.eq(
  (select ((public.process_billing_event(tests.id('org_a'), 'mock', 'evt_001', 'subscription.activated', 19900, true, 'corr-b1')) ->> 'replayed')::boolean)::int,
  1, 'evento duplicado (provider, event_id) é idempotente'
);

select tests.eq(
  (select count(*) from public.subscriptions where organization_id = tests.id('org_a') and status = 'active'),
  1, 'assinatura ativa para org_a'
);
select tests.eq((select count(*) from public.billing_events where organization_id = tests.id('org_a')), 1, 'apenas 1 billing_event gravado');

-- 3. Falha de pagamento muda status para past_due
select public.process_billing_event(tests.id('org_a'), 'mock', 'evt_002', 'invoice.payment_failed', 19900, true);
select tests.eq(
  (select count(*) from public.subscriptions where organization_id = tests.id('org_a') and status = 'past_due'),
  1, 'status muda para past_due após invoice.payment_failed'
);

-- 4. Empresa B não vê assinatura nem eventos de A
select tests.login(tests.id('user_b'));
select tests.eq((select count(*) from public.subscriptions where organization_id = tests.id('org_a')), 0, 'B não vê assinatura de A');
select tests.eq((select count(*) from public.billing_events where organization_id = tests.id('org_a')), 0, 'B não vê billing_events de A');

-- 5. Feedback do piloto: membro da empresa envia e outra empresa não vê
select tests.login(tests.id('user_c'));
select public.submit_pilot_feedback(tests.id('org_a'), 'creative', 'helpful', 'Peças ficaram claras para o WhatsApp.', tests.id('creative_a'), 'corr-fb');
select tests.eq((select count(*) from public.pilot_feedback where organization_id = tests.id('org_a')), 1, 'membro registra e lê feedback da própria org');

select tests.login(tests.id('user_b'));
select tests.eq((select count(*) from public.pilot_feedback where organization_id = tests.id('org_a')), 0, 'B não lê feedback de A');
select tests.throws(
  format($$select public.submit_pilot_feedback(%L, 'strategy', 'helpful', 'Invasão')$$, tests.id('org_a')),
  '42501', 'B não envia feedback em nome de A'
);

reset role;
