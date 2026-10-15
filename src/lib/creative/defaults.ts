import type { CreativeDesign } from "@/contracts/creative";
import type { Concept, CreativeFormat } from "@/contracts/strategy";

export const FALLBACK_BRAND_COLOR = "#2A45E8";

/** Fatos da oferta/negócio necessários para montar uma peça. */
export type DesignFacts = {
  business_name: string;
  brand_color: string | null;
  /** null quando o preço não foi confirmado pelo cliente. */
  price_cents: number | null;
  currency: string;
};

/**
 * Peça inicial a partir de um conceito. O preço só entra se o conceito pediu E a oferta tem
 * preço confirmado; o valor vem sempre da oferta, nunca do texto gerado.
 */
export function designFromConcept(concept: Concept, facts: DesignFacts, format: CreativeFormat): CreativeDesign {
  const showPrice = concept.show_price && facts.price_cents !== null;
  return {
    format,
    template_key: concept.template_key,
    business_name: facts.business_name.slice(0, 60),
    headline: concept.headline,
    body: concept.body,
    cta: concept.cta,
    show_price: showPrice,
    price_cents: showPrice ? facts.price_cents : null,
    currency: facts.currency,
    brand_color:
      facts.brand_color && /^#[0-9A-Fa-f]{6}$/.test(facts.brand_color) ? facts.brand_color : FALLBACK_BRAND_COLOR,
    background: "gradiente",
  };
}
