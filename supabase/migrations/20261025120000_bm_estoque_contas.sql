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
     set status = 'disconnected', page_id = null, page_name = null, page_access_status = 'pending',
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
           -- Sem Página a conexão não pode seguir `connected` (check da tabela); o refresh recalcula.
           status = case when p_status = 'done' then status else 'disconnected' end,
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
