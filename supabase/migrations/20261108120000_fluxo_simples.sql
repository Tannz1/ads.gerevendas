-- GereVendas Ads — fluxo simples "Da foto ao cliente no WhatsApp" (ADR 0010).
-- O dono parte de um produto com foto: a foto vira a imagem das 5 peças, a oferta e os destaques são
-- fatos que ele mesmo digitou e confirmou. Vendas que vieram das conversas são registradas à mão.
-- Migration aditiva: nada do cadastro, das peças ou das campanhas existentes muda.

-- ---------------------------------------------------------------------------
-- 1. Produto = oferta com foto
-- ---------------------------------------------------------------------------
alter table public.offers add column photo_asset_id uuid;
alter table public.offers add constraint offers_photo_asset_fk
  foreign key (photo_asset_id, organization_id) references public.assets (id, organization_id)
  on delete set null (photo_asset_id);

-- Dois toques em "Criar meu anúncio" não criam dois produtos.
alter table public.briefs add column request_key text check (char_length(request_key) between 8 and 64);
create unique index briefs_org_request_key on public.briefs (organization_id, request_key)
  where request_key is not null;

-- Foto do produto enviada ao Storage antes de existir peça. O cliente declarou ter direito de uso.
create function public.register_product_photo(
  p_org uuid,
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
begin
  if (select auth.uid()) is null or not private.is_org_member(p_org) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_storage_path !~ ('^' || p_org || '/' || p_asset || '\.(jpg|png)$') then
    raise exception 'invalid_path' using errcode = 'P0001';
  end if;

  insert into public.assets (id, organization_id, kind, storage_path, mime, bytes, rights_confirmed_at, created_by)
  values (p_asset, p_org, 'photo', p_storage_path, p_mime, p_bytes, now(), (select auth.uid()));

  perform public.log_audit_event(p_org, 'product.photo_added', 'asset', p_asset, p_correlation_id,
    jsonb_build_object('rights_confirmed', true));
  return p_asset;
end;
$$;

-- Cria oferta + brief do produto numa transação. Negócio, público e idades vêm do cadastro concluído;
-- o objetivo é sempre conversa no WhatsApp. SECURITY INVOKER: as escritas passam por RLS.
create function public.create_product_brief(
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
  v_key text := p_payload ->> 'request_key';
  v_base public.briefs%rowtype;
  v_whatsapp text;
  v_photo uuid := nullif(p_payload ->> 'photo_asset_id', '')::uuid;
  v_price integer := (p_payload ->> 'price_cents')::integer;
  v_offer uuid;
  v_brief uuid;
begin
  if v_user is null or not private.is_org_member(p_org) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if coalesce((p_payload ->> 'facts_confirmed')::boolean, false) is not true then
    raise exception 'facts_not_confirmed' using errcode = 'P0001';
  end if;

  if v_key is not null then
    select b.id, b.offer_id into v_brief, v_offer
      from public.briefs b where b.organization_id = p_org and b.request_key = v_key;
    if v_brief is not null then
      return jsonb_build_object('offer_id', v_offer, 'brief_id', v_brief, 'replayed', true);
    end if;
  end if;

  select b.* into v_base
    from public.onboarding_drafts d join public.briefs b on b.id = d.completed_brief_id
   where d.organization_id = p_org;
  if v_base.id is null then
    raise exception 'onboarding_required' using errcode = 'P0001';
  end if;

  select x.whatsapp_e164 into v_whatsapp from public.businesses x where x.id = v_base.business_id;
  if v_whatsapp is null then
    raise exception 'missing_whatsapp' using errcode = 'P0001';
  end if;

  if v_photo is not null and not exists (
    select 1 from public.assets a where a.id = v_photo and a.organization_id = p_org and a.kind = 'photo'
  ) then
    raise exception 'invalid_photo' using errcode = 'P0001';
  end if;

  insert into public.offers (
    organization_id, business_id, name, description, price_cents, currency,
    price_confirmed_by_client, differentiators, photo_asset_id
  ) values (
    p_org,
    v_base.business_id,
    p_payload ->> 'name',
    p_payload ->> 'description',
    v_price,
    'BRL',
    v_price is not null,
    coalesce(array(select jsonb_array_elements_text(coalesce(p_payload -> 'differentiators', '[]'::jsonb))), '{}'),
    v_photo
  ) returning id into v_offer;

  insert into public.briefs (
    organization_id, business_id, offer_id, objective, audience_description,
    age_min, age_max, service_radius_km, status, facts_confirmed_at, created_by, request_key
  ) values (
    p_org, v_base.business_id, v_offer, 'mensagens_whatsapp', v_base.audience_description,
    v_base.age_min, v_base.age_max, v_base.service_radius_km, 'submitted', now(), v_user, v_key
  ) returning id into v_brief;

  perform public.log_audit_event(p_org, 'product.created', 'brief', v_brief, p_correlation_id,
    jsonb_build_object('has_photo', v_photo is not null, 'has_price', v_price is not null));
  return jsonb_build_object('offer_id', v_offer, 'brief_id', v_brief, 'replayed', false);
end;
$$;

revoke all on function public.register_product_photo(uuid, uuid, text, text, integer, text) from public, anon;
revoke all on function public.create_product_brief(uuid, jsonb, text) from public, anon;
grant execute on function public.register_product_photo(uuid, uuid, text, text, integer, text) to authenticated;
grant execute on function public.create_product_brief(uuid, jsonb, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Vendas registradas pelo dono ("Alguma conversa virou venda?")
-- ---------------------------------------------------------------------------
-- É o que o dono declara, não dado da Meta: a tela sempre diz "registradas por você".
create table public.sales_records (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  campaign_id uuid not null,
  quantity integer not null check (quantity between 1 and 1000),
  amount_cents integer check (amount_cents between 0 and 100000000),
  currency char(3) not null default 'BRL' check (currency ~ '^[A-Z]{3}$'),
  sold_on date not null default current_date,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (campaign_id, organization_id) references public.campaigns (id, organization_id) on delete cascade
);

create index sales_records_campaign_idx on public.sales_records (campaign_id, sold_on desc);
create index sales_records_org_idx on public.sales_records (organization_id);

revoke all on public.sales_records from anon, authenticated, public;
grant select on public.sales_records to authenticated;

alter table public.sales_records enable row level security;
create policy sales_records_select on public.sales_records
  for select to authenticated using (private.is_org_member(organization_id));

create function public.record_sale(
  p_campaign uuid,
  p_quantity integer,
  p_amount_cents integer default null,
  p_sold_on date default null,
  p_correlation_id text default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_sale uuid;
begin
  select c.organization_id into v_org from public.campaigns c where c.id = p_campaign;
  if (select auth.uid()) is null or v_org is null or not private.is_org_member(v_org) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_sold_on is not null and (p_sold_on > current_date or p_sold_on < current_date - 366) then
    raise exception 'invalid_date' using errcode = '22023';
  end if;

  insert into public.sales_records (organization_id, campaign_id, quantity, amount_cents, sold_on, created_by)
  values (v_org, p_campaign, p_quantity, p_amount_cents, coalesce(p_sold_on, current_date), (select auth.uid()))
  returning id into v_sale;

  perform public.log_audit_event(v_org, 'sales.recorded', 'sales_record', v_sale, p_correlation_id,
    jsonb_build_object('quantity', p_quantity, 'amount_cents', p_amount_cents));
  return v_sale;
end;
$$;

-- Desfazer um registro errado: quem registrou, ou owner/admin.
create function public.delete_sale(p_sale uuid, p_correlation_id text default null) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.sales_records%rowtype;
begin
  select * into v_row from public.sales_records s where s.id = p_sale;
  if (select auth.uid()) is null or v_row.id is null or not (
    (v_row.created_by = (select auth.uid()) and private.is_org_member(v_row.organization_id))
    or private.has_org_role(v_row.organization_id, array['owner', 'admin']::public.member_role[])
  ) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  delete from public.sales_records where id = p_sale;
  perform public.log_audit_event(v_row.organization_id, 'sales.deleted', 'sales_record', p_sale, p_correlation_id,
    jsonb_build_object('quantity', v_row.quantity, 'amount_cents', v_row.amount_cents));
end;
$$;

-- Exportação LGPD passa a levar as vendas registradas (mesma assinatura e permissões).
create or replace function public.export_organization_data(
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
    'consents', coalesce((select jsonb_agg(to_jsonb(u)) from public.user_consents u where u.organization_id = p_org), '[]'::jsonb),
    'sales_records', coalesce((select jsonb_agg(to_jsonb(v)) from public.sales_records v where v.organization_id = p_org), '[]'::jsonb)
  ) into v_result;

  perform public.log_audit_event(p_org, 'privacy.data_exported', 'organization', p_org, p_correlation_id, '{}'::jsonb);
  return v_result;
end;
$$;

revoke all on function public.record_sale(uuid, integer, integer, date, text) from public, anon;
revoke all on function public.delete_sale(uuid, text) from public, anon;
grant execute on function public.record_sale(uuid, integer, integer, date, text) to authenticated;
grant execute on function public.delete_sale(uuid, text) to authenticated;
