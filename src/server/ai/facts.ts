import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Onboarding } from "@/contracts/onboarding";
import { briefFactsSchema, type BriefFacts } from "@/contracts/strategy";

/**
 * Fatos confirmados que a IA pode usar. Sempre montados no servidor: a partir do onboarding
 * validado (modo demonstração) ou do brief gravado (sessão do usuário, sob RLS).
 */

/** Fatos a partir do onboarding já validado por `onboardingSchema`. Função pura. */
export function factsFromOnboarding(o: Onboarding): BriefFacts {
  return briefFactsSchema.parse({
    business_name: o.business.name,
    segment: o.business.segment,
    city: o.business.city,
    state: o.business.state,
    offer_name: o.offer.name,
    offer_description: o.offer.description,
    // Preço só conta como fato quando o cliente confirmou.
    price_cents: o.offer.price_confirmed_by_client ? o.offer.price_cents : null,
    currency: o.offer.currency,
    differentiators: o.offer.differentiators,
    audience_description: o.audience.description,
    age_min: o.audience.age_min,
    age_max: o.audience.age_max,
    service_radius_km: o.audience.service_radius_km,
    objective: o.goal.objective,
    tone_of_voice: o.identity.tone_of_voice,
    brand_primary_color: o.identity.brand_primary_color,
    has_whatsapp: Boolean(o.business.whatsapp_e164),
    has_instagram: Boolean(o.business.instagram_handle),
    has_website: Boolean(o.business.website_url),
  });
}

/** Erro ao montar fatos; a mensagem nunca inclui conteúdo do brief. */
export class BriefFactsError extends Error {
  constructor(
    readonly reason: "not_found" | "query_failed" | "invalid",
    message: string,
  ) {
    super(message);
    this.name = "BriefFactsError";
  }
}

type BriefRow = {
  id: string;
  business_id: string;
  offer_id: string;
  objective: string;
  audience_description: string;
  age_min: number;
  age_max: number;
  service_radius_km: number | null;
};
type OfferRow = {
  name: string;
  description: string;
  price_cents: number | null;
  currency: string;
  price_confirmed_by_client: boolean;
  differentiators: string[] | null;
};
type BusinessRow = {
  name: string;
  segment: string;
  city: string;
  state: string;
  instagram_handle: string | null;
  whatsapp_e164: string | null;
  website_url: string | null;
  brand_primary_color: string | null;
  tone_of_voice: string | null;
};

/** Monta os fatos de um brief gravado. Usa a sessão do usuário (RLS), nunca service role. */
export async function loadBriefFacts(
  supabase: SupabaseClient,
  organizationId: string,
  briefId: string,
): Promise<BriefFacts> {
  const brief = await supabase
    .from("briefs")
    .select("id, business_id, offer_id, objective, audience_description, age_min, age_max, service_radius_km")
    .eq("organization_id", organizationId)
    .eq("id", briefId)
    .maybeSingle<BriefRow>();
  if (brief.error) throw new BriefFactsError("query_failed", `Falha ao ler o brief: ${brief.error.code}`);
  if (!brief.data) throw new BriefFactsError("not_found", "Brief não encontrado.");

  const [offer, business] = await Promise.all([
    supabase
      .from("offers")
      .select("name, description, price_cents, currency, price_confirmed_by_client, differentiators")
      .eq("organization_id", organizationId)
      .eq("id", brief.data.offer_id)
      .maybeSingle<OfferRow>(),
    supabase
      .from("businesses")
      .select(
        "name, segment, city, state, instagram_handle, whatsapp_e164, website_url, brand_primary_color, tone_of_voice",
      )
      .eq("organization_id", organizationId)
      .eq("id", brief.data.business_id)
      .maybeSingle<BusinessRow>(),
  ]);
  if (offer.error || business.error) {
    throw new BriefFactsError(
      "query_failed",
      `Falha ao ler oferta/negócio: ${offer.error?.code ?? business.error?.code}`,
    );
  }
  if (!offer.data || !business.data) throw new BriefFactsError("not_found", "Oferta ou negócio não encontrado.");

  return factsFromRows(brief.data, offer.data, business.data);
}

/** Conversão pura das linhas do banco em fatos (exportada para testes). */
export function factsFromRows(brief: BriefRow, offer: OfferRow, business: BusinessRow): BriefFacts {
  const parsed = briefFactsSchema.safeParse({
    business_name: business.name,
    segment: business.segment,
    city: business.city,
    state: business.state.trim(),
    offer_name: offer.name,
    offer_description: offer.description,
    price_cents: offer.price_confirmed_by_client ? offer.price_cents : null,
    currency: offer.currency.trim(),
    differentiators: offer.differentiators ?? [],
    audience_description: brief.audience_description,
    age_min: brief.age_min,
    age_max: brief.age_max,
    service_radius_km: brief.service_radius_km,
    objective: brief.objective,
    tone_of_voice: business.tone_of_voice,
    brand_primary_color: business.brand_primary_color,
    has_whatsapp: Boolean(business.whatsapp_e164),
    has_instagram: Boolean(business.instagram_handle),
    has_website: Boolean(business.website_url),
  });
  if (!parsed.success) throw new BriefFactsError("invalid", "Dados do brief fora do contrato.");
  return parsed.data;
}

export type { BriefRow, OfferRow, BusinessRow };
