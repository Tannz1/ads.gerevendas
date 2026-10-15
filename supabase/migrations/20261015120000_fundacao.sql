-- GereVendas Ads — fundação multi-tenant (fase 1: sem CRM e sem Meta).
-- Toda entidade de negócio carrega organization_id e é protegida por RLS.
-- Funções auxiliares ficam no schema `private`, que não é exposto pela API REST.

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

-- ---------------------------------------------------------------------------
-- Tipos
-- ---------------------------------------------------------------------------
create type public.member_role as enum ('owner', 'admin', 'member');

create type public.brief_objective as enum (
  'mensagens_whatsapp',
  'visitas_perfil',
  'trafego_site',
  'reconhecimento_local'
);

create type public.brief_status as enum ('draft', 'submitted', 'archived');

-- ---------------------------------------------------------------------------
-- Utilitários
-- ---------------------------------------------------------------------------
create function private.set_updated_at() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Organizações e membros
-- ---------------------------------------------------------------------------
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 120),
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organization_members (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.member_role not null default 'member',
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create index organization_members_user_id_idx on public.organization_members (user_id);

-- SECURITY DEFINER evita recursão de RLS ao consultar organization_members
-- dentro das próprias políticas.
create function private.is_org_member(p_org uuid) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_members m
    where m.organization_id = p_org
      and m.user_id = (select auth.uid())
  );
$$;

create function private.has_org_role(p_org uuid, p_roles public.member_role[]) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_members m
    where m.organization_id = p_org
      and m.user_id = (select auth.uid())
      and m.role = any (p_roles)
  );
$$;

revoke all on function private.is_org_member(uuid) from public;
revoke all on function private.has_org_role(uuid, public.member_role[]) from public;
grant execute on function private.is_org_member(uuid) to authenticated;
grant execute on function private.has_org_role(uuid, public.member_role[]) to authenticated;

-- ---------------------------------------------------------------------------
-- Negócio, oferta e brief
-- ---------------------------------------------------------------------------
create table public.businesses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (char_length(name) between 2 and 120),
  segment text not null check (char_length(segment) between 2 and 80),
  city text not null check (char_length(city) between 2 and 80),
  state char(2) not null check (state ~ '^[A-Z]{2}$'),
  instagram_handle text check (instagram_handle ~ '^[A-Za-z0-9._]{1,30}$'),
  whatsapp_e164 text check (whatsapp_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  website_url text check (website_url ~ '^https://' and char_length(website_url) <= 300),
  brand_primary_color text check (brand_primary_color ~ '^#[0-9A-Fa-f]{6}$'),
  tone_of_voice text check (char_length(tone_of_voice) <= 40),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id)
);

create index businesses_organization_id_idx on public.businesses (organization_id);

create table public.offers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  business_id uuid not null,
  name text not null check (char_length(name) between 2 and 120),
  description text not null check (char_length(description) between 10 and 600),
  -- Dinheiro sempre em centavos + moeda ISO. Preço só existe se o cliente confirmou.
  price_cents integer check (price_cents >= 0),
  currency char(3) not null default 'BRL' check (currency ~ '^[A-Z]{3}$'),
  price_confirmed_by_client boolean not null default false,
  differentiators text[] not null default '{}' check (cardinality(differentiators) <= 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  foreign key (business_id, organization_id)
    references public.businesses (id, organization_id) on delete cascade,
  check (price_cents is null or price_confirmed_by_client)
);

create index offers_organization_id_idx on public.offers (organization_id);

create table public.briefs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  business_id uuid not null,
  offer_id uuid not null,
  objective public.brief_objective not null,
  audience_description text not null check (char_length(audience_description) between 10 and 600),
  age_min smallint not null check (age_min between 18 and 65),
  age_max smallint not null check (age_max between 18 and 65),
  service_radius_km smallint check (service_radius_km between 1 and 200),
  status public.brief_status not null default 'draft',
  -- Momento em que o cliente declarou que as informações são verdadeiras.
  facts_confirmed_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (age_min <= age_max),
  check (status = 'draft' or facts_confirmed_at is not null),
  foreign key (business_id, organization_id)
    references public.businesses (id, organization_id) on delete cascade,
  foreign key (offer_id, organization_id)
    references public.offers (id, organization_id) on delete cascade
);

create index briefs_organization_id_idx on public.briefs (organization_id);

-- Rascunho do onboarding (autosave). Um por organização.
create table public.onboarding_drafts (
  organization_id uuid primary key references public.organizations (id) on delete cascade,
  step smallint not null default 1 check (step between 1 and 6),
  data jsonb not null default '{}'::jsonb
    check (jsonb_typeof(data) = 'object' and pg_column_size(data) < 65536),
  completed_brief_id uuid references public.briefs (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Auditoria (somente inserção via função; leitura por owner/admin)
-- ---------------------------------------------------------------------------
create table public.audit_events (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  actor_user_id uuid references auth.users (id) on delete set null,
  action text not null check (action ~ '^[a-z_]+\.[a-z_]+$'),
  entity_type text not null check (char_length(entity_type) <= 40),
  entity_id uuid,
  correlation_id text check (char_length(correlation_id) <= 64),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now()
);

create index audit_events_org_created_idx on public.audit_events (organization_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------
create trigger organizations_updated_at before update on public.organizations
  for each row execute function private.set_updated_at();
create trigger businesses_updated_at before update on public.businesses
  for each row execute function private.set_updated_at();
create trigger offers_updated_at before update on public.offers
  for each row execute function private.set_updated_at();
create trigger briefs_updated_at before update on public.briefs
  for each row execute function private.set_updated_at();
create trigger onboarding_drafts_updated_at before update on public.onboarding_drafts
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------
-- Grants: anon não acessa nada; authenticated passa sempre por RLS.
-- ---------------------------------------------------------------------------
revoke all on public.organizations, public.organization_members, public.businesses,
  public.offers, public.briefs, public.onboarding_drafts, public.audit_events
  from anon, public;

grant select, update on public.organizations to authenticated;
grant select on public.organization_members to authenticated;
grant select, insert, update, delete on public.businesses, public.offers, public.briefs,
  public.onboarding_drafts to authenticated;
grant select on public.audit_events to authenticated;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.businesses enable row level security;
alter table public.offers enable row level security;
alter table public.briefs enable row level security;
alter table public.onboarding_drafts enable row level security;
alter table public.audit_events enable row level security;

create policy organizations_select on public.organizations
  for select to authenticated
  using (private.is_org_member(id));

create policy organizations_update on public.organizations
  for update to authenticated
  using (private.has_org_role(id, array['owner', 'admin']::public.member_role[]))
  with check (private.has_org_role(id, array['owner', 'admin']::public.member_role[]));

create policy organization_members_select on public.organization_members
  for select to authenticated
  using (private.is_org_member(organization_id));

-- Tabelas de negócio: membros leem e escrevem; só owner/admin apagam.
create policy businesses_select on public.businesses
  for select to authenticated using (private.is_org_member(organization_id));
create policy businesses_insert on public.businesses
  for insert to authenticated with check (private.is_org_member(organization_id));
create policy businesses_update on public.businesses
  for update to authenticated
  using (private.is_org_member(organization_id))
  with check (private.is_org_member(organization_id));
create policy businesses_delete on public.businesses
  for delete to authenticated
  using (private.has_org_role(organization_id, array['owner', 'admin']::public.member_role[]));

create policy offers_select on public.offers
  for select to authenticated using (private.is_org_member(organization_id));
create policy offers_insert on public.offers
  for insert to authenticated with check (private.is_org_member(organization_id));
create policy offers_update on public.offers
  for update to authenticated
  using (private.is_org_member(organization_id))
  with check (private.is_org_member(organization_id));
create policy offers_delete on public.offers
  for delete to authenticated
  using (private.has_org_role(organization_id, array['owner', 'admin']::public.member_role[]));

create policy briefs_select on public.briefs
  for select to authenticated using (private.is_org_member(organization_id));
create policy briefs_insert on public.briefs
  for insert to authenticated with check (private.is_org_member(organization_id));
create policy briefs_update on public.briefs
  for update to authenticated
  using (private.is_org_member(organization_id))
  with check (private.is_org_member(organization_id));
create policy briefs_delete on public.briefs
  for delete to authenticated
  using (private.has_org_role(organization_id, array['owner', 'admin']::public.member_role[]));

create policy onboarding_drafts_select on public.onboarding_drafts
  for select to authenticated using (private.is_org_member(organization_id));
create policy onboarding_drafts_insert on public.onboarding_drafts
  for insert to authenticated with check (private.is_org_member(organization_id));
create policy onboarding_drafts_update on public.onboarding_drafts
  for update to authenticated
  using (private.is_org_member(organization_id))
  with check (private.is_org_member(organization_id));
create policy onboarding_drafts_delete on public.onboarding_drafts
  for delete to authenticated using (private.is_org_member(organization_id));

create policy audit_events_select on public.audit_events
  for select to authenticated
  using (private.has_org_role(organization_id, array['owner', 'admin']::public.member_role[]));

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------

-- Registra evento de auditoria. O ator é sempre o usuário autenticado.
create function public.log_audit_event(
  p_org uuid,
  p_action text,
  p_entity_type text,
  p_entity_id uuid default null,
  p_correlation_id text default null,
  p_metadata jsonb default '{}'::jsonb
) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or not private.is_org_member(p_org) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  insert into public.audit_events (organization_id, actor_user_id, action, entity_type, entity_id, correlation_id, metadata)
  values (p_org, (select auth.uid()), p_action, p_entity_type, p_entity_id, p_correlation_id, coalesce(p_metadata, '{}'::jsonb));
end;
$$;

-- Cria organização com o usuário atual como owner e um rascunho de onboarding vazio.
create function public.create_organization(p_name text, p_correlation_id text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_org uuid;
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  if (select count(*) from public.organization_members m where m.user_id = v_user and m.role = 'owner') >= 5 then
    raise exception 'organization_limit_reached' using errcode = 'P0001';
  end if;

  insert into public.organizations (name, created_by)
  values (btrim(p_name), v_user)
  returning id into v_org;

  insert into public.organization_members (organization_id, user_id, role)
  values (v_org, v_user, 'owner');

  insert into public.onboarding_drafts (organization_id, updated_by)
  values (v_org, v_user);

  insert into public.audit_events (organization_id, actor_user_id, action, entity_type, entity_id, correlation_id)
  values (v_org, v_user, 'organization.created', 'organization', v_org, p_correlation_id);

  return v_org;
end;
$$;

-- Conclui o onboarding em uma transação: cria negócio, oferta e brief (submitted).
-- SECURITY INVOKER: todas as escritas passam por RLS. Idempotente por organização.
create function public.complete_onboarding(
  p_org uuid,
  p_payload jsonb,
  p_correlation_id text default null
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_existing uuid;
  v_business uuid;
  v_offer uuid;
  v_brief uuid;
  v_b jsonb := p_payload -> 'business';
  v_o jsonb := p_payload -> 'offer';
  v_a jsonb := p_payload -> 'audience';
  v_g jsonb := p_payload -> 'goal';
  v_i jsonb := p_payload -> 'identity';
begin
  if v_user is null or not private.is_org_member(p_org) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if coalesce((p_payload -> 'review' ->> 'facts_confirmed')::boolean, false) is not true then
    raise exception 'facts_not_confirmed' using errcode = 'P0001';
  end if;

  select d.completed_brief_id into v_existing
  from public.onboarding_drafts d
  where d.organization_id = p_org
  for update;

  if v_existing is not null then
    select b.business_id, b.offer_id into v_business, v_offer
    from public.briefs b where b.id = v_existing;
    return jsonb_build_object('business_id', v_business, 'offer_id', v_offer, 'brief_id', v_existing, 'replayed', true);
  end if;

  insert into public.businesses (
    organization_id, name, segment, city, state, instagram_handle, whatsapp_e164,
    website_url, brand_primary_color, tone_of_voice
  ) values (
    p_org,
    v_b ->> 'name',
    v_b ->> 'segment',
    v_b ->> 'city',
    v_b ->> 'state',
    nullif(v_b ->> 'instagram_handle', ''),
    nullif(v_b ->> 'whatsapp_e164', ''),
    nullif(v_b ->> 'website_url', ''),
    nullif(v_i ->> 'brand_primary_color', ''),
    nullif(v_i ->> 'tone_of_voice', '')
  ) returning id into v_business;

  insert into public.offers (
    organization_id, business_id, name, description, price_cents, currency,
    price_confirmed_by_client, differentiators
  ) values (
    p_org,
    v_business,
    v_o ->> 'name',
    v_o ->> 'description',
    (v_o ->> 'price_cents')::integer,
    coalesce(v_o ->> 'currency', 'BRL'),
    coalesce((v_o ->> 'price_confirmed_by_client')::boolean, false),
    coalesce(array(select jsonb_array_elements_text(coalesce(v_o -> 'differentiators', '[]'::jsonb))), '{}')
  ) returning id into v_offer;

  insert into public.briefs (
    organization_id, business_id, offer_id, objective, audience_description,
    age_min, age_max, service_radius_km, status, facts_confirmed_at, created_by
  ) values (
    p_org,
    v_business,
    v_offer,
    (v_g ->> 'objective')::public.brief_objective,
    v_a ->> 'description',
    (v_a ->> 'age_min')::smallint,
    (v_a ->> 'age_max')::smallint,
    (v_a ->> 'service_radius_km')::smallint,
    'submitted',
    now(),
    v_user
  ) returning id into v_brief;

  insert into public.onboarding_drafts (organization_id, step, data, completed_brief_id, updated_by)
  values (p_org, 6, p_payload, v_brief, v_user)
  on conflict (organization_id) do update
    set step = 6, data = excluded.data, completed_brief_id = v_brief, updated_by = v_user;

  perform public.log_audit_event(p_org, 'onboarding.completed', 'brief', v_brief, p_correlation_id, '{}'::jsonb);

  return jsonb_build_object('business_id', v_business, 'offer_id', v_offer, 'brief_id', v_brief, 'replayed', false);
end;
$$;

revoke all on function public.log_audit_event(uuid, text, text, uuid, text, jsonb) from public, anon;
revoke all on function public.create_organization(text, text) from public, anon;
revoke all on function public.complete_onboarding(uuid, jsonb, text) from public, anon;
grant execute on function public.log_audit_event(uuid, text, text, uuid, text, jsonb) to authenticated;
grant execute on function public.create_organization(text, text) to authenticated;
grant execute on function public.complete_onboarding(uuid, jsonb, text) to authenticated;
