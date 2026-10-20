-- GereVendas Ads — M1 completo: convites de membros, logo da marca, termos/consentimentos e LGPD.
-- Migration aditiva com RLS e RPCs de escrita/exportação/exclusão.

-- 1. Papel de suporte excepcional auditado (M1/PRD)
alter type public.member_role add value if not exists 'support';

-- 2. Logo da marca em businesses (aponta para asset privado da mesma organização)
alter table public.businesses add column logo_asset_id uuid;
alter table public.businesses add constraint businesses_logo_asset_fk
  foreign key (logo_asset_id, organization_id) references public.assets (id, organization_id)
  on delete set null (logo_asset_id);

-- 3. Convites de membros
create type public.invite_status as enum ('pending', 'accepted', 'revoked');

create table public.organization_invites (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  email text not null check (char_length(email) between 3 and 200 and email = lower(email)),
  role public.member_role not null check (role in ('admin', 'member')),
  token text not null unique check (token ~ '^[A-Za-z0-9_-]{16,64}$'),
  status public.invite_status not null default 'pending',
  expires_at timestamptz not null default (now() + interval '7 days'),
  invited_by uuid references auth.users (id) on delete set null,
  accepted_by uuid references auth.users (id) on delete set null,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  unique (id, organization_id),
  check ((status = 'accepted') = (accepted_at is not null))
);

create unique index organization_invites_one_pending
  on public.organization_invites (organization_id, email)
  where status = 'pending';
create index organization_invites_org_idx on public.organization_invites (organization_id, created_at desc);

-- 4. Termos e consentimentos (LGPD)
create type public.consent_kind as enum (
  'terms_of_use',
  'privacy_policy',
  'ai_processing',
  'pilot_participation'
);

create table public.user_consents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  kind public.consent_kind not null,
  version text not null check (char_length(version) between 1 and 40),
  accepted_at timestamptz not null default now(),
  unique (organization_id, user_id, kind, version)
);

create index user_consents_org_user_idx on public.user_consents (organization_id, user_id);

-- ---------------------------------------------------------------------------
-- Grants e RLS
-- ---------------------------------------------------------------------------
revoke all on public.organization_invites, public.user_consents from anon, authenticated, public;
grant select on public.organization_invites, public.user_consents to authenticated;

alter table public.organization_invites enable row level security;
alter table public.user_consents enable row level security;

create policy organization_invites_select on public.organization_invites
  for select to authenticated
  using (private.has_org_role(organization_id, array['owner', 'admin']::public.member_role[]));

create policy user_consents_select on public.user_consents
  for select to authenticated
  using (private.is_org_member(organization_id));

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------

-- Cria convite para membro ou administrador (apenas owner/admin).
create function public.create_organization_invite(
  p_org uuid,
  p_email text,
  p_role public.member_role,
  p_token text,
  p_correlation_id text default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(trim(p_email));
  v_id uuid;
begin
  if (select auth.uid()) is null or not private.has_org_role(p_org, array['owner', 'admin']::public.member_role[]) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_role not in ('admin', 'member') then
    raise exception 'invalid_role' using errcode = 'P0001';
  end if;

  insert into public.organization_invites (organization_id, email, role, token, invited_by)
  values (p_org, v_email, p_role, p_token, (select auth.uid()))
  returning id into v_id;

  perform public.log_audit_event(
    p_org,
    'organization.invite_created',
    'organization_invite',
    v_id,
    p_correlation_id,
    jsonb_build_object('email', v_email, 'role', p_role)
  );
  return v_id;
end;
$$;

-- Revoga convite pendente (apenas owner/admin).
create function public.revoke_organization_invite(
  p_invite uuid,
  p_correlation_id text default null
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
begin
  select i.organization_id into v_org from public.organization_invites i where i.id = p_invite;
  if (select auth.uid()) is null or v_org is null or not private.has_org_role(v_org, array['owner', 'admin']::public.member_role[]) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  update public.organization_invites
     set status = 'revoked'
   where id = p_invite and status = 'pending';

  perform public.log_audit_event(
    v_org,
    'organization.invite_revoked',
    'organization_invite',
    p_invite,
    p_correlation_id,
    '{}'::jsonb
  );
end;
$$;

-- Consulta pública por token (para a tela /convite/[token] exibir o nome da empresa sem expor a tabela).
create function public.inspect_organization_invite(p_token text) returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_inv public.organization_invites%rowtype;
  v_org_name text;
begin
  if (select auth.uid()) is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  select * into v_inv from public.organization_invites where token = p_token;
  if v_inv.id is null then
    return null;
  end if;
  select o.name into v_org_name from public.organizations o where o.id = v_inv.organization_id;
  return jsonb_build_object(
    'id', v_inv.id,
    'organization_id', v_inv.organization_id,
    'organization_name', v_org_name,
    'email', v_inv.email,
    'role', v_inv.role,
    'status', v_inv.status,
    'expired', v_inv.expires_at < now()
  );
end;
$$;

-- Aceita convite pelo token: valida que o e-mail do usuário autenticado corresponde ao convite.
create function public.accept_organization_invite(
  p_token text,
  p_correlation_id text default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_user_email text;
  v_inv public.organization_invites%rowtype;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  select lower(u.email) into v_user_email from auth.users u where u.id = v_uid;
  select * into v_inv from public.organization_invites i where i.token = p_token for update;
  if v_inv.id is null then
    raise exception 'invite_not_found' using errcode = 'P0002';
  end if;
  if v_inv.status <> 'pending' or v_inv.expires_at < now() then
    raise exception 'invite_expired' using errcode = 'P0001';
  end if;
  if v_user_email is null or v_user_email <> v_inv.email then
    raise exception 'invite_email_mismatch' using errcode = '42501';
  end if;

  insert into public.organization_members (organization_id, user_id, role)
  values (v_inv.organization_id, v_uid, v_inv.role)
  on conflict (organization_id, user_id) do nothing;

  update public.organization_invites
     set status = 'accepted', accepted_by = v_uid, accepted_at = now()
   where id = v_inv.id;

  perform public.log_audit_event(
    v_inv.organization_id,
    'organization.invite_accepted',
    'organization_invite',
    v_inv.id,
    p_correlation_id,
    jsonb_build_object('role', v_inv.role)
  );
  return v_inv.organization_id;
end;
$$;

-- Registra o logo da empresa já enviado ao Storage privado.
create function public.register_business_logo(
  p_business uuid,
  p_asset uuid,
  p_storage_path text,
  p_mime text,
  p_bytes integer,
  p_correlation_id text default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
begin
  select b.organization_id into v_org from public.businesses b where b.id = p_business;
  if (select auth.uid()) is null or v_org is null or not private.is_org_member(v_org) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_storage_path !~ ('^' || v_org || '/' || p_asset || '\.(jpg|png)$') then
    raise exception 'invalid_path' using errcode = 'P0001';
  end if;

  insert into public.assets (id, organization_id, kind, storage_path, mime, bytes, rights_confirmed_at, created_by)
  values (p_asset, v_org, 'photo', p_storage_path, p_mime, p_bytes, now(), (select auth.uid()));

  update public.businesses set logo_asset_id = p_asset where id = p_business;

  perform public.log_audit_event(
    v_org,
    'business.logo_updated',
    'asset',
    p_asset,
    p_correlation_id,
    jsonb_build_object('business_id', p_business)
  );
  return p_asset;
end;
$$;

-- Registra termos e consentimentos LGPD do membro na organização.
create function public.record_user_consents(
  p_org uuid,
  p_version text,
  p_kinds public.consent_kind[],
  p_correlation_id text default null
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_kind public.consent_kind;
begin
  if v_uid is null or not private.is_org_member(p_org) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  foreach v_kind in array p_kinds loop
    insert into public.user_consents (organization_id, user_id, kind, version)
    values (p_org, v_uid, v_kind, p_version)
    on conflict (organization_id, user_id, kind, version) do nothing;
  end loop;

  perform public.log_audit_event(
    p_org,
    'privacy.consents_recorded',
    'organization',
    p_org,
    p_correlation_id,
    jsonb_build_object('version', p_version, 'kinds', to_jsonb(p_kinds))
  );
end;
$$;

-- Exporta todos os dados da organização em JSON (LGPD portabilidade; apenas owner/admin).
create function public.export_organization_data(
  p_org uuid,
  p_correlation_id text default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if (select auth.uid()) is null or not private.has_org_role(p_org, array['owner', 'admin']::public.member_role[]) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'exported_at', now(),
    'organization', (select to_jsonb(o) from public.organizations o where o.id = p_org),
    'members', coalesce((select jsonb_agg(to_jsonb(m)) from public.organization_members m where m.organization_id = p_org), '[]'::jsonb),
    'businesses', coalesce((select jsonb_agg(to_jsonb(b)) from public.businesses b where b.organization_id = p_org), '[]'::jsonb),
    'offers', coalesce((select jsonb_agg(to_jsonb(f)) from public.offers f where f.organization_id = p_org), '[]'::jsonb),
    'briefs', coalesce((select jsonb_agg(to_jsonb(r)) from public.briefs r where r.organization_id = p_org), '[]'::jsonb),
    'strategies', coalesce((select jsonb_agg(to_jsonb(s)) from public.strategies s where s.organization_id = p_org), '[]'::jsonb),
    'creatives', coalesce((select jsonb_agg(to_jsonb(c)) from public.creatives c where c.organization_id = p_org), '[]'::jsonb),
    'consents', coalesce((select jsonb_agg(to_jsonb(u)) from public.user_consents u where u.organization_id = p_org), '[]'::jsonb)
  ) into v_result;

  perform public.log_audit_event(
    p_org,
    'privacy.data_exported',
    'organization',
    p_org,
    p_correlation_id,
    '{}'::jsonb
  );
  return v_result;
end;
$$;

-- Exclui definitivamente a organização e todos os seus dados em cascata (LGPD exclusão; apenas owner).
create function public.delete_organization(
  p_org uuid,
  p_confirmation_name text,
  p_correlation_id text default null
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
begin
  if (select auth.uid()) is null or not private.has_org_role(p_org, array['owner']::public.member_role[]) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select o.name into v_name from public.organizations o where o.id = p_org;
  if v_name is null or trim(p_confirmation_name) <> v_name then
    raise exception 'confirmation_mismatch' using errcode = 'P0001';
  end if;

  delete from public.organizations where id = p_org;
end;
$$;

revoke all on function public.create_organization_invite(uuid, text, public.member_role, text, text) from public, anon;
revoke all on function public.revoke_organization_invite(uuid, text) from public, anon;
revoke all on function public.inspect_organization_invite(text) from public, anon;
revoke all on function public.accept_organization_invite(text, text) from public, anon;
revoke all on function public.register_business_logo(uuid, uuid, text, text, integer, text) from public, anon;
revoke all on function public.record_user_consents(uuid, text, public.consent_kind[], text) from public, anon;
revoke all on function public.export_organization_data(uuid, text) from public, anon;
revoke all on function public.delete_organization(uuid, text, text) from public, anon;

grant execute on function public.create_organization_invite(uuid, text, public.member_role, text, text) to authenticated;
grant execute on function public.revoke_organization_invite(uuid, text) to authenticated;
grant execute on function public.inspect_organization_invite(text) to authenticated;
grant execute on function public.accept_organization_invite(text, text) to authenticated;
grant execute on function public.register_business_logo(uuid, uuid, text, text, integer, text) to authenticated;
grant execute on function public.record_user_consents(uuid, text, public.consent_kind[], text) to authenticated;
grant execute on function public.export_organization_data(uuid, text) to authenticated;
grant execute on function public.delete_organization(uuid, text, text) to authenticated;
