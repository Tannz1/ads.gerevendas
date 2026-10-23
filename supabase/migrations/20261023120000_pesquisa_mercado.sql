-- GereVendas Ads: pesquisa de mercado (spec docs/superpowers/specs/2026-10-23-pesquisa-mercado-design.md).
-- Concorrentes que o próprio cliente informa no onboarding. A IA pesquisa outros na web; o resultado
-- fica no plano da estratégia (strategies.plan.research), sem tabela nova.

alter table public.businesses
  add column competitors text[] not null default '{}'
  check (cardinality(competitors) <= 5);

-- Mesmo corpo da versão da fundação + o campo competitors.
create or replace function public.complete_onboarding(
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
    website_url, brand_primary_color, tone_of_voice, competitors
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
    nullif(v_i ->> 'tone_of_voice', ''),
    coalesce(array(select jsonb_array_elements_text(coalesce(v_b -> 'competitors', '[]'::jsonb))), '{}')
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
