# BM única: contas e conexões — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cada cliente recebe uma conta de anúncios do estoque da BM da GereVendas, compartilha Página e Instagram como parceiro, vira admin da própria conta e cadastra o pagamento na Meta, tudo guiado por `/app/conexoes` e sem App Review.

**Architecture:** Estoque e status dos 4 passos no Postgres (RLS + RPCs). O que representa a verdade da Meta só é gravado por RPCs exclusivas de `service_role`, chamadas pelo servidor depois de consultar a Graph API com o token do System User. Um `MetaBusinessClient` com implementações real (Graph v25.0) e mock (Simulação rotulada). O OAuth do cliente é removido.

**Tech Stack:** Next.js 16 (App Router, server actions), Supabase Postgres + supabase-js, Zod 4, Vitest 5, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-25-bm-contas-conexoes-design.md` (ADR `docs/adr/0005-bm-unica-estoque-de-contas.md`).

## Global Constraints

- Graph/Marketing API fixada em `v25.0` (`META_GRAPH_VERSION`).
- Token do System User só em variável de servidor (`META_SYSTEM_USER_TOKEN`); nunca no banco, logs, bundle ou testes versionados. Toda chamada leva `appsecret_proof`.
- Nenhum token de cliente; nenhum login do Facebook do cliente no app.
- O app nunca envia pedido de acesso a Página (`POST client_pages`).
- IDs da Meta são strings opacas; contas no formato `act_…`.
- `organization_id` em toda entidade de negócio; RLS ligada em toda tabela nova; nada de desligar RLS.
- Modo mock sempre rotulado **Simulação** na UI.
- Erros de API no formato `ApiResult` (`src/contracts/api.ts`); logs estruturados com `correlation_id`.
- Textos em pt-BR simples; nenhuma promessa de aprovação de anúncio pela Meta.
- Antes do PR: `npm run check`, `npm run test:db`, `npm run build` + `npm run test:e2e`.

## Review Focus

1. Link de Página colado em formatos reais (`m.facebook.com`, `?ref=…`, `profile.php?id=`, link de compartilhamento `facebook.com/share/…`): os válidos devem ser reconhecidos e os de compartilhamento recusados com orientação. → testes em Task 2.
2. Dono clica duas vezes em "Reservar minha conta" ou abre duas abas: deve receber sempre a mesma conta. → `pg_advisory_xact_lock` + teste de repetição em Task 1.
3. Meta fora do ar ou lenta durante "Verificar agora": nenhum passo regride e o cliente vê mensagem amigável. → testes de timeout/erro 5xx em Task 3.
4. Cliente ligou a Página errada: precisa conseguir desfazer e ligar outra. → teste de `unlink_meta_page` pelo owner em Task 1.
5. Kill switch ligado com cliente no meio da trilha: nenhuma chamada à Meta, tela continua mostrando o estado. → teste de `resolveMetaBusinessMode` em Task 3.

---

### Task 1: Banco — estoque, operadores, passos e RPCs

**Files:**
- Create: `supabase/migrations/20261025120000_bm_estoque_contas.sql`
- Create: `supabase/rls-tests/80_meta_pool_rls.test.sql`
- Modify: `supabase/rls-tests/60_campanhas_meta_rls.test.sql` (passos 1 e 3)

**Interfaces:**
- Produces (RPCs, `authenticated`): `assign_pool_account(p_org uuid, p_simulated boolean, p_correlation_id text) → jsonb {pool_empty, replayed, ad_account_id?, name?, newly_assigned?}`; `unlink_meta_page(p_org uuid, p_correlation_id text)`; `register_pool_accounts(p_accounts jsonb, p_simulated boolean, p_source text, p_correlation_id text) → integer`; `retire_pool_account(p_id uuid, p_correlation_id text)`; `meta_pool_overview(p_simulated boolean) → jsonb {available, assigned, retired, waiting}`; `am_i_platform_operator() → boolean`.
- Produces (RPCs, só `service_role`): `meta_set_ad_account_name(p_org, p_name, p_correlation_id)`; `meta_set_page(p_org, p_status meta_step_status, p_page_id, p_page_name, p_correlation_id)` (erro `page_already_linked`); `meta_set_instagram(p_org, p_status, p_instagram_id, p_correlation_id)` (erro `instagram_already_linked`); `meta_set_invite(p_org, p_status meta_invite_status, p_email, p_business_user_id, p_correlation_id)`; `meta_set_billing(p_org, p_verified boolean, p_correlation_id)`; `meta_touch_checked(p_org, p_min_interval_seconds int) → boolean`; `meta_link_attempt(p_org) → boolean`.
- Produces (colunas novas em `meta_connections`): `ad_account_status`, `pool_requested_at`, `page_access_status`, `instagram_status`, `client_invite_status`, `client_invite_email`, `client_business_user_id`, `billing_status`, `last_checked_at`.

- [ ] **Step 1: Escrever o teste de RLS (falha: funções não existem)**

`supabase/rls-tests/80_meta_pool_rls.test.sql`:

```sql
-- Testes de RLS e guardrails do estoque de contas e dos passos Meta (ADR 0005).
-- Roda depois de 10..70: usa user_a (owner org_a), user_b (owner org_b), user_c (member org_a).

reset role;
grant usage on schema tests to service_role;
grant select on tests.ctx to service_role;
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
```

- [ ] **Step 2: Ajustar o teste 60 (o RPC antigo `upsert_meta_connection` deixa de existir)**

Em `supabase/rls-tests/60_campanhas_meta_rls.test.sql`, apagar o bloco "-- 1. Member (user_c na org_a) não pode conectar Meta" (linhas 5-10; o caso migra para o teste 80, item 4) e trocar o bloco "-- 3. Owner (user_a) conecta ativos Meta em modo simulação" (`select public.upsert_meta_connection(...)`, linhas 24-36) por:

```sql
-- 3. Conexão Meta pronta (4 passos do ADR 0005 concluídos), gravada pelo superusuário de teste
reset role;
insert into public.meta_connections (
  organization_id, status, simulated, ad_account_id, ad_account_name, page_id, page_name, instagram_actor_id,
  ad_account_status, page_access_status, instagram_status, client_invite_status, billing_status,
  billing_verified_on_meta, connected_at
) values (
  tests.id('org_a'), 'connected', true, 'act_998877', 'Padaria A Ads', 'page_112233', 'Padaria A Oficial', 'ig_445566',
  'done', 'done', 'done', 'accepted', 'verified', true, now()
);
set role authenticated;
select tests.login(tests.id('user_a'));
```

O passo 2 do teste 60 (publicar sem conexão falha) continua antes do passo 3 e segue válido.

- [ ] **Step 3: Rodar e ver falhar**

Run: `npm run test:db`
Expected: FAIL em `80_meta_pool_rls.test.sql` (`function public.register_pool_accounts does not exist`) e em `60` (`meta_connections` sem as colunas novas). Sem Postgres local, rodar no CI (job `banco`) e registrar.

- [ ] **Step 4: Escrever a migration**

`supabase/migrations/20261025120000_bm_estoque_contas.sql`:

```sql
-- GereVendas Ads — BM única com estoque de contas de anúncios (ADR 0005).
-- Guardrails:
-- 1. Estoque e vínculos só mudam por RPC. O que representa a verdade da Meta (Página encontrada,
--    convite aceito, pagamento) só é gravado pelo servidor, via RPCs exclusivas de service_role.
-- 2. Uma conta do estoque, uma Página e um Instagram pertencem a no máximo uma organização.
-- 3. O fluxo antigo (cliente escolhia a própria conta, ADR 0004) é substituído: conexões antigas
--    voltam a desconectadas.

-- ---------------------------------------------------------------------------
-- 1. Operadores da plataforma (equipe GereVendas)
-- ---------------------------------------------------------------------------
create table private.platform_operators (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
revoke all on private.platform_operators from public, anon, authenticated;

create function private.is_platform_operator() returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from private.platform_operators o where o.user_id = (select auth.uid()))
$$;
revoke all on function private.is_platform_operator() from public;
grant execute on function private.is_platform_operator() to authenticated;

create function public.am_i_platform_operator() returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_platform_operator()
$$;

-- ---------------------------------------------------------------------------
-- 2. Tipos
-- ---------------------------------------------------------------------------
create type public.meta_pool_status as enum ('available', 'assigned', 'retired');
create type public.meta_step_status as enum ('pending', 'in_progress', 'awaiting_meta', 'done', 'error');
create type public.meta_invite_status as enum ('not_sent', 'pending', 'accepted', 'expired');
create type public.meta_billing_status as enum ('unverified', 'verified');

-- ---------------------------------------------------------------------------
-- 3. Estoque de contas de anúncios da BM
-- ---------------------------------------------------------------------------
create table public.meta_ad_account_pool (
  id uuid primary key default gen_random_uuid(),
  ad_account_id text not null unique check (ad_account_id ~ '^act_[0-9A-Za-z_]{3,60}$'),
  name text not null check (char_length(name) between 2 and 120),
  currency char(3) not null default 'BRL' check (currency ~ '^[A-Z]{3}$'),
  timezone_id integer,
  status public.meta_pool_status not null default 'available',
  -- Organização excluída (LGPD) deixa a conta "assigned" sem dono: não volta ao estoque sozinha.
  organization_id uuid unique references public.organizations (id) on delete set null,
  assigned_at timestamptz,
  source text not null check (source in ('api', 'imported')),
  simulated boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (organization_id is null or status = 'assigned')
);

create index meta_pool_available_idx on public.meta_ad_account_pool (simulated, created_at)
  where status = 'available';

create trigger meta_ad_account_pool_updated_at before update on public.meta_ad_account_pool
  for each row execute function private.set_updated_at();

-- Registro das ações do operador (não pertencem a uma organização, por isso fora de audit_events).
create table public.meta_pool_events (
  id bigint generated always as identity primary key,
  actor_user_id uuid references auth.users (id) on delete set null,
  action text not null check (action in ('registered', 'retired')),
  ad_account_id text,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now()
);

revoke all on public.meta_ad_account_pool, public.meta_pool_events from anon, authenticated, public;
grant select on public.meta_ad_account_pool, public.meta_pool_events to authenticated;
alter table public.meta_ad_account_pool enable row level security;
alter table public.meta_pool_events enable row level security;

create policy meta_pool_select on public.meta_ad_account_pool
  for select to authenticated
  using (private.is_platform_operator() or (organization_id is not null and private.is_org_member(organization_id)));

create policy meta_pool_events_select on public.meta_pool_events
  for select to authenticated using (private.is_platform_operator());

-- ---------------------------------------------------------------------------
-- 4. Passos da conexão em meta_connections
-- ---------------------------------------------------------------------------
drop function public.upsert_meta_connection(uuid, text, text, text, text, text, text, boolean, boolean, text);
drop function public.disconnect_meta_connection(uuid, text);

update public.meta_connections
   set status = 'disconnected',
       ad_account_id = null,
       ad_account_name = null,
       page_id = null,
       page_name = null,
       instagram_actor_id = null,
       whatsapp_phone_e164 = null,
       billing_verified_on_meta = false;

alter table public.meta_connections
  add column ad_account_status public.meta_step_status not null default 'pending',
  add column pool_requested_at timestamptz,
  add column page_access_status public.meta_step_status not null default 'pending',
  add column instagram_status public.meta_step_status not null default 'pending',
  add column client_invite_status public.meta_invite_status not null default 'not_sent',
  add column client_invite_email text check (client_invite_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  add column client_business_user_id text check (char_length(client_business_user_id) between 1 and 128),
  add column billing_status public.meta_billing_status not null default 'unverified',
  add column last_checked_at timestamptz;

create unique index meta_connections_page_unique on public.meta_connections (page_id)
  where page_id is not null;
create unique index meta_connections_instagram_unique on public.meta_connections (instagram_actor_id)
  where instagram_actor_id is not null;

-- ---------------------------------------------------------------------------
-- 5. Auxiliares
-- ---------------------------------------------------------------------------
create function private.meta_audit(p_org uuid, p_action text, p_correlation_id text, p_metadata jsonb)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.audit_events (organization_id, actor_user_id, action, entity_type, entity_id, correlation_id, metadata)
  values (p_org, (select auth.uid()), p_action, 'meta_connection', p_org, left(p_correlation_id, 64),
          coalesce(p_metadata, '{}'::jsonb));
$$;
revoke all on function private.meta_audit(uuid, text, text, jsonb) from public;

-- Recalcula `status`: só fica `connected` com os 4 passos concluídos.
create function private.meta_refresh_status(p_org uuid) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.meta_connections m
     set status = s.next_status,
         billing_verified_on_meta = (m.billing_status = 'verified'),
         connected_at = case when s.next_status = 'connected' and m.status <> 'connected' then now() else m.connected_at end
    from (
      select c.organization_id,
             (case when c.ad_account_status = 'done' and c.ad_account_id is not null
                        and c.page_access_status = 'done' and c.page_id is not null
                        and c.client_invite_status = 'accepted'
                        and c.billing_status = 'verified'
                   then 'connected' else 'disconnected' end)::public.meta_connection_status as next_status
        from public.meta_connections c
       where c.organization_id = p_org
    ) s
   where m.organization_id = s.organization_id;
end;
$$;
revoke all on function private.meta_refresh_status(uuid) from public;

-- ---------------------------------------------------------------------------
-- 6. RPCs do cliente (owner)
-- ---------------------------------------------------------------------------

-- Reserva uma conta do estoque para a organização. Idempotente; sem estoque, entra na fila.
create function public.assign_pool_account(
  p_org uuid,
  p_simulated boolean,
  p_correlation_id text default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_conn public.meta_connections%rowtype;
  v_pool public.meta_ad_account_pool%rowtype;
begin
  if v_uid is null or not private.has_org_role(p_org, array['owner']::public.member_role[]) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  -- Serializa pedidos da mesma organização (clique duplo, duas abas).
  perform pg_advisory_xact_lock(hashtext('meta_pool:' || p_org::text));

  select * into v_conn from public.meta_connections c where c.organization_id = p_org;
  if v_conn.ad_account_status = 'done' and v_conn.ad_account_id is not null then
    return jsonb_build_object('pool_empty', false, 'replayed', true,
                              'ad_account_id', v_conn.ad_account_id, 'name', v_conn.ad_account_name);
  end if;

  select * into v_pool from public.meta_ad_account_pool p where p.organization_id = p_org;
  if v_pool.id is null then
    select * into v_pool
      from public.meta_ad_account_pool p
     where p.status = 'available' and p.simulated = coalesce(p_simulated, true)
     order by p.created_at
     limit 1
     for update skip locked;
  end if;

  if v_pool.id is null then
    insert into public.meta_connections (organization_id, simulated, ad_account_status, pool_requested_at)
    values (p_org, coalesce(p_simulated, true), 'awaiting_meta', now())
    on conflict (organization_id) do update
      set ad_account_status = 'awaiting_meta',
          pool_requested_at = coalesce(public.meta_connections.pool_requested_at, now());
    perform private.meta_audit(p_org, 'meta.pool_empty', p_correlation_id, '{}'::jsonb);
    return jsonb_build_object('pool_empty', true, 'replayed', false);
  end if;

  update public.meta_ad_account_pool
     set status = 'assigned', organization_id = p_org, assigned_at = coalesce(assigned_at, now())
   where id = v_pool.id;

  insert into public.meta_connections (
    organization_id, simulated, ad_account_id, ad_account_name, ad_account_status, pool_requested_at, connected_by
  ) values (p_org, v_pool.simulated, v_pool.ad_account_id, v_pool.name, 'done', null, v_uid)
  on conflict (organization_id) do update set
    simulated = excluded.simulated,
    ad_account_id = excluded.ad_account_id,
    ad_account_name = excluded.ad_account_name,
    ad_account_status = 'done',
    pool_requested_at = null,
    connected_by = excluded.connected_by;

  perform private.meta_audit(p_org, 'meta.ad_account_assigned', p_correlation_id,
    jsonb_build_object('ad_account_id', v_pool.ad_account_id, 'simulated', v_pool.simulated));
  perform private.meta_refresh_status(p_org);

  return jsonb_build_object('pool_empty', false, 'replayed', false, 'newly_assigned', true,
                            'ad_account_id', v_pool.ad_account_id, 'name', v_pool.name);
end;
$$;

-- Desfaz a Página/Instagram ligados (owner da organização ou operador).
create function public.unlink_meta_page(p_org uuid, p_correlation_id text default null) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null
     or not (private.is_platform_operator() or private.has_org_role(p_org, array['owner']::public.member_role[])) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  update public.meta_connections
     set page_id = null, page_name = null, page_access_status = 'pending',
         instagram_actor_id = null, instagram_status = 'pending'
   where organization_id = p_org;

  perform private.meta_audit(p_org, 'meta.page_unlinked', p_correlation_id, '{}'::jsonb);
  perform private.meta_refresh_status(p_org);
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. RPCs do operador
-- ---------------------------------------------------------------------------
create function public.register_pool_accounts(
  p_accounts jsonb,
  p_simulated boolean,
  p_source text,
  p_correlation_id text default null
) returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if (select auth.uid()) is null or not private.is_platform_operator() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_source not in ('api', 'imported') then
    raise exception 'invalid_source' using errcode = 'P0001';
  end if;
  if jsonb_typeof(p_accounts) <> 'array' then
    raise exception 'invalid_accounts' using errcode = 'P0001';
  end if;

  with ins as (
    insert into public.meta_ad_account_pool (ad_account_id, name, currency, timezone_id, source, simulated)
    select a ->> 'ad_account_id',
           left(coalesce(nullif(a ->> 'name', ''), a ->> 'ad_account_id'), 120),
           coalesce(nullif(a ->> 'currency', ''), 'BRL'),
           nullif(a ->> 'timezone_id', '')::integer,
           p_source,
           coalesce(p_simulated, true)
      from jsonb_array_elements(p_accounts) a
    on conflict (ad_account_id) do nothing
    returning 1
  )
  select count(*) into v_count from ins;

  insert into public.meta_pool_events (actor_user_id, action, metadata)
  values ((select auth.uid()), 'registered',
          jsonb_build_object('count', v_count, 'source', p_source, 'simulated', coalesce(p_simulated, true),
                             'correlation_id', p_correlation_id));
  return v_count;
end;
$$;

create function public.retire_pool_account(p_id uuid, p_correlation_id text default null) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_account text;
begin
  if (select auth.uid()) is null or not private.is_platform_operator() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  update public.meta_ad_account_pool set status = 'retired'
   where id = p_id and status = 'available'
  returning ad_account_id into v_account;
  if v_account is null then
    raise exception 'not_available' using errcode = 'P0001';
  end if;

  insert into public.meta_pool_events (actor_user_id, action, ad_account_id, metadata)
  values ((select auth.uid()), 'retired', v_account, jsonb_build_object('correlation_id', p_correlation_id));
end;
$$;

create function public.meta_pool_overview(p_simulated boolean) returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if (select auth.uid()) is null or not private.is_platform_operator() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select jsonb_build_object(
           'available', count(*) filter (where p.status = 'available'),
           'assigned', count(*) filter (where p.status = 'assigned'),
           'retired', count(*) filter (where p.status = 'retired'),
           'waiting', (select count(*) from public.meta_connections c
                        where c.pool_requested_at is not null and c.ad_account_status <> 'done'))
    into v_result
    from public.meta_ad_account_pool p
   where p.simulated = coalesce(p_simulated, true);
  return v_result;
end;
$$;

-- ---------------------------------------------------------------------------
-- 8. RPCs do servidor (service_role): o que a Graph API confirmou
-- ---------------------------------------------------------------------------
create function public.meta_set_ad_account_name(p_org uuid, p_name text, p_correlation_id text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_account text;
begin
  update public.meta_connections set ad_account_name = left(p_name, 120)
   where organization_id = p_org
  returning ad_account_id into v_account;
  update public.meta_ad_account_pool set name = left(p_name, 120) where ad_account_id = v_account;
  perform private.meta_audit(p_org, 'meta.ad_account_renamed', p_correlation_id, '{}'::jsonb);
end;
$$;

create function public.meta_set_page(
  p_org uuid,
  p_status public.meta_step_status,
  p_page_id text default null,
  p_page_name text default null,
  p_correlation_id text default null
) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_status = 'done' and (p_page_id is null or p_page_name is null) then
    raise exception 'page_required' using errcode = 'P0001';
  end if;

  begin
    update public.meta_connections
       set page_access_status = p_status,
           page_id = case when p_status = 'done' then p_page_id end,
           page_name = case when p_status = 'done' then left(p_page_name, 120) end
     where organization_id = p_org;
    if not found then
      raise exception 'connection_not_found' using errcode = 'P0001';
    end if;
  exception when unique_violation then
    raise exception 'page_already_linked' using errcode = 'P0001';
  end;

  perform private.meta_audit(p_org, 'meta.page_linked', p_correlation_id,
    jsonb_build_object('status', p_status, 'page_id', p_page_id));
  perform private.meta_refresh_status(p_org);
end;
$$;

create function public.meta_set_instagram(
  p_org uuid,
  p_status public.meta_step_status,
  p_instagram_id text default null,
  p_correlation_id text default null
) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_status = 'done' and p_instagram_id is null then
    raise exception 'instagram_required' using errcode = 'P0001';
  end if;

  begin
    update public.meta_connections
       set instagram_status = p_status,
           instagram_actor_id = case when p_status = 'done' then p_instagram_id end
     where organization_id = p_org;
    if not found then
      raise exception 'connection_not_found' using errcode = 'P0001';
    end if;
  exception when unique_violation then
    raise exception 'instagram_already_linked' using errcode = 'P0001';
  end;

  perform private.meta_audit(p_org, 'meta.instagram_linked', p_correlation_id,
    jsonb_build_object('status', p_status));
end;
$$;

create function public.meta_set_invite(
  p_org uuid,
  p_status public.meta_invite_status,
  p_email text default null,
  p_business_user_id text default null,
  p_correlation_id text default null
) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.meta_connections
     set client_invite_status = p_status,
         client_invite_email = coalesce(p_email, client_invite_email),
         client_business_user_id = coalesce(p_business_user_id, client_business_user_id)
   where organization_id = p_org;
  if not found then
    raise exception 'connection_not_found' using errcode = 'P0001';
  end if;
  if p_status = 'accepted'
     and (select c.client_business_user_id from public.meta_connections c where c.organization_id = p_org) is null then
    raise exception 'business_user_required' using errcode = 'P0001';
  end if;

  perform private.meta_audit(p_org, 'meta.invite_updated', p_correlation_id, jsonb_build_object('status', p_status));
  perform private.meta_refresh_status(p_org);
end;
$$;

create function public.meta_set_billing(p_org uuid, p_verified boolean, p_correlation_id text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.meta_connections
     set billing_status = case when p_verified then 'verified' else 'unverified' end::public.meta_billing_status
   where organization_id = p_org;
  if not found then
    raise exception 'connection_not_found' using errcode = 'P0001';
  end if;

  perform private.meta_audit(p_org, 'meta.billing_checked', p_correlation_id, jsonb_build_object('verified', p_verified));
  perform private.meta_refresh_status(p_org);
end;
$$;

-- Devolve true e marca a hora se a última checagem na Meta foi há mais de p_min_interval_seconds.
create function public.meta_touch_checked(p_org uuid, p_min_interval_seconds integer) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.meta_connections
     set last_checked_at = now()
   where organization_id = p_org
     and (last_checked_at is null or last_checked_at < now() - make_interval(secs => p_min_interval_seconds));
  return found;
end;
$$;

-- Limite de 10 tentativas de vincular Página por organização por hora.
create function public.meta_link_attempt(p_org uuid) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  select count(*) into v_count
    from public.audit_events a
   where a.organization_id = p_org and a.action = 'meta.page_link_attempt'
     and a.created_at > now() - interval '1 hour';
  if v_count >= 10 then
    return false;
  end if;
  perform private.meta_audit(p_org, 'meta.page_link_attempt', null, '{}'::jsonb);
  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- 9. Grants (o Supabase concede EXECUTE por padrão: revogar explicitamente)
-- ---------------------------------------------------------------------------
revoke all on function public.am_i_platform_operator() from public, anon;
revoke all on function public.assign_pool_account(uuid, boolean, text) from public, anon;
revoke all on function public.unlink_meta_page(uuid, text) from public, anon;
revoke all on function public.register_pool_accounts(jsonb, boolean, text, text) from public, anon;
revoke all on function public.retire_pool_account(uuid, text) from public, anon;
revoke all on function public.meta_pool_overview(boolean) from public, anon;

grant execute on function public.am_i_platform_operator() to authenticated;
grant execute on function public.assign_pool_account(uuid, boolean, text) to authenticated;
grant execute on function public.unlink_meta_page(uuid, text) to authenticated;
grant execute on function public.register_pool_accounts(jsonb, boolean, text, text) to authenticated;
grant execute on function public.retire_pool_account(uuid, text) to authenticated;
grant execute on function public.meta_pool_overview(boolean) to authenticated;

revoke all on function public.meta_set_ad_account_name(uuid, text, text) from public, anon, authenticated;
revoke all on function public.meta_set_page(uuid, public.meta_step_status, text, text, text) from public, anon, authenticated;
revoke all on function public.meta_set_instagram(uuid, public.meta_step_status, text, text) from public, anon, authenticated;
revoke all on function public.meta_set_invite(uuid, public.meta_invite_status, text, text, text) from public, anon, authenticated;
revoke all on function public.meta_set_billing(uuid, boolean, text) from public, anon, authenticated;
revoke all on function public.meta_touch_checked(uuid, integer) from public, anon, authenticated;
revoke all on function public.meta_link_attempt(uuid) from public, anon, authenticated;

grant execute on function public.meta_set_ad_account_name(uuid, text, text) to service_role;
grant execute on function public.meta_set_page(uuid, public.meta_step_status, text, text, text) to service_role;
grant execute on function public.meta_set_instagram(uuid, public.meta_step_status, text, text) to service_role;
grant execute on function public.meta_set_invite(uuid, public.meta_invite_status, text, text, text) to service_role;
grant execute on function public.meta_set_billing(uuid, boolean, text) to service_role;
grant execute on function public.meta_touch_checked(uuid, integer) to service_role;
grant execute on function public.meta_link_attempt(uuid) to service_role;
```

- [ ] **Step 5: Rodar e ver passar**

Run: `npm run test:db`
Expected: todas as suites passam, inclusive `80_meta_pool_rls.test.sql`. Sem Postgres local: abrir PR em rascunho e conferir o job `banco` do CI.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20261025120000_bm_estoque_contas.sql supabase/rls-tests/80_meta_pool_rls.test.sql supabase/rls-tests/60_campanhas_meta_rls.test.sql
git commit -m "feat(meta): estoque de contas da BM, passos da conexão e RPCs com RLS"
```

---

### Task 2: Contratos e link de Página

**Files:**
- Create: `src/contracts/meta.ts`
- Create: `src/lib/meta-page-link.ts`
- Create: `src/lib/meta-links.ts`
- Modify: `src/contracts/index.ts` (exportar `./meta`)
- Modify: `src/contracts/campaigns.ts` (remover `connectMetaAssetsSchema`/`ConnectMetaAssetsInput`)
- Modify: `tests/unit/campaigns-contract.test.ts` (remover os casos de `connectMetaAssetsSchema`)
- Test: `tests/unit/meta-page-link.test.ts`, `tests/unit/meta-contract.test.ts`

**Interfaces:**
- Produces: `metaStepStatusSchema`, `MetaStepStatus`, `MetaInviteStatus`, `MetaPoolStatus`, `adAccountIdSchema`, `linkPageSchema` (`{page_url, instagram_username?}` → `instagram_username` minúsculo sem `@`), `sendInviteSchema` (`{email}`), `registerPoolAccountsSchema` (`{ad_account_ids: string[]}`), `retirePoolAccountSchema` (`{id}`).
- Produces: `type PageRef = {kind:"id"; id:string} | {kind:"username"; username:string}`; `parsePageLink(raw: string): PageRef | null`; `matchesPage(ref: PageRef, page: {id: string; username?: string | null; link?: string | null}): boolean`.
- Produces: `META_PARTNERS_URL: string`; `metaBillingUrl(adAccountId: string): string`.

- [ ] **Step 1: Testes que falham**

`tests/unit/meta-page-link.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { matchesPage, parsePageLink } from "@/lib/meta-page-link";

describe("parsePageLink", () => {
  it.each([
    ["https://www.facebook.com/padariadojoao", { kind: "username", username: "padariadojoao" }],
    ["facebook.com/PadariaDoJoao/", { kind: "username", username: "padariadojoao" }],
    ["https://m.facebook.com/padaria.do.joao?ref=bookmarks", { kind: "username", username: "padaria.do.joao" }],
    ["https://web.facebook.com/padaria-do-joao", { kind: "username", username: "padaria-do-joao" }],
    ["https://www.facebook.com/profile.php?id=100089123456789", { kind: "id", id: "100089123456789" }],
    ["https://www.facebook.com/pages/Padaria/123456789012", { kind: "id", id: "123456789012" }],
    ["https://fb.com/123456789012", { kind: "id", id: "123456789012" }],
  ])("reconhece %s", (link, expected) => {
    expect(parsePageLink(link)).toEqual(expected);
  });

  it.each([
    "",
    "padariadojoao",
    "https://instagram.com/padariadojoao",
    "https://facebook.com.golpe.com/padaria",
    "https://www.facebook.com/share/1AbCdEf/",
    "https://www.facebook.com/groups/123456",
    "https://www.facebook.com/profile.php",
    "javascript:alert(1)",
  ])("recusa %s", (link) => {
    expect(parsePageLink(link)).toBeNull();
  });
});

describe("matchesPage", () => {
  const page = { id: "123456789012", username: "PadariaDoJoao", link: "https://www.facebook.com/PadariaDoJoao" };

  it("casa por ID, por nome de usuário e pelo link da Página", () => {
    expect(matchesPage({ kind: "id", id: "123456789012" }, page)).toBe(true);
    expect(matchesPage({ kind: "username", username: "padariadojoao" }, page)).toBe(true);
    expect(matchesPage({ kind: "username", username: "padariadojoao" }, { ...page, username: null })).toBe(true);
  });

  it("não casa com outra Página", () => {
    expect(matchesPage({ kind: "id", id: "999" }, page)).toBe(false);
    expect(matchesPage({ kind: "username", username: "outra" }, page)).toBe(false);
  });
});
```

`tests/unit/meta-contract.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { linkPageSchema, registerPoolAccountsSchema, sendInviteSchema } from "@/contracts/meta";
import { metaBillingUrl } from "@/lib/meta-links";

describe("contratos Meta", () => {
  it("normaliza o @ do Instagram e aceita campo vazio", () => {
    expect(linkPageSchema.parse({ page_url: "facebook.com/x1", instagram_username: "@Padaria.Joao" }).instagram_username).toBe(
      "padaria.joao",
    );
    expect(linkPageSchema.parse({ page_url: "facebook.com/x1", instagram_username: "" }).instagram_username).toBeUndefined();
    expect(linkPageSchema.safeParse({ page_url: "facebook.com/x1", instagram_username: "com espaço" }).success).toBe(false);
  });

  it("valida e-mail do convite e IDs de conta", () => {
    expect(sendInviteSchema.safeParse({ email: "dono@padaria.com" }).success).toBe(true);
    expect(sendInviteSchema.safeParse({ email: "dono" }).success).toBe(false);
    expect(registerPoolAccountsSchema.safeParse({ ad_account_ids: ["act_123456"] }).success).toBe(true);
    expect(registerPoolAccountsSchema.safeParse({ ad_account_ids: ["123456"] }).success).toBe(false);
  });

  it("monta o link de pagamento com o número da conta", () => {
    expect(metaBillingUrl("act_123456")).toContain("asset_id=123456");
  });
});
```

- [ ] **Step 2: Ver falhar**

Run: `npx vitest run tests/unit/meta-page-link.test.ts tests/unit/meta-contract.test.ts`
Expected: FAIL (`Cannot find module '@/lib/meta-page-link'`).

- [ ] **Step 3: Implementar**

`src/contracts/meta.ts`:

```ts
import { z } from "zod";
import { externalIdSchema } from "./common";

export const META_STEP_STATUSES = ["pending", "in_progress", "awaiting_meta", "done", "error"] as const;
export const metaStepStatusSchema = z.enum(META_STEP_STATUSES);
export type MetaStepStatus = z.infer<typeof metaStepStatusSchema>;

export const META_INVITE_STATUSES = ["not_sent", "pending", "accepted", "expired"] as const;
export type MetaInviteStatus = (typeof META_INVITE_STATUSES)[number];

export const META_POOL_STATUSES = ["available", "assigned", "retired"] as const;
export type MetaPoolStatus = (typeof META_POOL_STATUSES)[number];

export const adAccountIdSchema = externalIdSchema.regex(/^act_[0-9A-Za-z_]{3,60}$/, "ID de conta inválido");

export const linkPageSchema = z.object({
  page_url: z.string().trim().min(5, "Cole o link da sua Página do Facebook").max(300),
  instagram_username: z
    .string()
    .trim()
    .max(31)
    .regex(/^@?[A-Za-z0-9._]{0,30}$/, "Digite o @ do Instagram sem espaços")
    .optional()
    .transform((v) => (v ? v.replace(/^@/, "").toLowerCase() : undefined)),
});
export type LinkPageInput = z.input<typeof linkPageSchema>;

export const sendInviteSchema = z.object({
  email: z.email("Informe um e-mail válido").max(254),
});

export const registerPoolAccountsSchema = z.object({
  ad_account_ids: z.array(adAccountIdSchema).min(1, "Escolha pelo menos 1 conta").max(50),
});

export const retirePoolAccountSchema = z.object({ id: z.uuid() });
```

`src/lib/meta-page-link.ts`:

```ts
/** Referência a uma Página do Facebook extraída do link que o cliente colou. */
export type PageRef = { kind: "id"; id: string } | { kind: "username"; username: string };

const HOSTS = new Set([
  "facebook.com",
  "www.facebook.com",
  "m.facebook.com",
  "web.facebook.com",
  "business.facebook.com",
  "fb.com",
  "www.fb.com",
]);
// Primeiro trecho do caminho que nunca é nome de Página.
const RESERVED = new Set([
  "share",
  "sharer",
  "sharer.php",
  "groups",
  "events",
  "watch",
  "marketplace",
  "people",
  "login",
  "home.php",
  "photo",
  "photo.php",
  "story.php",
  "permalink.php",
  "reel",
  "settings",
]);
const NUMERIC_ID = /^\d{5,20}$/;

export function parsePageLink(raw: string): PageRef | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (!HOSTS.has(url.hostname.toLowerCase())) return null;

  const segments = url.pathname.split("/").filter(Boolean);
  const first = segments[0];
  if (!first) return null;

  if (first === "profile.php") {
    const id = url.searchParams.get("id");
    return id && NUMERIC_ID.test(id) ? { kind: "id", id } : null;
  }
  // Formato antigo: facebook.com/pages/Nome/123456789
  if (first === "pages") {
    const last = segments.at(-1);
    return last && NUMERIC_ID.test(last) ? { kind: "id", id: last } : null;
  }
  if (RESERVED.has(first.toLowerCase())) return null;
  if (NUMERIC_ID.test(first)) return { kind: "id", id: first };
  if (/^[A-Za-z0-9.\-]{2,80}$/.test(first)) return { kind: "username", username: first.toLowerCase() };
  return null;
}

export function matchesPage(
  ref: PageRef,
  page: { id: string; username?: string | null; link?: string | null },
): boolean {
  if (ref.kind === "id") return page.id === ref.id;
  if (page.username && page.username.toLowerCase() === ref.username) return true;
  const fromLink = page.link ? parsePageLink(page.link) : null;
  return fromLink?.kind === "username" && fromLink.username === ref.username;
}
```

`src/lib/meta-links.ts`:

```ts
/**
 * Endereços de telas oficiais da Meta mostrados ao cliente. Confirmados manualmente no teste de
 * contrato (docs/META_OPERADOR.md); se a Meta mudar, só este arquivo muda.
 */
export const META_PARTNERS_URL = "https://business.facebook.com/settings/partners";

export function metaBillingUrl(adAccountId: string): string {
  const numeric = adAccountId.replace(/^act_/, "");
  return `https://business.facebook.com/billing_hub/payment_settings/?asset_id=${encodeURIComponent(numeric)}`;
}
```

Em `src/contracts/index.ts`, adicionar `export * from "./meta";` seguindo o padrão dos outros exports. Em `src/contracts/campaigns.ts`, apagar `connectMetaAssetsSchema` e `ConnectMetaAssetsInput` (linhas 9-22) e o import de `externalIdSchema` se ficar sem uso. Em `tests/unit/campaigns-contract.test.ts`, apagar os casos de `connectMetaAssetsSchema` e o import.

- [ ] **Step 4: Ver passar**

Run: `npx vitest run tests/unit/meta-page-link.test.ts tests/unit/meta-contract.test.ts tests/unit/campaigns-contract.test.ts`
Expected: PASS. (`npm run typecheck` ainda acusa usos de `connectMetaAssetsSchema` em `src/server/campaigns.ts`; a Task 5 remove.)

- [ ] **Step 5: Commit**

```bash
git add src/contracts src/lib/meta-page-link.ts src/lib/meta-links.ts tests/unit/meta-page-link.test.ts tests/unit/meta-contract.test.ts tests/unit/campaigns-contract.test.ts
git commit -m "feat(meta): contratos da conexão e leitura do link da Página"
```

---

### Task 3: Cliente Meta (real e Simulação), erros e modo

**Files:**
- Create: `src/server/meta/graph.ts`, `src/server/meta/errors.ts`, `src/server/meta/client.ts`, `src/server/meta/real-client.ts`, `src/server/meta/mock-client.ts`, `src/server/meta/mode.ts`, `src/server/meta/index.ts`
- Modify: `src/lib/env.ts`, `src/lib/flags.ts`
- Modify: `tests/unit/flags-env.test.ts`
- Test: `tests/unit/meta-real-client.test.ts`, `tests/unit/meta-mock-client.test.ts`, `tests/unit/meta-mode.test.ts`, `tests/unit/meta-errors.test.ts`

**Interfaces:**
- Consumes: `PageRef`, `matchesPage` (Task 2).
- Produces: `META_GRAPH_VERSION = "v25.0"`, `META_GRAPH_BASE`, `appSecretProof(token, secret): string`.
- Produces: `class MetaError extends Error { code: MetaErrorCode; metaCode?: number; metaSubcode?: number }`, `MetaErrorCode = "missing_permissions" | "token_expired" | "asset_not_shared" | "rate_limited" | "meta_unavailable" | "config_missing" | "unknown"`, `mapGraphError(status: number, body: unknown): MetaError`.
- Produces: `interface MetaBusinessClient` com `simulated`, `createAdAccount({name})`, `listBusinessAdAccounts()`, `renameAdAccount(id, name)`, `findClientPage(ref)`, `findClientInstagram(username)`, `inviteBusinessUser(email)`, `getBusinessUserInvite(email)`, `assignAdAccountUser(adAccountId, businessUserId)`, `getFunding(adAccountId)`; tipos `MetaAdAccount`, `MetaClientPage`, `MetaInstagramAsset`, `MetaInvite`, `MetaFunding`.
- Produces: `RealMetaBusinessClient(cfg: RealClientConfig)`, `MockMetaBusinessClient()`.
- Produces: `type MetaBusinessMode = {kind:"real"; businessId; accessToken; appSecret; timezoneId?} | {kind:"mock"} | {kind:"disabled"; reason:"kill_switch"|"config_missing"; missing?: string[]}`; `resolveMetaBusinessMode(env, flags)`; `metaBusinessClient(mode)`.

- [ ] **Step 1: Testes que falham**

`tests/unit/meta-errors.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { mapGraphError } from "@/server/meta/errors";

describe("mapGraphError", () => {
  it.each([
    [400, { error: { code: 190 } }, "token_expired"],
    [403, { error: { code: 10 } }, "missing_permissions"],
    [403, { error: { code: 200 } }, "missing_permissions"],
    [400, { error: { code: 17 } }, "rate_limited"],
    [400, { error: { code: 80004 } }, "rate_limited"],
    [400, { error: { code: 100, error_subcode: 33 } }, "asset_not_shared"],
    [500, null, "meta_unavailable"],
    [400, { error: { code: 1 } }, "meta_unavailable"],
    [400, { error: { code: 999 } }, "unknown"],
  ])("HTTP %s %j vira %s", (status, body, code) => {
    expect(mapGraphError(status, body).code).toBe(code);
  });

  it("guarda o código da Meta sem expor o corpo", () => {
    const err = mapGraphError(400, { error: { code: 100, error_subcode: 33, message: "segredo" } });
    expect(err.metaCode).toBe(100);
    expect(err.metaSubcode).toBe(33);
    expect(err.message).not.toContain("segredo");
  });
});
```

`tests/unit/meta-real-client.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { appSecretProof, META_GRAPH_VERSION } from "@/server/meta/graph";
import { RealMetaBusinessClient } from "@/server/meta/real-client";

type Call = { url: URL; init: RequestInit };

function fakeFetch(responses: Array<{ status: number; body: unknown } | Error>) {
  const calls: Call[] = [];
  const impl = vi.fn(async (input: URL | RequestInfo, init?: RequestInit) => {
    calls.push({ url: new URL(String(input)), init: init ?? {} });
    const next = responses.shift();
    if (!next) throw new Error("resposta não configurada");
    if (next instanceof Error) throw next;
    return new Response(JSON.stringify(next.body), { status: next.status });
  });
  return { impl: impl as unknown as typeof fetch, calls };
}

const cfg = { businessId: "111", accessToken: "tok", appSecret: "sec", retryDelayMs: 0 };

describe("RealMetaBusinessClient", () => {
  it("lê contas da BM com versão fixada, token no cabeçalho e appsecret_proof", async () => {
    const f = fakeFetch([{ status: 200, body: { data: [{ id: "act_1", name: "A", account_status: 1, currency: "BRL" }] } }]);
    const client = new RealMetaBusinessClient({ ...cfg, fetchImpl: f.impl });
    expect(await client.listBusinessAdAccounts()).toEqual([{ id: "act_1", name: "A", account_status: 1, currency: "BRL" }]);
    const { url, init } = f.calls[0];
    expect(url.pathname).toBe(`/${META_GRAPH_VERSION}/111/owned_ad_accounts`);
    expect(url.searchParams.get("appsecret_proof")).toBe(appSecretProof("tok", "sec"));
    expect(url.searchParams.get("access_token")).toBeNull();
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok");
  });

  it("segue a paginação para achar a Página compartilhada", async () => {
    const f = fakeFetch([
      { status: 200, body: { data: [{ id: "1", name: "Outra" }], paging: { cursors: { after: "c1" }, next: "x" } } },
      { status: 200, body: { data: [{ id: "123456789012", name: "Padaria", username: "padariadojoao" }] } },
    ]);
    const client = new RealMetaBusinessClient({ ...cfg, fetchImpl: f.impl });
    const page = await client.findClientPage({ kind: "username", username: "padariadojoao" });
    expect(page?.id).toBe("123456789012");
    expect(f.calls[1].url.searchParams.get("after")).toBe("c1");
    expect(f.calls[0].url.pathname).toBe(`/${META_GRAPH_VERSION}/111/client_pages`);
  });

  it("devolve null quando a Página não foi compartilhada", async () => {
    const f = fakeFetch([{ status: 200, body: { data: [] } }]);
    const client = new RealMetaBusinessClient({ ...cfg, fetchImpl: f.impl });
    expect(await client.findClientPage({ kind: "id", id: "999999" })).toBeNull();
  });

  it("tenta de novo uma leitura que falhou com 5xx", async () => {
    const f = fakeFetch([
      { status: 500, body: null },
      { status: 200, body: { funding_source: "123", account_status: 1 } },
    ]);
    const client = new RealMetaBusinessClient({ ...cfg, fetchImpl: f.impl });
    expect(await client.getFunding("act_1")).toEqual({ has_funding_source: true, account_status: 1 });
    expect(f.calls).toHaveLength(2);
  });

  it("não repete escritas e converte erro da Meta", async () => {
    const f = fakeFetch([{ status: 400, body: { error: { code: 190 } } }]);
    const client = new RealMetaBusinessClient({ ...cfg, fetchImpl: f.impl });
    await expect(client.inviteBusinessUser("a@b.com")).rejects.toMatchObject({ code: "token_expired" });
    expect(f.calls).toHaveLength(1);
    expect(f.calls[0].init.method).toBe("POST");
    const body = new URLSearchParams(String(f.calls[0].init.body));
    expect(body.get("email")).toBe("a@b.com");
    expect(body.get("role")).toBe("EMPLOYEE");
  });

  it("falha de rede vira meta_unavailable", async () => {
    const f = fakeFetch([new TypeError("fetch failed"), new TypeError("fetch failed")]);
    const client = new RealMetaBusinessClient({ ...cfg, fetchImpl: f.impl });
    await expect(client.listBusinessAdAccounts()).rejects.toMatchObject({ code: "meta_unavailable" });
  });

  it("convite aceito devolve o ID do usuário da BM", async () => {
    const f = fakeFetch([{ status: 200, body: { data: [{ id: "bsu_9", email: "Dono@Padaria.com" }] } }]);
    const client = new RealMetaBusinessClient({ ...cfg, fetchImpl: f.impl });
    expect(await client.getBusinessUserInvite("dono@padaria.com")).toEqual({ status: "accepted", business_user_id: "bsu_9" });
  });

  it("convite ainda pendente", async () => {
    const f = fakeFetch([
      { status: 200, body: { data: [] } },
      { status: 200, body: { data: [{ id: "req_1", email: "dono@padaria.com", status: "PENDING" }] } },
    ]);
    const client = new RealMetaBusinessClient({ ...cfg, fetchImpl: f.impl });
    expect(await client.getBusinessUserInvite("dono@padaria.com")).toEqual({ status: "pending", business_user_id: null });
    expect(f.calls[1].url.pathname).toBe(`/${META_GRAPH_VERSION}/111/pending_users`);
  });

  it("criar conta sem fuso configurado é erro de configuração", async () => {
    const client = new RealMetaBusinessClient({ ...cfg, fetchImpl: fakeFetch([]).impl });
    await expect(client.createAdAccount({ name: "Estoque" })).rejects.toMatchObject({ code: "config_missing" });
  });
});
```

`tests/unit/meta-mock-client.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { MockMetaBusinessClient } from "@/server/meta/mock-client";

describe("MockMetaBusinessClient", () => {
  const client = new MockMetaBusinessClient();

  it("é rotulado como simulação e gera IDs determinísticos", async () => {
    expect(client.simulated).toBe(true);
    const a = await client.findClientPage({ kind: "username", username: "padaria" });
    const b = await client.findClientPage({ kind: "username", username: "padaria" });
    expect(a?.id).toBe(b?.id);
    expect(a?.id.startsWith("sim_page_")).toBe(true);
  });

  it("simula Página e Instagram não compartilhados", async () => {
    expect(await client.findClientPage({ kind: "username", username: "nao-compartilhada" })).toBeNull();
    expect(await client.findClientInstagram("nao_compartilhado")).toBeNull();
  });

  it("contas simuladas têm formato act_", async () => {
    for (const acc of await client.listBusinessAdAccounts()) expect(acc.id).toMatch(/^act_[0-9A-Za-z_]{3,60}$/);
    expect((await client.createAdAccount({ name: "Estoque" })).id).toMatch(/^act_sim_/);
  });
});
```

`tests/unit/meta-mode.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseServerEnv } from "@/lib/env";
import { resolveFlags } from "@/lib/flags";
import { resolveMetaBusinessMode } from "@/server/meta/mode";

const mode = (vars: Record<string, string>) => {
  const env = parseServerEnv(vars);
  return resolveMetaBusinessMode(env, resolveFlags(env));
};

const real = {
  META_MODE: "real",
  FEATURE_FLAG_ACCOUNT_CREATION: "true",
  META_BUSINESS_ID: "111",
  META_SYSTEM_USER_TOKEN: "tok",
  META_APP_SECRET: "sec",
};

describe("resolveMetaBusinessMode", () => {
  it("usa Simulação por padrão", () => {
    expect(mode({})).toEqual({ kind: "mock" });
    expect(mode({ ...real, FEATURE_FLAG_ACCOUNT_CREATION: "false" })).toEqual({ kind: "mock" });
  });

  it("liga o modo real com tudo configurado", () => {
    expect(mode({ ...real, META_AD_ACCOUNT_TIMEZONE_ID: "25" })).toEqual({
      kind: "real",
      businessId: "111",
      accessToken: "tok",
      appSecret: "sec",
      timezoneId: 25,
    });
  });

  it("modo real sem variável obrigatória não cai em Simulação", () => {
    expect(mode({ ...real, META_SYSTEM_USER_TOKEN: "" })).toEqual({
      kind: "disabled",
      reason: "config_missing",
      missing: ["META_SYSTEM_USER_TOKEN"],
    });
  });

  it("kill switch desliga tudo, inclusive a Simulação", () => {
    expect(mode({ ...real, FEATURE_FLAG_KILL_SWITCH: "true" })).toEqual({ kind: "disabled", reason: "kill_switch" });
    expect(mode({ FEATURE_FLAG_KILL_SWITCH: "true" })).toEqual({ kind: "disabled", reason: "kill_switch" });
  });
});
```

Em `tests/unit/flags-env.test.ts`, trocar o teste "mantém Meta desligada mesmo com flags ligadas por env" por:

```ts
  it("liga o modo real da Meta só com META_MODE=real e respeita o kill switch", () => {
    expect(META_ENABLED_IN_THIS_BUILD).toBe(true);
    const on = resolveFlags(parseServerEnv({ META_MODE: "real", FEATURE_FLAG_ACCOUNT_CREATION: "true" }));
    expect(on).toMatchObject({ accountCreation: true, metaMode: "real" });
    const killed = resolveFlags(
      parseServerEnv({ META_MODE: "real", FEATURE_FLAG_ACCOUNT_CREATION: "true", FEATURE_FLAG_KILL_SWITCH: "1" }),
    );
    expect(killed).toMatchObject({ accountCreation: false, metaMode: "mock", killSwitch: true });
  });
```

- [ ] **Step 2: Ver falhar**

Run: `npx vitest run tests/unit/meta-errors.test.ts tests/unit/meta-real-client.test.ts tests/unit/meta-mock-client.test.ts tests/unit/meta-mode.test.ts tests/unit/flags-env.test.ts`
Expected: FAIL (módulos inexistentes; `META_ENABLED_IN_THIS_BUILD` ainda `false`).

- [ ] **Step 3: Implementar**

`src/server/meta/graph.ts`:

```ts
import { createHmac } from "node:crypto";

/**
 * Versão fixada da Graph/Marketing API (ADR 0005). v25.0 é a versão de Marketing vigente em 25/10/2026
 * (developers.facebook.com/docs/graph-api/changelog/versions).
 */
export const META_GRAPH_VERSION = "v25.0";
export const META_GRAPH_BASE = `https://graph.facebook.com/${META_GRAPH_VERSION}`;

/** Prova do app exigida pela Meta em chamadas server-side: HMAC-SHA256 do token com o app secret. */
export function appSecretProof(accessToken: string, appSecret: string): string {
  return createHmac("sha256", appSecret).update(accessToken).digest("hex");
}
```

`src/server/meta/errors.ts`:

```ts
export const META_ERROR_CODES = [
  "missing_permissions",
  "token_expired",
  "asset_not_shared",
  "rate_limited",
  "meta_unavailable",
  "config_missing",
  "unknown",
] as const;
export type MetaErrorCode = (typeof META_ERROR_CODES)[number];

export class MetaError extends Error {
  constructor(
    readonly code: MetaErrorCode,
    readonly metaCode?: number,
    readonly metaSubcode?: number,
  ) {
    super(`meta_error:${code}`);
    this.name = "MetaError";
  }
}

type GraphErrorBody = { error?: { code?: number; error_subcode?: number } };

const RATE_LIMIT_CODES = new Set([4, 17, 32, 613, 80004]);

/** Converte a resposta de erro da Graph API num código estável; nunca copia a mensagem da Meta. */
export function mapGraphError(status: number, body: unknown): MetaError {
  const err = (body as GraphErrorBody | null)?.error;
  const code = err?.code;
  const sub = err?.error_subcode;
  if (code === 190) return new MetaError("token_expired", code, sub);
  if (code === 10 || code === 3 || (code !== undefined && code >= 200 && code <= 299)) {
    return new MetaError("missing_permissions", code, sub);
  }
  if (code !== undefined && RATE_LIMIT_CODES.has(code)) return new MetaError("rate_limited", code, sub);
  if (code === 100 && sub === 33) return new MetaError("asset_not_shared", code, sub);
  if (status >= 500 || code === 1 || code === 2) return new MetaError("meta_unavailable", code, sub);
  return new MetaError("unknown", code, sub);
}
```

`src/server/meta/client.ts`:

```ts
import type { PageRef } from "@/lib/meta-page-link";

export type MetaAdAccount = { id: string; name: string; account_status: number; currency: string };
export type MetaClientPage = { id: string; name: string; username: string | null; link: string | null };
export type MetaInstagramAsset = { id: string; username: string | null };
export type MetaInvite = { status: "pending" | "accepted" | "expired"; business_user_id: string | null };
export type MetaFunding = { has_funding_source: boolean; account_status: number };

/**
 * Operações da BM da GereVendas na Meta. Só ativos da própria BM (contas dela e Páginas/Instagram
 * compartilhados com ela); nenhuma chamada usa token de cliente (ADR 0005).
 */
export interface MetaBusinessClient {
  readonly simulated: boolean;
  createAdAccount(input: { name: string }): Promise<MetaAdAccount>;
  listBusinessAdAccounts(): Promise<MetaAdAccount[]>;
  renameAdAccount(adAccountId: string, name: string): Promise<void>;
  findClientPage(ref: PageRef): Promise<MetaClientPage | null>;
  findClientInstagram(username: string): Promise<MetaInstagramAsset | null>;
  inviteBusinessUser(email: string): Promise<void>;
  getBusinessUserInvite(email: string): Promise<MetaInvite>;
  assignAdAccountUser(adAccountId: string, businessUserId: string): Promise<void>;
  getFunding(adAccountId: string): Promise<MetaFunding>;
}
```

`src/server/meta/real-client.ts`:

```ts
import { z } from "zod";
import { matchesPage, type PageRef } from "@/lib/meta-page-link";
import type {
  MetaAdAccount,
  MetaBusinessClient,
  MetaClientPage,
  MetaFunding,
  MetaInstagramAsset,
  MetaInvite,
} from "./client";
import { MetaError, mapGraphError } from "./errors";
import { appSecretProof, META_GRAPH_BASE } from "./graph";

export type RealClientConfig = {
  businessId: string;
  accessToken: string;
  appSecret: string;
  timezoneId?: number;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  retryDelayMs?: number;
};

const MAX_PAGES = 10;

const listSchema = <T extends z.ZodType>(item: T) =>
  z.object({
    data: z.array(item),
    paging: z
      .object({ cursors: z.object({ after: z.string().optional() }).optional(), next: z.string().optional() })
      .optional(),
  });

const adAccountRaw = z.object({
  id: z.string(),
  name: z.string().optional(),
  account_status: z.number().optional(),
  currency: z.string().optional(),
});
const pageRaw = z.object({
  id: z.string(),
  name: z.string().optional(),
  username: z.string().nullish(),
  link: z.string().nullish(),
});
const instagramRaw = z.object({ id: z.string(), username: z.string().nullish() });
const businessUserRaw = z.object({ id: z.string(), email: z.string().nullish() });
const pendingUserRaw = z.object({ id: z.string(), email: z.string().nullish(), status: z.string().nullish() });
const fundingRaw = z.object({ funding_source: z.string().nullish(), account_status: z.number().optional() });
const createdRaw = z.object({ id: z.string() });

const toAdAccount = (a: z.infer<typeof adAccountRaw>): MetaAdAccount => ({
  id: a.id.startsWith("act_") ? a.id : `act_${a.id}`,
  name: a.name || a.id,
  account_status: a.account_status ?? 0,
  currency: a.currency ?? "BRL",
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class RealMetaBusinessClient implements MetaBusinessClient {
  readonly simulated = false;

  constructor(private readonly cfg: RealClientConfig) {}

  /** Uma chamada à Graph API. Leituras têm 1 nova tentativa para 5xx/limite; escritas nunca repetem. */
  private async call(method: "GET" | "POST", path: string, params: Record<string, string> = {}): Promise<unknown> {
    const url = new URL(`${META_GRAPH_BASE}/${path.replace(/^\//, "")}`);
    const form = new URLSearchParams({
      ...params,
      appsecret_proof: appSecretProof(this.cfg.accessToken, this.cfg.appSecret),
    });
    if (method === "GET") form.forEach((v, k) => url.searchParams.set(k, v));
    const attempts = method === "GET" ? 2 : 1;
    const doFetch = this.cfg.fetchImpl ?? fetch;
    const delay = this.cfg.retryDelayMs ?? 500;

    for (let i = 0; i < attempts; i++) {
      const last = i + 1 === attempts;
      let res: Response;
      try {
        res = await doFetch(url, {
          method,
          headers: {
            Authorization: `Bearer ${this.cfg.accessToken}`,
            ...(method === "POST" ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
          },
          body: method === "POST" ? form.toString() : undefined,
          signal: AbortSignal.timeout(this.cfg.timeoutMs ?? 15_000),
        });
      } catch {
        if (!last) {
          await sleep(delay);
          continue;
        }
        throw new MetaError("meta_unavailable");
      }
      const json: unknown = await res.json().catch(() => null);
      if (res.ok) return json;
      const err = mapGraphError(res.status, json);
      if (!last && (err.code === "meta_unavailable" || err.code === "rate_limited")) {
        await sleep(delay * (i + 1));
        continue;
      }
      throw err;
    }
    throw new MetaError("meta_unavailable");
  }

  private async listAll<T extends z.ZodType>(path: string, fields: string, item: T): Promise<z.infer<T>[]> {
    const out: z.infer<T>[] = [];
    let after: string | undefined;
    for (let page = 0; page < MAX_PAGES; page++) {
      const params: Record<string, string> = { fields, limit: "100" };
      if (after) params.after = after;
      const parsed = listSchema(item).safeParse(await this.call("GET", path, params));
      if (!parsed.success) throw new MetaError("unknown");
      out.push(...parsed.data.data);
      after = parsed.data.paging?.cursors?.after;
      if (!parsed.data.paging?.next || !after) break;
    }
    return out;
  }

  private parse<T extends z.ZodType>(schema: T, value: unknown): z.infer<T> {
    const parsed = schema.safeParse(value);
    if (!parsed.success) throw new MetaError("unknown");
    return parsed.data;
  }

  async createAdAccount({ name }: { name: string }): Promise<MetaAdAccount> {
    if (!this.cfg.timezoneId) throw new MetaError("config_missing");
    const created = this.parse(
      createdRaw,
      await this.call("POST", `${this.cfg.businessId}/adaccount`, {
        name,
        currency: "BRL",
        timezone_id: String(this.cfg.timezoneId),
        end_advertiser: "NONE",
        media_agency: "NONE",
        partner: "NONE",
      }),
    );
    return toAdAccount({ id: created.id, name, account_status: 1, currency: "BRL" });
  }

  async listBusinessAdAccounts(): Promise<MetaAdAccount[]> {
    const rows = await this.listAll(
      `${this.cfg.businessId}/owned_ad_accounts`,
      "id,name,account_status,currency",
      adAccountRaw,
    );
    return rows.map(toAdAccount);
  }

  async renameAdAccount(adAccountId: string, name: string): Promise<void> {
    await this.call("POST", adAccountId, { name });
  }

  async findClientPage(ref: PageRef): Promise<MetaClientPage | null> {
    const pages = await this.listAll(`${this.cfg.businessId}/client_pages`, "id,name,username,link", pageRaw);
    const found = pages.find((p) => matchesPage(ref, p));
    return found
      ? { id: found.id, name: found.name || found.id, username: found.username ?? null, link: found.link ?? null }
      : null;
  }

  async findClientInstagram(username: string): Promise<MetaInstagramAsset | null> {
    const wanted = username.toLowerCase();
    const assets = await this.listAll(`${this.cfg.businessId}/client_instagram_assets`, "id,username", instagramRaw);
    const found = assets.find((a) => a.username?.toLowerCase() === wanted);
    return found ? { id: found.id, username: found.username ?? null } : null;
  }

  async inviteBusinessUser(email: string): Promise<void> {
    await this.call("POST", `${this.cfg.businessId}/business_users`, { email, role: "EMPLOYEE" });
  }

  async getBusinessUserInvite(email: string): Promise<MetaInvite> {
    const wanted = email.toLowerCase();
    const users = await this.listAll(`${this.cfg.businessId}/business_users`, "id,email", businessUserRaw);
    const user = users.find((u) => u.email?.toLowerCase() === wanted);
    if (user) return { status: "accepted", business_user_id: user.id };
    const pending = await this.listAll(`${this.cfg.businessId}/pending_users`, "id,email,status", pendingUserRaw);
    const invite = pending.find((u) => u.email?.toLowerCase() === wanted);
    if (invite && (invite.status ?? "PENDING").toUpperCase() === "PENDING") {
      return { status: "pending", business_user_id: null };
    }
    return { status: "expired", business_user_id: null };
  }

  async assignAdAccountUser(adAccountId: string, businessUserId: string): Promise<void> {
    await this.call("POST", `${adAccountId}/assigned_users`, {
      user: businessUserId,
      tasks: JSON.stringify(["MANAGE", "ADVERTISE", "ANALYZE"]),
    });
  }

  async getFunding(adAccountId: string): Promise<MetaFunding> {
    const raw = this.parse(fundingRaw, await this.call("GET", adAccountId, { fields: "funding_source,account_status" }));
    return { has_funding_source: Boolean(raw.funding_source), account_status: raw.account_status ?? 0 };
  }
}
```

`src/server/meta/mock-client.ts`:

```ts
import { createHash, randomBytes } from "node:crypto";
import type { PageRef } from "@/lib/meta-page-link";
import type {
  MetaAdAccount,
  MetaBusinessClient,
  MetaClientPage,
  MetaFunding,
  MetaInstagramAsset,
  MetaInvite,
} from "./client";

const digest = (value: string) => createHash("sha256").update(value).digest("hex").slice(0, 12);

/**
 * Simulação rotulada (AGENTS.md): nada sai para a Meta. Para testar o caminho de erro, use um link
 * com "nao-compartilhada" ou um @ com "nao_compartilhado".
 */
export class MockMetaBusinessClient implements MetaBusinessClient {
  readonly simulated = true;

  async createAdAccount({ name }: { name: string }): Promise<MetaAdAccount> {
    return { id: `act_sim_${randomBytes(4).toString("hex")}`, name, account_status: 1, currency: "BRL" };
  }

  async listBusinessAdAccounts(): Promise<MetaAdAccount[]> {
    return [1, 2, 3].map((n) => ({
      id: `act_sim_000${n}`,
      name: `Conta simulada ${n}`,
      account_status: 1,
      currency: "BRL",
    }));
  }

  async renameAdAccount(): Promise<void> {}

  async findClientPage(ref: PageRef): Promise<MetaClientPage | null> {
    const key = ref.kind === "id" ? ref.id : ref.username;
    if (key.includes("nao-compartilhada")) return null;
    return {
      id: `sim_page_${digest(key)}`,
      name: ref.kind === "username" ? `Página simulada @${ref.username}` : `Página simulada ${ref.id}`,
      username: ref.kind === "username" ? ref.username : null,
      link: null,
    };
  }

  async findClientInstagram(username: string): Promise<MetaInstagramAsset | null> {
    if (username.includes("nao_compartilhado")) return null;
    return { id: `sim_ig_${digest(username)}`, username };
  }

  async inviteBusinessUser(): Promise<void> {}

  async getBusinessUserInvite(email: string): Promise<MetaInvite> {
    return { status: "accepted", business_user_id: `sim_bsu_${digest(email.toLowerCase())}` };
  }

  async assignAdAccountUser(): Promise<void> {}

  async getFunding(): Promise<MetaFunding> {
    return { has_funding_source: true, account_status: 1 };
  }
}
```

`src/server/meta/mode.ts`:

```ts
import type { ServerEnv } from "@/lib/env";
import type { FeatureFlags } from "@/lib/flags";

export type MetaBusinessMode =
  | { kind: "real"; businessId: string; accessToken: string; appSecret: string; timezoneId?: number }
  | { kind: "mock" }
  | { kind: "disabled"; reason: "kill_switch" | "config_missing"; missing?: string[] };

export type ActiveMetaBusinessMode = Exclude<MetaBusinessMode, { kind: "disabled" }>;

/**
 * Real só com META_MODE=real + FEATURE_FLAG_ACCOUNT_CREATION + variáveis da BM. Modo real mal configurado
 * fica desligado (nunca cai em Simulação em silêncio); kill switch desliga inclusive a Simulação.
 */
export function resolveMetaBusinessMode(env: ServerEnv, flags: FeatureFlags): MetaBusinessMode {
  if (flags.killSwitch) return { kind: "disabled", reason: "kill_switch" };
  if (flags.metaMode !== "real" || !flags.accountCreation) return { kind: "mock" };
  const missing = [
    !env.META_BUSINESS_ID && "META_BUSINESS_ID",
    !env.META_SYSTEM_USER_TOKEN && "META_SYSTEM_USER_TOKEN",
    !env.META_APP_SECRET && "META_APP_SECRET",
  ].filter((v): v is string => Boolean(v));
  if (missing.length > 0 || !env.META_BUSINESS_ID || !env.META_SYSTEM_USER_TOKEN || !env.META_APP_SECRET) {
    return { kind: "disabled", reason: "config_missing", missing };
  }
  return {
    kind: "real",
    businessId: env.META_BUSINESS_ID,
    accessToken: env.META_SYSTEM_USER_TOKEN,
    appSecret: env.META_APP_SECRET,
    ...(env.META_AD_ACCOUNT_TIMEZONE_ID ? { timezoneId: env.META_AD_ACCOUNT_TIMEZONE_ID } : {}),
  };
}
```

`src/server/meta/index.ts`:

```ts
import "server-only";
import type { MetaBusinessClient } from "./client";
import { MockMetaBusinessClient } from "./mock-client";
import type { ActiveMetaBusinessMode } from "./mode";
import { RealMetaBusinessClient } from "./real-client";

export function metaBusinessClient(mode: ActiveMetaBusinessMode): MetaBusinessClient {
  if (mode.kind === "mock") return new MockMetaBusinessClient();
  return new RealMetaBusinessClient({
    businessId: mode.businessId,
    accessToken: mode.accessToken,
    appSecret: mode.appSecret,
    timezoneId: mode.timezoneId,
  });
}
```

Em `src/lib/env.ts`, adicionar depois de `META_APP_SECRET: optional,`:

```ts
  // BM única da GereVendas (ADR 0005). O token é do System User e só existe no servidor.
  META_BUSINESS_ID: optional,
  META_SYSTEM_USER_TOKEN: optional,
  META_AD_ACCOUNT_TIMEZONE_ID: z
    .string()
    .optional()
    .transform((v) => (v ? Number(v) : undefined))
    .pipe(z.number().int().positive().optional()),
  META_POOL_MIN_AVAILABLE: z.coerce.number().int().min(0).default(2),
```

e trocar o comentário do schema "Fase 1: integrações Meta e cobrança ficam em `mock`; ver docs/adr/0002." por "Integrações começam em `mock`; Meta real exige META_MODE=real (ADR 0005)."

Em `src/lib/flags.ts`, trocar o comentário e a constante:

```ts
/**
 * ADR 0005: a BM única da GereVendas pode operar em modo real (contas e conexões). Publicação real
 * continua bloqueada no código de campanhas até a Spec 2, mesmo com FEATURE_FLAG_REAL_PUBLISHING.
 */
export const META_ENABLED_IN_THIS_BUILD = true;
```

- [ ] **Step 4: Ver passar**

Run: `npx vitest run tests/unit/meta-errors.test.ts tests/unit/meta-real-client.test.ts tests/unit/meta-mock-client.test.ts tests/unit/meta-mode.test.ts tests/unit/flags-env.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/meta src/lib/env.ts src/lib/flags.ts tests/unit/meta-errors.test.ts tests/unit/meta-real-client.test.ts tests/unit/meta-mock-client.test.ts tests/unit/meta-mode.test.ts tests/unit/flags-env.test.ts
git commit -m "feat(meta): cliente da BM (Graph v25.0 e Simulação), erros e modo"
```

---

### Task 4: Orquestração no servidor (passos e ações do cliente)

**Files:**
- Create: `src/server/meta/steps.ts`, `src/server/meta/data.ts`, `src/server/meta/actions.ts`
- Create: `src/lib/supabase/admin.ts`
- Test: `tests/unit/meta-steps.test.ts`

**Interfaces:**
- Consumes: RPCs da Task 1; `linkPageSchema`, `sendInviteSchema` (Task 2); `metaBusinessClient`, `resolveMetaBusinessMode`, `MetaError` (Task 3).
- Produces: `type MetaOnboardingView`; `META_ONBOARDING_COLUMNS`; `type StepKey = "ad_account" | "page" | "invite" | "billing"`; `type StepState = "locked" | "todo" | "waiting" | "done" | "error"`; `computeSteps(row: MetaOnboardingView | null): Array<{key: StepKey; state: StepState}>`.
- Produces: `loadMetaOnboarding(orgId): Promise<MetaOnboardingView | null>`; `createSupabaseAdminClient()`.
- Produces (server actions): `requestAdAccount(): Promise<ApiResult<{pool_empty: boolean}>>`; `linkMetaPage(input): Promise<ApiResult<{page_name: string; instagram: "linked" | "not_found" | "taken" | "skipped"}>>`; `linkMetaInstagram(input: {instagram_username}): Promise<ApiResult<{instagram: "linked" | "not_found" | "taken"}>>`; `sendMetaInvite(input): Promise<ApiResult<{sent: true}>>`; `refreshMetaStatus(): Promise<ApiResult<{checked: boolean; changed: boolean}>>`; `unlinkMetaPage(): Promise<ApiResult<{unlinked: true}>>`.

- [ ] **Step 1: Teste que falha**

`tests/unit/meta-steps.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { computeSteps, type MetaOnboardingView } from "@/server/meta/steps";

const base: MetaOnboardingView = {
  status: "disconnected",
  simulated: true,
  ad_account_id: null,
  ad_account_name: null,
  ad_account_status: "pending",
  pool_requested_at: null,
  page_id: null,
  page_name: null,
  page_access_status: "pending",
  instagram_actor_id: null,
  instagram_status: "pending",
  client_invite_status: "not_sent",
  client_invite_email: null,
  billing_status: "unverified",
};

const states = (row: MetaOnboardingView | null) => computeSteps(row).map((s) => s.state);

describe("computeSteps", () => {
  it("sem conexão: só o primeiro passo está liberado", () => {
    expect(states(null)).toEqual(["todo", "locked", "locked", "locked"]);
  });

  it("estoque vazio deixa o primeiro passo aguardando", () => {
    expect(states({ ...base, ad_account_status: "awaiting_meta", pool_requested_at: "2026-10-25T10:00:00Z" })).toEqual([
      "waiting",
      "locked",
      "locked",
      "locked",
    ]);
  });

  const withAccount = { ...base, ad_account_id: "act_1", ad_account_status: "done" as const };
  const withPage = { ...withAccount, page_id: "p1", page_access_status: "done" as const };

  it("libera um passo por vez", () => {
    expect(states(withAccount)).toEqual(["done", "todo", "locked", "locked"]);
    expect(states(withPage)).toEqual(["done", "done", "todo", "locked"]);
    expect(states({ ...withPage, client_invite_status: "pending" })).toEqual(["done", "done", "waiting", "locked"]);
    expect(states({ ...withPage, client_invite_status: "expired" })).toEqual(["done", "done", "error", "locked"]);
    expect(states({ ...withPage, client_invite_status: "accepted" })).toEqual(["done", "done", "done", "todo"]);
  });

  it("tudo concluído", () => {
    expect(states({ ...withPage, client_invite_status: "accepted", billing_status: "verified" })).toEqual([
      "done",
      "done",
      "done",
      "done",
    ]);
  });
});
```

- [ ] **Step 2: Ver falhar**

Run: `npx vitest run tests/unit/meta-steps.test.ts`
Expected: FAIL (`Cannot find module '@/server/meta/steps'`).

- [ ] **Step 3: Implementar**

`src/server/meta/steps.ts`:

```ts
import type { MetaConnectionStatus } from "@/contracts/campaigns";
import type { MetaInviteStatus, MetaStepStatus } from "@/contracts/meta";

/** Linha de `meta_connections` que a trilha de 4 passos precisa. */
export type MetaOnboardingView = {
  status: MetaConnectionStatus;
  simulated: boolean;
  ad_account_id: string | null;
  ad_account_name: string | null;
  ad_account_status: MetaStepStatus;
  pool_requested_at: string | null;
  page_id: string | null;
  page_name: string | null;
  page_access_status: MetaStepStatus;
  instagram_actor_id: string | null;
  instagram_status: MetaStepStatus;
  client_invite_status: MetaInviteStatus;
  client_invite_email: string | null;
  billing_status: "unverified" | "verified";
};

export const META_ONBOARDING_COLUMNS =
  "status, simulated, ad_account_id, ad_account_name, ad_account_status, pool_requested_at, page_id, page_name, page_access_status, instagram_actor_id, instagram_status, client_invite_status, client_invite_email, billing_status";

export type StepKey = "ad_account" | "page" | "invite" | "billing";
export type StepState = "locked" | "todo" | "waiting" | "done" | "error";
export type StepView = { key: StepKey; state: StepState };

/** Um passo por vez: cada um só libera quando o anterior está concluído. */
export function computeSteps(row: MetaOnboardingView | null): StepView[] {
  const adAccount: StepState =
    row?.ad_account_status === "done" && row.ad_account_id ? "done" : row?.pool_requested_at ? "waiting" : "todo";
  const page: StepState =
    adAccount !== "done" ? "locked" : row?.page_access_status === "done" && row.page_id ? "done" : "todo";
  const invite: StepState =
    page !== "done"
      ? "locked"
      : row?.client_invite_status === "accepted"
        ? "done"
        : row?.client_invite_status === "pending"
          ? "waiting"
          : row?.client_invite_status === "expired"
            ? "error"
            : "todo";
  const billing: StepState = invite !== "done" ? "locked" : row?.billing_status === "verified" ? "done" : "todo";
  return [
    { key: "ad_account", state: adAccount },
    { key: "page", state: page },
    { key: "invite", state: invite },
    { key: "billing", state: billing },
  ];
}
```

`src/lib/supabase/admin.ts`:

```ts
import "server-only";
import { createClient } from "@supabase/supabase-js";
import { serverEnv } from "../env";

/**
 * Cliente com service role: só para gravar o que a Meta confirmou (RPCs `meta_set_*`). Nunca usar
 * para ler dados do usuário nem expor ao navegador.
 */
export function createSupabaseAdminClient() {
  const env = serverEnv();
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Supabase service role não configurado");
  }
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
```

`src/server/meta/data.ts`:

```ts
import "server-only";
import type { MetaPoolStatus } from "@/contracts/meta";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { META_ONBOARDING_COLUMNS, type MetaOnboardingView } from "./steps";

export async function loadMetaOnboarding(organizationId: string): Promise<MetaOnboardingView | null> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("meta_connections")
    .select(META_ONBOARDING_COLUMNS)
    .eq("organization_id", organizationId)
    .maybeSingle();
  return (data as MetaOnboardingView | null) ?? null;
}

export type PoolOverview = { available: number; assigned: number; retired: number; waiting: number };
export type PoolAccountView = {
  id: string;
  ad_account_id: string;
  name: string;
  status: MetaPoolStatus;
  organization_id: string | null;
  assigned_at: string | null;
  source: "api" | "imported";
  created_at: string;
};

export async function isPlatformOperator(): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.rpc("am_i_platform_operator");
  return data === true;
}

export async function loadPool(simulated: boolean): Promise<{ overview: PoolOverview; accounts: PoolAccountView[] }> {
  const supabase = await createSupabaseServerClient();
  const [{ data: overview }, { data: accounts }] = await Promise.all([
    supabase.rpc("meta_pool_overview", { p_simulated: simulated }),
    supabase
      .from("meta_ad_account_pool")
      .select("id, ad_account_id, name, status, organization_id, assigned_at, source, created_at")
      .eq("simulated", simulated)
      .order("created_at", { ascending: false })
      .limit(200),
  ]);
  return {
    overview: (overview as PoolOverview | null) ?? { available: 0, assigned: 0, retired: 0, waiting: 0 },
    accounts: (accounts ?? []) as PoolAccountView[],
  };
}
```

`src/server/meta/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { apiError, type ApiError, type ApiResult } from "@/contracts/api";
import { linkPageSchema, sendInviteSchema } from "@/contracts/meta";
import { fieldErrors } from "@/contracts/onboarding";
import { serverEnv } from "@/lib/env";
import { resolveFlags } from "@/lib/flags";
import { log } from "@/lib/logger";
import { parsePageLink } from "@/lib/meta-page-link";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAppContext, getCorrelationId } from "../context";
import { loadMetaOnboarding } from "./data";
import { MetaError } from "./errors";
import { metaBusinessClient } from "./index";
import { resolveMetaBusinessMode, type ActiveMetaBusinessMode } from "./mode";
import { computeSteps } from "./steps";

type OwnerContext = {
  orgId: string;
  orgName: string;
  correlationId: string;
  mode: ActiveMetaBusinessMode;
};

const isApiError = (v: unknown): v is ApiError =>
  typeof v === "object" && v !== null && (v as { ok?: unknown }).ok === false;

async function ownerContext(): Promise<OwnerContext | ApiError> {
  const correlationId = await getCorrelationId();
  const ctx = await getAppContext();
  if (ctx.mode !== "supabase" || !ctx.organization) {
    return apiError("feature_disabled", "Disponível no piloto com conta.", correlationId);
  }
  if (ctx.organization.role !== "owner") {
    return apiError("forbidden", "Apenas o proprietário da empresa pode conectar a Meta.", correlationId);
  }
  const env = serverEnv();
  const mode = resolveMetaBusinessMode(env, resolveFlags(env));
  if (mode.kind === "disabled") {
    if (mode.reason === "config_missing") {
      log("error", "meta.config_missing", { correlation_id: correlationId, missing: mode.missing });
      return apiError(
        "feature_disabled",
        "A integração com a Meta não está configurada. Nossa equipe foi avisada.",
        correlationId,
      );
    }
    return apiError("feature_disabled", "Integração com a Meta suspensa temporariamente.", correlationId);
  }
  return { orgId: ctx.organization.id, orgName: ctx.organization.name, correlationId, mode };
}

function metaFailure(e: unknown, correlationId: string, event: string): ApiError {
  if (e instanceof MetaError) {
    log(e.code === "rate_limited" ? "warn" : "error", event, {
      correlation_id: correlationId,
      code: e.code,
      meta_code: e.metaCode,
      meta_subcode: e.metaSubcode,
    });
    if (e.code === "rate_limited") {
      return apiError("external_unavailable", "A Meta pediu uma pausa. Tente de novo em alguns minutos.", correlationId);
    }
    return apiError("external_unavailable", "Não conseguimos falar com a Meta agora. Tente de novo em instantes.", correlationId);
  }
  log("error", event, { correlation_id: correlationId, error: e instanceof Error ? e.message : "unknown" });
  return apiError("internal", "Algo deu errado. Tente de novo.", correlationId);
}

async function rpcOrThrow(promise: PromiseLike<{ error: { message: string; code?: string } | null }>) {
  const { error } = await promise;
  if (error) throw new Error(`rpc_failed:${error.code ?? "unknown"}:${error.message}`);
}

function done<T>(data: T, correlationId: string): ApiResult<T> {
  revalidatePath("/app/conexoes");
  revalidatePath("/app/campanhas", "layout");
  return { ok: true, data, correlation_id: correlationId };
}

/** Passo 1: reserva uma conta do estoque e, se nova, renomeia na Meta com o nome do negócio. */
export async function requestAdAccount(): Promise<ApiResult<{ pool_empty: boolean }>> {
  const c = await ownerContext();
  if (isApiError(c)) return c;

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("assign_pool_account", {
    p_org: c.orgId,
    p_simulated: c.mode.kind === "mock",
    p_correlation_id: c.correlationId,
  });
  if (error) {
    if (error.code === "42501") return apiError("forbidden", "Sem permissão para reservar a conta.", c.correlationId);
    log("error", "meta.assign_failed", { correlation_id: c.correlationId, code: error.code });
    return apiError("internal", "Não foi possível reservar sua conta agora.", c.correlationId);
  }

  const res = data as { pool_empty: boolean; ad_account_id?: string; newly_assigned?: boolean };
  if (res.newly_assigned && res.ad_account_id) {
    const name = `${c.orgName} — GereVendas Ads`.slice(0, 120);
    try {
      await metaBusinessClient(c.mode).renameAdAccount(res.ad_account_id, name);
      await rpcOrThrow(
        createSupabaseAdminClient().rpc("meta_set_ad_account_name", {
          p_org: c.orgId,
          p_name: name,
          p_correlation_id: c.correlationId,
        }),
      );
    } catch (e) {
      // O nome é só identificação: a conta já é do cliente mesmo se a renomeação falhar.
      log("warn", "meta.rename_failed", {
        correlation_id: c.correlationId,
        code: e instanceof MetaError ? e.code : "rpc",
      });
    }
  }
  return done({ pool_empty: res.pool_empty }, c.correlationId);
}

/** Passo 2: confere na BM se a Página (e o Instagram) do link foram compartilhados e vincula. */
export async function linkMetaPage(
  input: unknown,
): Promise<ApiResult<{ page_name: string; instagram: "linked" | "not_found" | "taken" | "skipped" }>> {
  const correlationId = await getCorrelationId();
  const parsed = linkPageSchema.safeParse(input);
  if (!parsed.success) {
    return apiError("validation_failed", "Revise o link e o @.", correlationId, fieldErrors(parsed.error));
  }
  const c = await ownerContext();
  if (isApiError(c)) return c;

  const ref = parsePageLink(parsed.data.page_url);
  if (!ref) {
    return apiError(
      "validation_failed",
      "Esse link não é de uma Página do Facebook. Abra sua Página e copie o endereço da barra do navegador.",
      c.correlationId,
      { page_url: ["Link de Página inválido"] },
    );
  }

  const admin = createSupabaseAdminClient();
  const attempt = await admin.rpc("meta_link_attempt", { p_org: c.orgId });
  if (attempt.error) {
    log("error", "meta.link_attempt_failed", { correlation_id: c.correlationId, code: attempt.error.code });
    return apiError("internal", "Algo deu errado. Tente de novo.", c.correlationId);
  }
  if (attempt.data !== true) {
    return apiError("conflict", "Muitas tentativas seguidas. Espere alguns minutos e tente de novo.", c.correlationId);
  }

  const client = metaBusinessClient(c.mode);
  let page;
  try {
    page = await client.findClientPage(ref);
  } catch (e) {
    return metaFailure(e, c.correlationId, "meta.find_page_failed");
  }
  if (!page) {
    return apiError(
      "not_found",
      "Ainda não recebemos o compartilhamento dessa Página. Confira o passo a passo e tente de novo em 1 minuto.",
      c.correlationId,
    );
  }

  const setPage = await admin.rpc("meta_set_page", {
    p_org: c.orgId,
    p_status: "done",
    p_page_id: page.id,
    p_page_name: page.name,
    p_correlation_id: c.correlationId,
  });
  if (setPage.error) {
    if (setPage.error.message.includes("page_already_linked")) {
      return apiError(
        "conflict",
        "Esta Página já está ligada a outra empresa no GereVendas Ads. Fale com o suporte.",
        c.correlationId,
      );
    }
    if (setPage.error.message.includes("connection_not_found")) {
      return apiError("conflict", "Reserve sua conta de anúncios antes de ligar a Página.", c.correlationId);
    }
    log("error", "meta.set_page_failed", { correlation_id: c.correlationId, code: setPage.error.code });
    return apiError("internal", "Não foi possível salvar a Página agora.", c.correlationId);
  }

  const instagram = parsed.data.instagram_username
    ? await attachInstagram(c, parsed.data.instagram_username)
    : "skipped";
  return done({ page_name: page.name, instagram }, c.correlationId);
}

/** Procura o @ entre os Instagram compartilhados com a BM e vincula. Falhas não desfazem a Página. */
async function attachInstagram(c: OwnerContext, username: string): Promise<"linked" | "not_found" | "taken"> {
  try {
    const ig = await metaBusinessClient(c.mode).findClientInstagram(username);
    if (!ig) return "not_found";
    const setIg = await createSupabaseAdminClient().rpc("meta_set_instagram", {
      p_org: c.orgId,
      p_status: "done",
      p_instagram_id: ig.id,
      p_correlation_id: c.correlationId,
    });
    if (setIg.error?.message.includes("instagram_already_linked")) return "taken";
    if (setIg.error) throw new Error(`rpc_failed:${setIg.error.code}`);
    return "linked";
  } catch (e) {
    log("warn", "meta.find_instagram_failed", {
      correlation_id: c.correlationId,
      code: e instanceof MetaError ? e.code : "rpc",
    });
    return "not_found";
  }
}

/** Liga o Instagram depois, quando a Página já está conectada. */
export async function linkMetaInstagram(
  input: unknown,
): Promise<ApiResult<{ instagram: "linked" | "not_found" | "taken" }>> {
  const correlationId = await getCorrelationId();
  const parsed = linkPageSchema.pick({ instagram_username: true }).safeParse(input);
  if (!parsed.success || !parsed.data.instagram_username) {
    return apiError("validation_failed", "Digite o @ do Instagram.", correlationId);
  }
  const c = await ownerContext();
  if (isApiError(c)) return c;
  const row = await loadMetaOnboarding(c.orgId);
  if (row?.page_access_status !== "done") {
    return apiError("conflict", "Conecte a Página antes do Instagram.", c.correlationId);
  }
  const instagram = await attachInstagram(c, parsed.data.instagram_username);
  return done({ instagram }, c.correlationId);
}

/** Passo 3: convida o e-mail do dono para a BM (para ele virar admin da própria conta). */
export async function sendMetaInvite(input: unknown): Promise<ApiResult<{ sent: true }>> {
  const correlationId = await getCorrelationId();
  const parsed = sendInviteSchema.safeParse(input);
  if (!parsed.success) {
    return apiError("validation_failed", "Informe um e-mail válido.", correlationId, fieldErrors(parsed.error));
  }
  const c = await ownerContext();
  if (isApiError(c)) return c;

  const row = await loadMetaOnboarding(c.orgId);
  const invite = computeSteps(row).find((s) => s.key === "invite");
  if (!row || invite?.state === "locked" || invite?.state === "done") {
    return apiError("conflict", "Conclua os passos anteriores primeiro.", c.correlationId);
  }

  try {
    await metaBusinessClient(c.mode).inviteBusinessUser(parsed.data.email);
    await rpcOrThrow(
      createSupabaseAdminClient().rpc("meta_set_invite", {
        p_org: c.orgId,
        p_status: "pending",
        p_email: parsed.data.email,
        p_business_user_id: null,
        p_correlation_id: c.correlationId,
      }),
    );
  } catch (e) {
    return metaFailure(e, c.correlationId, "meta.invite_failed");
  }
  return done({ sent: true }, c.correlationId);
}

/** Confere na Meta o que estava aguardando: estoque, convite aceito e forma de pagamento. */
export async function refreshMetaStatus(): Promise<ApiResult<{ checked: boolean; changed: boolean }>> {
  const c = await ownerContext();
  if (isApiError(c)) return c;

  const row = await loadMetaOnboarding(c.orgId);
  if (row && row.ad_account_status !== "done") {
    const assigned = await requestAdAccount();
    if (!assigned.ok) return assigned;
    return done({ checked: true, changed: !assigned.data.pool_empty }, c.correlationId);
  }
  if (!row?.ad_account_id) return done({ checked: false, changed: false }, c.correlationId);

  const admin = createSupabaseAdminClient();
  const touch = await admin.rpc("meta_touch_checked", { p_org: c.orgId, p_min_interval_seconds: 15 });
  if (touch.error) {
    log("error", "meta.touch_failed", { correlation_id: c.correlationId, code: touch.error.code });
    return apiError("internal", "Algo deu errado. Tente de novo.", c.correlationId);
  }
  if (touch.data !== true) return done({ checked: false, changed: false }, c.correlationId);

  const client = metaBusinessClient(c.mode);
  let changed = false;
  let inviteAccepted = row.client_invite_status === "accepted";
  try {
    if (row.client_invite_status === "pending" && row.client_invite_email) {
      const inv = await client.getBusinessUserInvite(row.client_invite_email);
      if (inv.status === "accepted" && inv.business_user_id) {
        await client.assignAdAccountUser(row.ad_account_id, inv.business_user_id);
        await rpcOrThrow(
          admin.rpc("meta_set_invite", {
            p_org: c.orgId,
            p_status: "accepted",
            p_email: null,
            p_business_user_id: inv.business_user_id,
            p_correlation_id: c.correlationId,
          }),
        );
        inviteAccepted = true;
        changed = true;
      } else if (inv.status === "expired") {
        await rpcOrThrow(
          admin.rpc("meta_set_invite", {
            p_org: c.orgId,
            p_status: "expired",
            p_email: null,
            p_business_user_id: null,
            p_correlation_id: c.correlationId,
          }),
        );
        changed = true;
      }
    }
    if (inviteAccepted && row.billing_status !== "verified") {
      const funding = await client.getFunding(row.ad_account_id);
      if (funding.has_funding_source) {
        await rpcOrThrow(admin.rpc("meta_set_billing", { p_org: c.orgId, p_verified: true, p_correlation_id: c.correlationId }));
        changed = true;
      }
    }
  } catch (e) {
    return metaFailure(e, c.correlationId, "meta.refresh_failed");
  }
  return done({ checked: true, changed }, c.correlationId);
}

/** Desfaz a Página/Instagram ligados (para trocar por outra Página). */
export async function unlinkMetaPage(): Promise<ApiResult<{ unlinked: true }>> {
  const correlationId = await getCorrelationId();
  const ctx = await getAppContext();
  if (ctx.mode !== "supabase" || !ctx.organization) {
    return apiError("feature_disabled", "Disponível no piloto com conta.", correlationId);
  }
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("unlink_meta_page", {
    p_org: ctx.organization.id,
    p_correlation_id: correlationId,
  });
  if (error) {
    if (error.code === "42501") return apiError("forbidden", "Apenas o proprietário pode trocar a Página.", correlationId);
    log("error", "meta.unlink_failed", { correlation_id: correlationId, code: error.code });
    return apiError("internal", "Não foi possível trocar a Página agora.", correlationId);
  }
  return done({ unlinked: true }, correlationId);
}
```

- [ ] **Step 4: Ver passar**

Run: `npx vitest run tests/unit/meta-steps.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/meta/steps.ts src/server/meta/data.ts src/server/meta/actions.ts src/lib/supabase/admin.ts tests/unit/meta-steps.test.ts
git commit -m "feat(meta): passos da conexão e ações do cliente no servidor"
```

---

### Task 5: Tela `/app/conexoes` e remoção do fluxo antigo

**Files:**
- Create: `src/components/meta/connection-steps.tsx`
- Modify: `src/app/app/conexoes/page.tsx` (reescrever)
- Modify: `src/server/campaigns.ts` (remover `connectMetaAssets`, `disconnectMetaAssets` e imports órfãos)
- Delete: `src/app/api/meta/oauth/start/route.ts`, `src/app/api/meta/oauth/callback/route.ts`, `src/lib/meta-oauth.ts`, `src/server/meta-discovery.ts`, `src/lib/meta-asset-match.ts`, `src/components/campaigns/meta-connection-panel.tsx`, `tests/unit/meta-oauth.test.ts`, `tests/unit/meta-discovery.test.ts`, `tests/unit/meta-asset-match.test.ts`
- Test: `tests/e2e/conexoes.spec.ts`

**Interfaces:**
- Consumes: ações da Task 4; `computeSteps`, `MetaOnboardingView`; `META_PARTNERS_URL`, `metaBillingUrl` (Task 2); `resolveMetaBusinessMode` (Task 3).
- Produces: `<ConnectionSteps connection canManage demo simulated disabledReason businessId defaultInviteEmail />`.

- [ ] **Step 1: E2E que falha**

`tests/e2e/conexoes.spec.ts`:

```ts
import { expect, test } from "@playwright/test";
import { p } from "./paths";

test("conexões em demonstração mostram os 4 passos", async ({ page }) => {
  await page.goto(p("/entrar"));
  await page.getByRole("link", { name: "Entrar em modo demonstração" }).click();
  await expect(page).toHaveURL(/\/app$/);
  await page.goto(p("/app/conexoes"));
  await expect(page.getByRole("heading", { name: "Conexões Meta" })).toBeVisible();
  for (const title of ["1. Conta de anúncios", "2. Página e Instagram", "3. Convite da Meta", "4. Forma de pagamento"]) {
    await expect(page.getByRole("heading", { name: title })).toBeVisible();
  }
  await expect(page.getByText("Demonstração", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Reservar minha conta de anúncios" })).toHaveCount(0);
});
```

- [ ] **Step 2: Ver falhar**

Run: `npm run build && npx playwright test conexoes --project=desktop`
Expected: FAIL (os títulos dos passos não existem).

- [ ] **Step 3: Implementar o componente**

`src/components/meta/connection-steps.tsx`:

```tsx
"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ApiResult } from "@/contracts/api";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/field";
import { META_PARTNERS_URL, metaBillingUrl } from "@/lib/meta-links";
import { publicEnv } from "@/lib/public-env";
import {
  linkMetaInstagram,
  linkMetaPage,
  refreshMetaStatus,
  requestAdAccount,
  sendMetaInvite,
  unlinkMetaPage,
} from "@/server/meta/actions";
import { computeSteps, type MetaOnboardingView, type StepKey, type StepState } from "@/server/meta/steps";

type Props = {
  connection: MetaOnboardingView | null;
  canManage: boolean;
  demo: boolean;
  simulated: boolean;
  disabledReason: "kill_switch" | "config_missing" | null;
  businessId: string | null;
  defaultInviteEmail: string;
};

type Message = { tone: "info" | "success" | "warning" | "danger"; text: string };

const BADGE: Record<StepState, { label: string; tone: "neutral" | "success" | "warning" | "danger" }> = {
  locked: { label: "Depois", tone: "neutral" },
  todo: { label: "A fazer", tone: "warning" },
  waiting: { label: "Aguardando", tone: "warning" },
  done: { label: "Concluído", tone: "success" },
  error: { label: "Precisa de atenção", tone: "danger" },
};

const TITLE: Record<StepKey, string> = {
  ad_account: "1. Conta de anúncios",
  page: "2. Página e Instagram",
  invite: "3. Convite da Meta",
  billing: "4. Forma de pagamento",
};

const INSTAGRAM_MESSAGE = {
  linked: "Instagram conectado.",
  not_found: "Não encontramos o Instagram com esse @ compartilhado com a GereVendas. Compartilhe e tente de novo.",
  taken: "Esse Instagram já está ligado a outra empresa no GereVendas Ads. Fale com o suporte.",
  skipped: "",
} as const;

export function ConnectionSteps({
  connection,
  canManage,
  demo,
  simulated,
  disabledReason,
  businessId,
  defaultInviteEmail,
}: Props) {
  const router = useRouter();
  const steps = computeSteps(connection);
  const stateOf = (key: StepKey) => steps.find((s) => s.key === key)?.state ?? "locked";
  const interactive = !demo && canManage && disabledReason === null;
  const anyWaiting = steps.some((s) => s.state === "waiting");
  const allDone = steps.every((s) => s.state === "done");

  const [message, setMessage] = useState<Message | null>(null);
  const [pending, start] = useTransition();
  const [pageUrl, setPageUrl] = useState("");
  const [instagram, setInstagram] = useState("");
  const [email, setEmail] = useState(connection?.client_invite_email ?? defaultInviteEmail);
  const [copied, setCopied] = useState(false);

  // Ao abrir a tela, confere na Meta o que estava aguardando (o servidor limita a 1 checagem a cada 15 s).
  useEffect(() => {
    if (!interactive || !anyWaiting) return;
    let cancelled = false;
    void refreshMetaStatus().then((res) => {
      if (!cancelled && res.ok && res.data.changed) router.refresh();
    });
    return () => {
      cancelled = true;
    };
  }, [interactive, anyWaiting, router]);

  function run<T>(action: () => Promise<ApiResult<T>>, onOk?: (data: T) => Message | null) {
    setMessage(null);
    start(async () => {
      const res = await action();
      if (!res.ok) {
        setMessage({ tone: "danger", text: res.error.message });
        return;
      }
      setMessage(onOk ? onOk(res.data) : null);
      router.refresh();
    });
  }

  async function copyBusinessId() {
    if (!businessId) return;
    await navigator.clipboard.writeText(businessId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const shownBusinessId = businessId ?? "000000000000000";

  return (
    <div className="mt-8 space-y-5">
      {demo && (
        <Alert tone="info" title="Demonstração">
          No piloto com conta, estes 4 passos ligam sua empresa à Meta. Aqui você só vê como funciona.
        </Alert>
      )}
      {disabledReason === "kill_switch" && (
        <Alert tone="warning" title="Integração suspensa">
          A conexão com a Meta está pausada pela nossa equipe. Seus dados continuam salvos.
        </Alert>
      )}
      {disabledReason === "config_missing" && (
        <Alert tone="danger" title="Integração indisponível">
          A conexão com a Meta não está configurada. Nossa equipe foi avisada.
        </Alert>
      )}
      {!demo && !canManage && (
        <Alert tone="info">Apenas o proprietário da empresa pode fazer a conexão com a Meta.</Alert>
      )}
      <Alert tone="info" title="Cobrança de mídia separada">
        Os anúncios são pagos direto à Meta, com o cartão ou Pix que você cadastrar lá. O GereVendas Ads nunca recebe
        dados de pagamento da mídia.
      </Alert>

      {message && <Alert tone={message.tone}>{message.text}</Alert>}

      {/* Passo 1 */}
      <StepCard title={TITLE.ad_account} state={stateOf("ad_account")} simulated={simulated}>
        {stateOf("ad_account") === "done" && connection && (
          <p>
            Sua conta <strong>{connection.ad_account_name}</strong> ({connection.ad_account_id}) está reservada na BM da
            GereVendas.
          </p>
        )}
        {stateOf("ad_account") === "waiting" && (
          <p>Estamos preparando sua conta de anúncios. Volte em breve; você não precisa fazer nada agora.</p>
        )}
        {stateOf("ad_account") === "todo" && (
          <>
            <p>Reservamos uma conta de anúncios só sua, dentro da BM da GereVendas. Leva um clique.</p>
            {interactive && (
              <Button className="mt-3" disabled={pending} onClick={() => run(requestAdAccount, (d) =>
                d.pool_empty
                  ? { tone: "info", text: "Estamos preparando sua conta. Volte em breve." }
                  : { tone: "success", text: "Conta de anúncios reservada." },
              )}>
                {pending ? "Reservando…" : "Reservar minha conta de anúncios"}
              </Button>
            )}
          </>
        )}
      </StepCard>

      {/* Passo 2 */}
      <StepCard title={TITLE.page} state={stateOf("page")} simulated={simulated}>
        {stateOf("page") === "locked" && <p>Disponível depois da conta de anúncios.</p>}
        {stateOf("page") === "done" && connection && (
          <>
            <p>
              Página <strong>{connection.page_name}</strong> conectada.{" "}
              {connection.instagram_status === "done"
                ? "Instagram conectado."
                : "Instagram ainda não conectado: os anúncios saem só no Facebook até você ligar o Instagram."}
            </p>
            {interactive && (
              <div className="mt-3 flex flex-wrap items-end gap-3">
                {connection.instagram_status !== "done" && (
                  <form
                    className="flex flex-wrap items-end gap-3"
                    onSubmit={(e) => {
                      e.preventDefault();
                      run(
                        () => linkMetaInstagram({ instagram_username: instagram }),
                        (d) => ({ tone: d.instagram === "linked" ? "success" : "warning", text: INSTAGRAM_MESSAGE[d.instagram] }),
                      );
                    }}
                  >
                    <Field id="instagram_retry" label="@ do Instagram">
                      <Input id="instagram_retry" value={instagram} onChange={(e) => setInstagram(e.target.value)} placeholder="@seunegocio" />
                    </Field>
                    <Button type="submit" variant="secondary" disabled={pending || !instagram.trim()}>
                      Ligar Instagram
                    </Button>
                  </form>
                )}
                <Button type="button" variant="secondary" disabled={pending} onClick={() => run(unlinkMetaPage)}>
                  Trocar Página
                </Button>
              </div>
            )}
          </>
        )}
        {stateOf("page") === "todo" && (
          <>
            <p>Compartilhe sua Página e seu Instagram com a GereVendas na Meta. Você continua dono deles.</p>
            <ol className="mt-3 list-decimal space-y-1.5 pl-5">
              <li>
                Abra as{" "}
                <a href={META_PARTNERS_URL} target="_blank" rel="noreferrer" className="font-medium text-brand underline">
                  configurações de parceiros no Business Suite
                </a>
                .
              </li>
              <li>Escolha a opção para dar a um parceiro acesso aos seus ativos.</li>
              <li>
                Cole o ID da GereVendas: <code className="rounded bg-surface-muted px-1.5 py-0.5">{shownBusinessId}</code>{" "}
                {businessId && (
                  <button type="button" onClick={copyBusinessId} className="text-sm font-medium text-brand hover:underline">
                    {copied ? "Copiado" : "Copiar"}
                  </button>
                )}
              </li>
              <li>Marque sua Página e seu Instagram, com a permissão de anúncios, e salve.</li>
              <li>Volte aqui, cole o link da sua Página e clique em Verificar.</li>
            </ol>
            <p className="mt-2 text-xs text-ink-faint">
              Ainda não tem portfólio empresarial? A Meta pede para criar um quando você abre o Business Suite.
              {simulated && " Em Simulação, qualquer link de Página funciona; um link com “nao-compartilhada” mostra o erro."}
            </p>
            {interactive && (
              <form
                className="mt-4 grid gap-3 sm:grid-cols-[1fr_200px_auto] sm:items-end"
                onSubmit={(e) => {
                  e.preventDefault();
                  run(
                    () => linkMetaPage({ page_url: pageUrl, instagram_username: instagram }),
                    (d) => ({
                      tone: d.instagram === "not_found" || d.instagram === "taken" ? "warning" : "success",
                      text: `Página ${d.page_name} conectada. ${INSTAGRAM_MESSAGE[d.instagram]}`.trim(),
                    }),
                  );
                }}
              >
                <Field id="page_url" label="Link da sua Página">
                  <Input id="page_url" value={pageUrl} onChange={(e) => setPageUrl(e.target.value)} placeholder="facebook.com/seunegocio" />
                </Field>
                <Field id="instagram_username" label="@ do Instagram (opcional)">
                  <Input id="instagram_username" value={instagram} onChange={(e) => setInstagram(e.target.value)} placeholder="@seunegocio" />
                </Field>
                <Button type="submit" disabled={pending || !pageUrl.trim()}>
                  {pending ? "Verificando…" : "Verificar"}
                </Button>
              </form>
            )}
          </>
        )}
      </StepCard>

      {/* Passo 3 */}
      <StepCard title={TITLE.invite} state={stateOf("invite")} simulated={simulated}>
        {stateOf("invite") === "locked" && <p>Disponível depois de conectar a Página.</p>}
        {stateOf("invite") === "done" && <p>Você é administrador da sua conta de anúncios.</p>}
        {stateOf("invite") === "waiting" && (
          <>
            <p>
              A Meta enviou um convite para <strong>{connection?.client_invite_email}</strong>. Abra o e-mail, aceite o
              convite da GereVendas e volte aqui.
            </p>
            {interactive && (
              <Button className="mt-3" variant="secondary" disabled={pending} onClick={() => run(refreshMetaStatus, (d) =>
                d.changed ? { tone: "success", text: "Convite aceito." } : { tone: "info", text: "Ainda não aparece como aceito. Tente de novo em 1 minuto." },
              )}>
                Verificar agora
              </Button>
            )}
          </>
        )}
        {(stateOf("invite") === "todo" || stateOf("invite") === "error") && (
          <>
            <p>
              {stateOf("invite") === "error"
                ? "O convite expirou. Envie de novo."
                : "Para você cadastrar o pagamento, a Meta precisa te colocar como administrador da sua conta. Enviamos um convite por e-mail."}
            </p>
            {interactive && (
              <form
                className="mt-3 flex flex-wrap items-end gap-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  run(() => sendMetaInvite({ email }), () => ({ tone: "success", text: "Convite enviado. Confira seu e-mail." }));
                }}
              >
                <Field id="invite_email" label="Seu e-mail">
                  <Input id="invite_email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                </Field>
                <Button type="submit" disabled={pending || !email.trim()}>
                  {pending ? "Enviando…" : "Enviar convite"}
                </Button>
              </form>
            )}
          </>
        )}
      </StepCard>

      {/* Passo 4 */}
      <StepCard title={TITLE.billing} state={stateOf("billing")} simulated={simulated}>
        {stateOf("billing") === "locked" && <p>Disponível depois de aceitar o convite.</p>}
        {stateOf("billing") === "done" && <p>A Meta confirmou uma forma de pagamento na sua conta.</p>}
        {stateOf("billing") === "todo" && connection?.ad_account_id && (
          <>
            <p>Cadastre cartão ou Pix na tela oficial da Meta. Depois volte e clique em verificar.</p>
            {interactive && (
              <div className="mt-3 flex flex-wrap gap-3">
                <a
                  href={metaBillingUrl(connection.ad_account_id)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-strong"
                >
                  Cadastrar pagamento na Meta
                </a>
                <Button variant="secondary" disabled={pending} onClick={() => run(refreshMetaStatus, (d) =>
                  d.changed ? { tone: "success", text: "Forma de pagamento confirmada." } : { tone: "info", text: "A Meta ainda não mostra forma de pagamento. Tente de novo em 1 minuto." },
                )}>
                  Já cadastrei, verificar
                </Button>
              </div>
            )}
          </>
        )}
      </StepCard>

      {allDone && (
        <Alert tone="success" title="Tudo pronto">
          Sua empresa está conectada à Meta.{" "}
          <a href={`${publicEnv.basePath}/app/campanhas`} className="font-medium underline">
            Ir para Campanhas
          </a>
        </Alert>
      )}
    </div>
  );
}

function StepCard({
  title,
  state,
  simulated,
  children,
}: {
  title: string;
  state: StepState;
  simulated: boolean;
  children: React.ReactNode;
}) {
  return (
    <Card className={state === "locked" ? "p-5 opacity-70 sm:p-6" : "p-5 sm:p-6"}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-lg font-bold">{title}</h2>
        <div className="flex items-center gap-2">
          {simulated && <Badge tone="demo">Simulação</Badge>}
          <Badge tone={BADGE[state].tone}>{BADGE[state].label}</Badge>
        </div>
      </div>
      <div className="mt-2 text-[15px] text-ink-soft">{children}</div>
    </Card>
  );
}
```

Observação para quem implementa: confira em `src/components/ui/button.tsx` se a prop `variant="secondary"` e `className` existem (o painel antigo já usa `variant="secondary"`); confira `bg-brand`/`hover:bg-brand-strong` nas cores de `src/app/globals.css` e use as mesmas classes do `Button` primário se diferirem.

- [ ] **Step 4: Reescrever a página**

`src/app/app/conexoes/page.tsx`:

```tsx
import type { Metadata } from "next";
import { ConnectionSteps } from "@/components/meta/connection-steps";
import { Badge } from "@/components/ui/badge";
import { serverEnv } from "@/lib/env";
import { resolveFlags } from "@/lib/flags";
import { getAppContext } from "@/server/context";
import { loadMetaOnboarding } from "@/server/meta/data";
import { resolveMetaBusinessMode } from "@/server/meta/mode";

export const metadata: Metadata = { title: "Conexões Meta" };

export default async function ConnectionsPage() {
  const ctx = await getAppContext();
  const demo = ctx.mode === "demo" || !ctx.organization;
  const env = serverEnv();
  const mode = resolveMetaBusinessMode(env, resolveFlags(env));
  const connection = demo || ctx.mode !== "supabase" || !ctx.organization ? null : await loadMetaOnboarding(ctx.organization.id);

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight">Conexões Meta</h1>
          <p className="mt-1 text-[15px] text-ink-soft">
            Quatro passos para seus anúncios rodarem no Facebook e no Instagram.
          </p>
        </div>
        {demo ? <Badge tone="demo">Demonstração</Badge> : mode.kind === "mock" && <Badge tone="demo">Modo Simulação</Badge>}
      </div>

      <ConnectionSteps
        connection={connection}
        canManage={ctx.mode === "supabase" && ctx.organization?.role === "owner"}
        demo={demo}
        simulated={mode.kind !== "real"}
        disabledReason={mode.kind === "disabled" ? mode.reason : null}
        businessId={mode.kind === "real" ? mode.businessId : null}
        defaultInviteEmail={ctx.mode === "supabase" ? (ctx.user.email ?? "") : ""}
      />
    </div>
  );
}
```

- [ ] **Step 5: Remover o fluxo antigo**

```bash
git rm src/app/api/meta/oauth/start/route.ts src/app/api/meta/oauth/callback/route.ts src/lib/meta-oauth.ts src/server/meta-discovery.ts src/lib/meta-asset-match.ts src/components/campaigns/meta-connection-panel.tsx tests/unit/meta-oauth.test.ts tests/unit/meta-discovery.test.ts tests/unit/meta-asset-match.test.ts
```

Em `src/server/campaigns.ts`: apagar `connectMetaAssets` e `disconnectMetaAssets` (linhas 28-113) e os imports que ficarem sem uso (`cookies`, `connectMetaAssetsSchema`, `META_DISCOVERED_COOKIE`, `readDiscovery`). Rodar `npx grep`-equivalente: `git grep -n "meta-oauth\|meta-discovery\|meta-asset-match\|connectMetaAssets\|disconnectMetaAssets\|/api/meta/oauth"` deve voltar vazio (exceto docs/specs).

- [ ] **Step 6: Ver passar**

Run: `npm run check && npm run build && npx playwright test conexoes`
Expected: tudo PASS (desktop e mobile). Se `tests/e2e/visual.spec.ts` capturar `/app/conexoes`, atualizar a captura com `npx playwright test visual --update-snapshots` e revisar a imagem.

- [ ] **Step 7: Commit**

```bash
git add -A src/components/meta src/app/app/conexoes src/server/campaigns.ts tests/e2e/conexoes.spec.ts
git commit -m "feat(meta): trilha de 4 passos em Conexões e remoção do login do cliente"
```

---

### Task 6: Painel do operador `/app/operador/estoque`

**Files:**
- Create: `src/server/meta/operator-actions.ts`
- Create: `src/components/meta/pool-panel.tsx`
- Create: `src/app/app/operador/estoque/page.tsx`

**Interfaces:**
- Consumes: RPCs `register_pool_accounts`, `retire_pool_account`, `am_i_platform_operator` (Task 1); `registerPoolAccountsSchema`, `retirePoolAccountSchema` (Task 2); `metaBusinessClient`, `resolveMetaBusinessMode` (Task 3); `isPlatformOperator`, `loadPool`, `PoolAccountView`, `PoolOverview` (Task 4).
- Produces (server actions): `listImportCandidates(): Promise<ApiResult<{accounts: Array<{id: string; name: string}>}>>`; `registerPoolAccounts(input): Promise<ApiResult<{added: number}>>`; `createPoolAccount(): Promise<ApiResult<{ad_account_id: string}>>`; `retirePoolAccount(input): Promise<ApiResult<{retired: true}>>`.

- [ ] **Step 1: Ações do operador**

`src/server/meta/operator-actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { apiError, type ApiError, type ApiResult } from "@/contracts/api";
import { registerPoolAccountsSchema, retirePoolAccountSchema } from "@/contracts/meta";
import { fieldErrors } from "@/contracts/onboarding";
import { serverEnv } from "@/lib/env";
import { resolveFlags } from "@/lib/flags";
import { log } from "@/lib/logger";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAppContext, getCorrelationId } from "../context";
import { MetaError } from "./errors";
import { metaBusinessClient } from "./index";
import { resolveMetaBusinessMode, type ActiveMetaBusinessMode } from "./mode";

type OperatorContext = { correlationId: string; mode: ActiveMetaBusinessMode };

const isApiError = (v: unknown): v is ApiError =>
  typeof v === "object" && v !== null && (v as { ok?: unknown }).ok === false;

async function operatorContext(): Promise<OperatorContext | ApiError> {
  const correlationId = await getCorrelationId();
  const ctx = await getAppContext();
  if (ctx.mode !== "supabase") return apiError("feature_disabled", "Disponível só com conta.", correlationId);
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.rpc("am_i_platform_operator");
  if (data !== true) return apiError("forbidden", "Acesso restrito à equipe GereVendas.", correlationId);
  const env = serverEnv();
  const mode = resolveMetaBusinessMode(env, resolveFlags(env));
  if (mode.kind === "disabled") {
    return apiError(
      "feature_disabled",
      mode.reason === "kill_switch" ? "Kill switch ligado." : `Faltam variáveis: ${(mode.missing ?? []).join(", ")}.`,
      correlationId,
    );
  }
  return { correlationId, mode };
}

function failure(e: unknown, correlationId: string, event: string): ApiError {
  const code = e instanceof MetaError ? e.code : "unknown";
  log("error", event, {
    correlation_id: correlationId,
    code,
    meta_code: e instanceof MetaError ? e.metaCode : undefined,
    meta_subcode: e instanceof MetaError ? e.metaSubcode : undefined,
  });
  return apiError("external_unavailable", `A Meta recusou a operação (${code}). Veja os logs pelo correlation_id.`, correlationId);
}

/** Contas ativas em BRL da BM que ainda não estão no estoque, para o operador escolher. */
export async function listImportCandidates(): Promise<ApiResult<{ accounts: Array<{ id: string; name: string }> }>> {
  const c = await operatorContext();
  if (isApiError(c)) return c;
  try {
    const all = await metaBusinessClient(c.mode).listBusinessAdAccounts();
    const supabase = await createSupabaseServerClient();
    const { data: known } = await supabase.from("meta_ad_account_pool").select("ad_account_id");
    const knownIds = new Set((known ?? []).map((k: { ad_account_id: string }) => k.ad_account_id));
    const accounts = all
      .filter((a) => a.account_status === 1 && a.currency === "BRL" && !knownIds.has(a.id))
      .map((a) => ({ id: a.id, name: a.name }));
    return { ok: true, data: { accounts }, correlation_id: c.correlationId };
  } catch (e) {
    return failure(e, c.correlationId, "meta.pool_list_failed");
  }
}

/** Registra no estoque as contas escolhidas, conferindo que pertencem à BM. */
export async function registerPoolAccounts(input: unknown): Promise<ApiResult<{ added: number }>> {
  const correlationId = await getCorrelationId();
  const parsed = registerPoolAccountsSchema.safeParse(input);
  if (!parsed.success) {
    return apiError("validation_failed", "Escolha as contas.", correlationId, fieldErrors(parsed.error));
  }
  const c = await operatorContext();
  if (isApiError(c)) return c;
  let accounts;
  try {
    const all = await metaBusinessClient(c.mode).listBusinessAdAccounts();
    const wanted = new Set(parsed.data.ad_account_ids);
    accounts = all.filter((a) => wanted.has(a.id) && a.account_status === 1 && a.currency === "BRL");
  } catch (e) {
    return failure(e, c.correlationId, "meta.pool_register_failed");
  }
  if (accounts.length !== parsed.data.ad_account_ids.length) {
    return apiError("conflict", "Alguma conta não pertence à BM ou não está ativa em BRL.", c.correlationId);
  }
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("register_pool_accounts", {
    p_accounts: accounts.map((a) => ({ ad_account_id: a.id, name: a.name, currency: a.currency })),
    p_simulated: c.mode.kind === "mock",
    p_source: "imported",
    p_correlation_id: c.correlationId,
  });
  if (error) {
    log("error", "meta.pool_register_rpc_failed", { correlation_id: c.correlationId, code: error.code });
    return apiError("internal", "Não foi possível registrar as contas.", c.correlationId);
  }
  revalidatePath("/app/operador/estoque");
  return { ok: true, data: { added: data as number }, correlation_id: c.correlationId };
}

/** Cria 1 conta pela API (a Meta permite até 5 por BM) e registra no estoque. */
export async function createPoolAccount(): Promise<ApiResult<{ ad_account_id: string }>> {
  const c = await operatorContext();
  if (isApiError(c)) return c;
  let account;
  try {
    const name = `GereVendas Ads — estoque ${new Date().toISOString().slice(0, 10)}`;
    account = await metaBusinessClient(c.mode).createAdAccount({ name });
  } catch (e) {
    if (e instanceof MetaError && e.code === "config_missing") {
      return apiError("feature_disabled", "Defina META_AD_ACCOUNT_TIMEZONE_ID para criar contas pela API.", c.correlationId);
    }
    return failure(e, c.correlationId, "meta.pool_create_failed");
  }
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("register_pool_accounts", {
    p_accounts: [{ ad_account_id: account.id, name: account.name, currency: account.currency }],
    p_simulated: c.mode.kind === "mock",
    p_source: "api",
    p_correlation_id: c.correlationId,
  });
  if (error) {
    // A conta existe na Meta: registrar pelo "Buscar contas da BM" recupera.
    log("error", "meta.pool_create_rpc_failed", { correlation_id: c.correlationId, code: error.code, ad_account_id: account.id });
    return apiError("internal", `Conta ${account.id} criada na Meta, mas não registrada. Use Buscar contas da BM.`, c.correlationId);
  }
  revalidatePath("/app/operador/estoque");
  return { ok: true, data: { ad_account_id: account.id }, correlation_id: c.correlationId };
}

export async function retirePoolAccount(input: unknown): Promise<ApiResult<{ retired: true }>> {
  const correlationId = await getCorrelationId();
  const parsed = retirePoolAccountSchema.safeParse(input);
  if (!parsed.success) return apiError("validation_failed", "Conta inválida.", correlationId);
  const c = await operatorContext();
  if (isApiError(c)) return c;
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("retire_pool_account", { p_id: parsed.data.id, p_correlation_id: c.correlationId });
  if (error) {
    if (error.message.includes("not_available")) {
      return apiError("conflict", "Só contas livres podem ser aposentadas.", c.correlationId);
    }
    log("error", "meta.pool_retire_failed", { correlation_id: c.correlationId, code: error.code });
    return apiError("internal", "Não foi possível aposentar a conta.", c.correlationId);
  }
  revalidatePath("/app/operador/estoque");
  return { ok: true, data: { retired: true }, correlation_id: c.correlationId };
}
```

- [ ] **Step 2: Componente do painel**

`src/components/meta/pool-panel.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { PoolAccountView, PoolOverview } from "@/server/meta/data";
import {
  createPoolAccount,
  listImportCandidates,
  registerPoolAccounts,
  retirePoolAccount,
} from "@/server/meta/operator-actions";

type Props = {
  overview: PoolOverview;
  accounts: PoolAccountView[];
  simulated: boolean;
  minAvailable: number;
  disabledMessage: string | null;
};

const STATUS_LABEL = { available: "Livre", assigned: "Atribuída", retired: "Aposentada" } as const;

export function PoolPanel({ overview, accounts, simulated, minAvailable, disabledMessage }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ tone: "success" | "danger" | "info"; text: string } | null>(null);
  const [candidates, setCandidates] = useState<Array<{ id: string; name: string }> | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  function act(fn: () => Promise<{ ok: boolean; error?: { message: string } }>, success: string) {
    setMessage(null);
    start(async () => {
      const res = await fn();
      if (!res.ok) {
        setMessage({ tone: "danger", text: res.error?.message ?? "Erro." });
        return;
      }
      setMessage({ tone: "success", text: success });
      setCandidates(null);
      setSelected(new Set());
      router.refresh();
    });
  }

  function loadCandidates() {
    setMessage(null);
    start(async () => {
      const res = await listImportCandidates();
      if (!res.ok) {
        setMessage({ tone: "danger", text: res.error.message });
        return;
      }
      setCandidates(res.data.accounts);
      if (res.data.accounts.length === 0) setMessage({ tone: "info", text: "Nenhuma conta nova ativa em BRL na BM." });
    });
  }

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="mt-8 space-y-5">
      {disabledMessage && <Alert tone="danger">{disabledMessage}</Alert>}
      {overview.available < minAvailable && (
        <Alert tone="warning" title="Estoque baixo">
          {overview.available} conta(s) livre(s); mínimo configurado: {minAvailable}.
          {overview.waiting > 0 && ` ${overview.waiting} empresa(s) aguardando conta.`}
        </Alert>
      )}
      {message && <Alert tone={message.tone}>{message.text}</Alert>}

      <div className="grid gap-4 sm:grid-cols-4">
        {(
          [
            ["Livres", overview.available],
            ["Atribuídas", overview.assigned],
            ["Aposentadas", overview.retired],
            ["Na fila", overview.waiting],
          ] as const
        ).map(([label, value]) => (
          <Card key={label} className="p-4">
            <p className="text-sm text-ink-soft">{label}</p>
            <p className="font-display text-2xl font-bold">{value}</p>
          </Card>
        ))}
      </div>

      <Card className="p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-lg font-bold">Abastecer o estoque</h2>
          {simulated && <Badge tone="demo">Simulação</Badge>}
        </div>
        <p className="mt-1 text-sm text-ink-soft">
          Crie contas no Business Suite (ou pela API, até 5 por BM) e registre aqui só as que são para clientes.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Button disabled={pending || Boolean(disabledMessage)} onClick={loadCandidates}>
            Buscar contas da BM
          </Button>
          <Button
            variant="secondary"
            disabled={pending || Boolean(disabledMessage)}
            onClick={() => act(createPoolAccount, "Conta criada pela API e registrada.")}
          >
            Criar 1 conta pela API
          </Button>
        </div>

        {candidates && candidates.length > 0 && (
          <div className="mt-5 space-y-2">
            {candidates.map((c) => (
              <label key={c.id} className="flex items-center gap-2.5 text-sm">
                <input
                  type="checkbox"
                  checked={selected.has(c.id)}
                  onChange={() => toggle(c.id)}
                  className="size-4 accent-[var(--color-brand)]"
                />
                <span>
                  {c.name} <span className="text-ink-faint">({c.id})</span>
                </span>
              </label>
            ))}
            <Button
              className="mt-2"
              disabled={pending || selected.size === 0}
              onClick={() => act(() => registerPoolAccounts({ ad_account_ids: [...selected] }), "Contas registradas no estoque.")}
            >
              Registrar {selected.size} conta(s)
            </Button>
          </div>
        )}
      </Card>

      <Card className="overflow-x-auto p-5 sm:p-6">
        <h2 className="font-display text-lg font-bold">Contas</h2>
        {accounts.length === 0 ? (
          <p className="mt-2 text-sm text-ink-soft">Nenhuma conta no estoque ainda.</p>
        ) : (
          <table className="mt-3 w-full text-left text-sm">
            <thead className="text-ink-faint">
              <tr>
                <th className="py-2 pr-3">Conta</th>
                <th className="py-2 pr-3">Situação</th>
                <th className="py-2 pr-3">Origem</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {accounts.map((a) => (
                <tr key={a.id} className="border-t border-line">
                  <td className="py-2 pr-3">
                    {a.name}
                    <div className="text-xs text-ink-faint">{a.ad_account_id}</div>
                  </td>
                  <td className="py-2 pr-3">
                    {STATUS_LABEL[a.status]}
                    {a.status === "assigned" && !a.organization_id && " (empresa excluída)"}
                  </td>
                  <td className="py-2 pr-3">{a.source === "api" ? "API" : "Importada"}</td>
                  <td className="py-2 text-right">
                    {a.status === "available" && (
                      <Button
                        variant="secondary"
                        disabled={pending}
                        onClick={() => act(() => retirePoolAccount({ id: a.id }), "Conta aposentada.")}
                      >
                        Aposentar
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
```

- [ ] **Step 3: Página do operador**

`src/app/app/operador/estoque/page.tsx`:

```tsx
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PoolPanel } from "@/components/meta/pool-panel";
import { serverEnv } from "@/lib/env";
import { resolveFlags } from "@/lib/flags";
import { getAppContext } from "@/server/context";
import { isPlatformOperator, loadPool } from "@/server/meta/data";
import { resolveMetaBusinessMode } from "@/server/meta/mode";

export const metadata: Metadata = { title: "Estoque de contas" };

export default async function PoolPage() {
  const ctx = await getAppContext();
  if (ctx.mode !== "supabase" || !(await isPlatformOperator())) notFound();

  const env = serverEnv();
  const mode = resolveMetaBusinessMode(env, resolveFlags(env));
  const simulated = mode.kind !== "real";
  const { overview, accounts } = await loadPool(simulated);
  const disabledMessage =
    mode.kind === "disabled"
      ? mode.reason === "kill_switch"
        ? "Kill switch ligado: nenhuma chamada à Meta."
        : `Modo real sem configuração. Faltam: ${(mode.missing ?? []).join(", ")}.`
      : null;

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="font-display text-3xl font-bold tracking-tight">Estoque de contas de anúncios</h1>
      <p className="mt-1 text-[15px] text-ink-soft">Contas da BM da GereVendas reservadas para clientes.</p>
      <PoolPanel
        overview={overview}
        accounts={accounts}
        simulated={simulated}
        minAvailable={env.META_POOL_MIN_AVAILABLE}
        disabledMessage={disabledMessage}
      />
    </div>
  );
}
```

- [ ] **Step 4: Verificar**

Run: `npm run check && npm run build`
Expected: PASS. Em demo, `/app/operador/estoque` responde 404 (conferir com `npm run start` e abrir a URL).

- [ ] **Step 5: Commit**

```bash
git add src/server/meta/operator-actions.ts src/components/meta/pool-panel.tsx src/app/app/operador
git commit -m "feat(meta): painel do operador para o estoque de contas"
```

---

### Task 7: Teste de contrato real, guia do operador e documentação

**Files:**
- Create: `tests/contract/meta.contract.test.ts`, `vitest.contract.config.mts`, `docs/META_OPERADOR.md`
- Modify: `package.json` (script `test:meta-contract`), `.env.example`, `docs/08_CONTRATOS.md`, `docs/STATUS.md`

**Interfaces:**
- Consumes: `RealMetaBusinessClient`, `parsePageLink`, `META_GRAPH_VERSION`.

- [ ] **Step 1: Configuração e teste de contrato**

`vitest.contract.config.mts` (mesmo alias do `vitest.config` existente):

```ts
import { fileURLToPath } from "node:url";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

// Teste de contrato contra a Meta real. Fora do CI; lê .env.local. Uso: npm run test:meta-contract
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    include: ["tests/contract/**/*.test.ts"],
    environment: "node",
    testTimeout: 30_000,
    env: loadEnv("", process.cwd(), ""),
  },
});
```

`tests/contract/meta.contract.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parsePageLink } from "@/lib/meta-page-link";
import { META_GRAPH_VERSION } from "@/server/meta/graph";
import { RealMetaBusinessClient } from "@/server/meta/real-client";

// Prova cada chamada do ADR 0005 com o App em acesso padrão (sem App Review).
// Leituras rodam com META_BUSINESS_ID + META_SYSTEM_USER_TOKEN + META_APP_SECRET.
// Escritas exigem META_CONTRACT_WRITE=1 e as variáveis específicas de cada teste.
const env = process.env;
const ready = Boolean(env.META_BUSINESS_ID && env.META_SYSTEM_USER_TOKEN && env.META_APP_SECRET);
const write = env.META_CONTRACT_WRITE === "1";

const client = () =>
  new RealMetaBusinessClient({
    businessId: env.META_BUSINESS_ID!,
    accessToken: env.META_SYSTEM_USER_TOKEN!,
    appSecret: env.META_APP_SECRET!,
    timezoneId: env.META_AD_ACCOUNT_TIMEZONE_ID ? Number(env.META_AD_ACCOUNT_TIMEZONE_ID) : undefined,
  });

const report = (label: string, value: unknown) => console.info(`[contrato ${META_GRAPH_VERSION}] ${label}:`, value);

describe.skipIf(!ready)(`Contrato Meta ${META_GRAPH_VERSION} — leituras`, () => {
  it("lista as contas de anúncios da BM (owned_ad_accounts)", async () => {
    const accounts = await client().listBusinessAdAccounts();
    report("contas da BM", accounts.map((a) => ({ id: a.id, status: a.account_status, currency: a.currency })));
    expect(Array.isArray(accounts)).toBe(true);
  });

  it.skipIf(!env.META_CONTRACT_AD_ACCOUNT_ID)("lê forma de pagamento da conta (funding_source)", async () => {
    const funding = await client().getFunding(env.META_CONTRACT_AD_ACCOUNT_ID!);
    report("pagamento", funding);
    expect(typeof funding.has_funding_source).toBe("boolean");
  });

  it.skipIf(!env.META_CONTRACT_PAGE_URL)("encontra a Página compartilhada como parceiro (client_pages)", async () => {
    const ref = parsePageLink(env.META_CONTRACT_PAGE_URL!);
    expect(ref).not.toBeNull();
    const page = await client().findClientPage(ref!);
    report("Página", page);
    expect(page).not.toBeNull();
  });

  it.skipIf(!env.META_CONTRACT_INSTAGRAM)("encontra o Instagram compartilhado (client_instagram_assets)", async () => {
    const ig = await client().findClientInstagram(env.META_CONTRACT_INSTAGRAM!.replace(/^@/, ""));
    report("Instagram", ig);
    expect(ig).not.toBeNull();
  });

  it.skipIf(!env.META_CONTRACT_INVITE_EMAIL)("consulta o convite do e-mail (business_users / pending_users)", async () => {
    const invite = await client().getBusinessUserInvite(env.META_CONTRACT_INVITE_EMAIL!);
    report("convite", invite);
    expect(["pending", "accepted", "expired"]).toContain(invite.status);
  });
});

describe.skipIf(!ready || !write)(`Contrato Meta ${META_GRAPH_VERSION} — escritas reais`, () => {
  it.skipIf(!env.META_CONTRACT_INVITE_EMAIL || env.META_CONTRACT_SKIP_INVITE === "1")(
    "convida o e-mail para a BM como EMPLOYEE",
    async () => {
      await client().inviteBusinessUser(env.META_CONTRACT_INVITE_EMAIL!);
      report("convite enviado para", env.META_CONTRACT_INVITE_EMAIL);
    },
  );

  it.skipIf(!env.META_CONTRACT_AD_ACCOUNT_ID)("renomeia a conta de teste", async () => {
    await client().renameAdAccount(env.META_CONTRACT_AD_ACCOUNT_ID!, "GereVendas Ads — teste de contrato");
  });

  it.skipIf(!env.META_CONTRACT_AD_ACCOUNT_ID || !env.META_CONTRACT_BUSINESS_USER_ID)(
    "atribui MANAGE ao usuário da BM na conta (assigned_users)",
    async () => {
      await client().assignAdAccountUser(env.META_CONTRACT_AD_ACCOUNT_ID!, env.META_CONTRACT_BUSINESS_USER_ID!);
    },
  );

  it.skipIf(env.META_CONTRACT_CREATE_ACCOUNT !== "1")("cria 1 conta pela API (gasta 1 da cota de 5)", async () => {
    const account = await client().createAdAccount({ name: "GereVendas Ads — teste de contrato" });
    report("conta criada", account);
    expect(account.id).toMatch(/^act_/);
  });
});
```

Em `package.json`, adicionar em `scripts`: `"test:meta-contract": "vitest run --config vitest.contract.config.mts"`. Confirmar que `vite` resolve (`node -e "import('vite').then(()=>console.log('ok'))"`); se não, trocar `loadEnv` por `process.loadEnvFile?.(".env.local")` no topo do config.

- [ ] **Step 2: Rodar sem credenciais**

Run: `npm run test:meta-contract`
Expected: todos os testes `skipped` (sem `META_*` no ambiente), saída 0.

- [ ] **Step 3: Guia do operador**

`docs/META_OPERADOR.md` com estas seções, em pt-BR e passo a passo:

1. **App do tipo Empresa:** developers.facebook.com › seu App › Configurações › Básico: conferir tipo "Empresa" e o portfólio empresarial vinculado.
2. **System User:** Business Suite › Configurações › Usuários › Usuários do sistema › Adicionar (função Administrador). Atribuir ao System User: o App (controle total) e as contas de anúncios do estoque.
3. **Token:** no System User, Gerar token, App = o seu, permissões `ads_management`, `ads_read`, `business_management`, `pages_show_list`, `pages_read_engagement`. Validade: nunca expira (se a opção existir). Colar em `.env.local` como `META_SYSTEM_USER_TOKEN` — nunca no chat, commit ou print.
4. **Variáveis:** `META_MODE=real`, `FEATURE_FLAG_ACCOUNT_CREATION=true`, `META_BUSINESS_ID`, `META_SYSTEM_USER_TOKEN`, `META_APP_SECRET`, opcional `META_AD_ACCOUNT_TIMEZONE_ID` (fuso de uma conta existente da BM: aparece em `timezone_id` na leitura de contas).
5. **Teste de contrato:** preparar uma Página e um Instagram num **outro** portfólio, compartilhar com a BM como parceiro, depois `META_CONTRACT_PAGE_URL=… META_CONTRACT_INSTAGRAM=@… META_CONTRACT_AD_ACCOUNT_ID=act_… META_CONTRACT_INVITE_EMAIL=… npm run test:meta-contract`. Escritas: acrescentar `META_CONTRACT_WRITE=1` (e `META_CONTRACT_CREATE_ACCOUNT=1` só se quiser gastar 1 da cota de 5). Conferir manualmente que `META_PARTNERS_URL` e o link de pagamento de `src/lib/meta-links.ts` abrem as telas certas. Copiar a saída `[contrato v25.0]` para a seção "Resultados" do ADR 0005.
6. **Virar operador:** no SQL do Supabase do Ads: `insert into private.platform_operators (user_id) select id from auth.users where email = '<seu e-mail>';` Depois abrir `/app/operador/estoque`.
7. **Produção (EasyPanel):** as mesmas variáveis no serviço `ads`; `SUPABASE_SERVICE_ROLE_KEY` também é obrigatória (as RPCs `meta_set_*` usam service role).

- [ ] **Step 4: Documentação**

- `.env.example`: trocar o bloco "# Meta (FORA DO ESCOPO na fase 1 …)" por:

```bash
# Meta — BM única da GereVendas (ADR 0005). Guia: docs/META_OPERADOR.md
# Modo real exige META_MODE=real + FEATURE_FLAG_ACCOUNT_CREATION=true + as variáveis da BM.
META_MODE=mock
META_APP_ID=
META_APP_SECRET=
META_BUSINESS_ID=
# Token do System User da BM: só no servidor, nunca commitar.
META_SYSTEM_USER_TOKEN=
# Fuso das contas criadas pela API (ID numérico da Meta). Opcional.
META_AD_ACCOUNT_TIMEZONE_ID=
META_POOL_MIN_AVAILABLE=2
```

(remover `META_REDIRECT_URI` e `META_GRAPH_API_VERSION`, que deixam de existir).

- `docs/08_CONTRATOS.md`: na seção "Campanhas e Conexão Meta", trocar a linha de RPCs `upsert_meta_connection`/`disconnect_meta_connection` por referência à nova seção e adicionar:

```markdown
## BM única: estoque e conexões (`src/contracts/meta.ts`, ADR 0005)
- Tabelas: `meta_ad_account_pool` (estoque; operador lê tudo, cliente só a própria conta), `meta_pool_events`
  (ações do operador), `private.platform_operators`. `meta_connections` ganha os status dos 4 passos.
- RPCs do cliente (owner): `assign_pool_account`, `unlink_meta_page`. Do operador: `register_pool_accounts`,
  `retire_pool_account`, `meta_pool_overview`, `am_i_platform_operator`.
- RPCs só do servidor (`service_role`), gravam o que a Graph API confirmou: `meta_set_ad_account_name`,
  `meta_set_page`, `meta_set_instagram`, `meta_set_invite`, `meta_set_billing`, `meta_touch_checked`,
  `meta_link_attempt`.
- `status = 'connected'` só com conta atribuída, Página ligada, convite aceito e pagamento verificado.
- Server actions: `requestAdAccount`, `linkMetaPage`, `sendMetaInvite`, `refreshMetaStatus`, `unlinkMetaPage`
  (`src/server/meta/actions.ts`); operador em `src/server/meta/operator-actions.ts`.
- Graph API `v25.0`; chamadas com token do System User + `appsecret_proof`; nenhum token de cliente.
```

- `docs/STATUS.md`: atualizar a data para 25/10/2026 e, no M3, substituir o item `META_ENABLED_IN_THIS_BUILD = false…` por: "BM única com estoque de contas (ADR 0005): **REAL** no banco e em Simulação; modo real **BLOQUEADO** até System User + teste de contrato (`docs/META_OPERADOR.md`). Login do Facebook do cliente removido."

- [ ] **Step 5: Verificação completa**

Run: `npm run check && npm run build && npm run test:e2e`
Expected: PASS. `npm run test:db` local ou job `banco` do CI: PASS.

- [ ] **Step 6: Commit**

```bash
git add tests/contract vitest.contract.config.mts package.json .env.example docs/META_OPERADOR.md docs/08_CONTRATOS.md docs/STATUS.md
git commit -m "test(meta): contrato real da BM, guia do operador e docs"
```
