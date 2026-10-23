-- Testes de isolamento multi-tenant e guardrails do banco.
-- Executado por scripts/db-test.sh contra um Postgres temporário.

create schema tests;
grant usage on schema tests to anon, authenticated;

create function tests.login(p_user uuid) returns void
language sql as $$
  select set_config('request.jwt.claim.sub', coalesce(p_user::text, ''), false);
$$;

-- Executa SQL e exige que falhe com o SQLSTATE esperado.
create function tests.throws(p_sql text, p_state text, p_label text) returns void
language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlstate <> p_state then
      raise exception '[FALHOU] %: esperado SQLSTATE %, recebido % (%)', p_label, p_state, sqlstate, sqlerrm
        using errcode = 'ZT001';
    end if;
    raise notice '[ok] %', p_label;
    return;
  end;
  raise exception '[FALHOU] %: esperado erro %, mas executou', p_label, p_state using errcode = 'ZT001';
end;
$$;

create function tests.eq(p_actual bigint, p_expected bigint, p_label text) returns void
language plpgsql as $$
begin
  if p_actual is distinct from p_expected then
    raise exception '[FALHOU] %: esperado %, recebido %', p_label, p_expected, p_actual using errcode = 'ZT001';
  end if;
  raise notice '[ok] %', p_label;
end;
$$;

create table tests.ctx (key text primary key, value uuid);
grant select, insert, update on tests.ctx to authenticated;

create function tests.id(p_key text) returns uuid
language sql stable as $$ select value from tests.ctx where key = p_key $$;

create function tests.payload(p_confirmed boolean) returns jsonb
language sql immutable as $$
  select jsonb_build_object(
    'business', jsonb_build_object(
      'name', 'Padaria Exemplo', 'segment', 'Padaria', 'city', 'Campinas', 'state', 'SP',
      'instagram_handle', 'padaria.exemplo', 'whatsapp_e164', '+5519999990000',
      'competitors', jsonb_build_array('Padaria Central', 'Café do Zé (@cafedoze)')
    ),
    'offer', jsonb_build_object(
      'name', 'Café da manhã completo', 'description', 'Pão na chapa, café e suco natural.',
      'price_cents', 2490, 'currency', 'BRL', 'price_confirmed_by_client', true,
      'differentiators', jsonb_build_array('Pão saindo do forno às 6h')
    ),
    'audience', jsonb_build_object(
      'description', 'Moradores e trabalhadores do bairro', 'age_min', 25, 'age_max', 55,
      'service_radius_km', 3
    ),
    'goal', jsonb_build_object('objective', 'mensagens_whatsapp'),
    'identity', jsonb_build_object('brand_primary_color', '#C2410C', 'tone_of_voice', 'acolhedor'),
    'review', jsonb_build_object('facts_confirmed', p_confirmed)
  )
$$;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@exemplo.test'),
  ('00000000-0000-0000-0000-00000000000b', 'b@exemplo.test'),
  ('00000000-0000-0000-0000-00000000000c', 'c@exemplo.test');

insert into tests.ctx values
  ('user_a', '00000000-0000-0000-0000-00000000000a'),
  ('user_b', '00000000-0000-0000-0000-00000000000b'),
  ('user_c', '00000000-0000-0000-0000-00000000000c');

-- ---------------------------------------------------------------- anon
set role anon;
select tests.throws('select count(*) from public.organizations', '42501', 'anon não lê organizations');
select tests.throws($$select public.create_organization('X')$$, '42501', 'anon não cria organização');
reset role;

-- ---------------------------------------------------------------- setup A e B
set role authenticated;

select tests.login(tests.id('user_a'));
insert into tests.ctx values ('org_a', public.create_organization('Padaria A', 'corr-a'));

select tests.login(tests.id('user_b'));
insert into tests.ctx values ('org_b', public.create_organization('Loja B'));

select tests.login(null);
select tests.throws($$select public.create_organization('Sem login')$$, '42501', 'sem sub não cria organização');

-- ---------------------------------------------------------------- A enxerga só o seu
select tests.login(tests.id('user_a'));
select tests.eq((select count(*) from public.organizations), 1, 'A vê 1 organização');
select tests.eq((select count(*) from public.organization_members), 1, 'A vê 1 membro');
select tests.eq((select count(*) from public.onboarding_drafts), 1, 'rascunho criado com a organização');

select tests.throws(
  format($$select public.complete_onboarding(%L, tests.payload(false))$$, tests.id('org_a')),
  'P0001', 'onboarding exige confirmação de fatos');

insert into tests.ctx
select 'brief_a', (public.complete_onboarding(tests.id('org_a'), tests.payload(true), 'corr-1') ->> 'brief_id')::uuid;

select tests.eq(
  (select count(*) from public.complete_onboarding(tests.id('org_a'), tests.payload(true)) r
   where (r ->> 'replayed')::boolean and (r ->> 'brief_id')::uuid = tests.id('brief_a')),
  1, 'complete_onboarding é idempotente');
select tests.eq((select count(*) from public.businesses), 1, 'replay não duplica negócio');
select tests.eq((select count(*) from public.briefs where status = 'submitted'), 1, 'brief submetido');
select tests.eq((select cardinality(competitors) from public.businesses limit 1), 2, 'concorrentes informados gravados no negócio');

insert into tests.ctx select 'business_a', id from public.businesses limit 1;

select tests.throws(
  format($$insert into public.offers (organization_id, business_id, name, description, price_cents)
           values (%L, %L, 'Oferta', 'Descrição válida da oferta', 1000)$$, tests.id('org_a'), tests.id('business_a')),
  '23514', 'preço exige confirmação do cliente');

select tests.throws(
  $$insert into public.audit_events (organization_id, action, entity_type) values (tests.id('org_a'), 'x.y', 'z')$$,
  '42501', 'auditoria não aceita insert direto');

select tests.throws(
  format($$insert into public.organization_members (organization_id, user_id, role) values (%L, %L, 'owner')$$,
         tests.id('org_a'), tests.id('user_b')),
  '42501', 'membro não se auto-adiciona/escala');

select tests.eq((select count(*) from public.audit_events), 2, 'owner lê auditoria (criação + onboarding)');

-- ---------------------------------------------------------------- B não acessa A
select tests.login(tests.id('user_b'));
select tests.eq((select count(*) from public.organizations where id = tests.id('org_a')), 0, 'B não vê org A');
select tests.eq((select count(*) from public.businesses), 0, 'B não vê negócios de A');
select tests.eq((select count(*) from public.briefs), 0, 'B não vê briefs de A');
select tests.eq((select count(*) from public.audit_events where organization_id = tests.id('org_a')), 0, 'B não vê auditoria de A');

select tests.throws(
  format($$insert into public.businesses (organization_id, name, segment, city, state)
           values (%L, 'Invasor', 'Teste', 'Campinas', 'SP')$$, tests.id('org_a')),
  '42501', 'B não insere negócio na org A');

with u as (update public.businesses set name = 'Hackeado' where id = tests.id('business_a') returning 1)
select tests.eq((select count(*) from u), 0, 'B não altera negócio de A');

with d as (delete from public.businesses where id = tests.id('business_a') returning 1)
select tests.eq((select count(*) from d), 0, 'B não apaga negócio de A');

select tests.throws(
  format($$select public.complete_onboarding(%L, tests.payload(true))$$, tests.id('org_a')),
  '42501', 'B não conclui onboarding de A');

select tests.throws(
  format($$select public.log_audit_event(%L, 'x.y', 'z')$$, tests.id('org_a')),
  '42501', 'B não registra auditoria em A');

-- FK composta impede apontar para negócio de outra organização.
select tests.throws(
  format($$insert into public.offers (organization_id, business_id, name, description)
           values (%L, %L, 'Oferta B', 'Descrição válida da oferta')$$, tests.id('org_b'), tests.id('business_a')),
  '23503', 'oferta da org B não referencia negócio da org A');

-- ---------------------------------------------------------------- papel member
reset role;
insert into public.organization_members (organization_id, user_id, role)
values (tests.id('org_a'), tests.id('user_c'), 'member');
set role authenticated;

select tests.login(tests.id('user_c'));
select tests.eq((select count(*) from public.businesses), 1, 'member vê negócio da org');

with u as (update public.organizations set name = 'Renomeada' where id = tests.id('org_a') returning 1)
select tests.eq((select count(*) from u), 0, 'member não renomeia organização');

with d as (delete from public.businesses where id = tests.id('business_a') returning 1)
select tests.eq((select count(*) from d), 0, 'member não apaga negócio');

select tests.eq((select count(*) from public.audit_events), 0, 'member não lê auditoria');

-- ---------------------------------------------------------------- owner ainda íntegro
select tests.login(tests.id('user_a'));
select tests.eq((select count(*) from public.businesses where name = 'Padaria Exemplo'), 1, 'negócio de A intacto');

reset role;
