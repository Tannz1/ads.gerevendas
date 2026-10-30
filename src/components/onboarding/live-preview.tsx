"use client";

import { AdPreview } from "@/components/creatives/ad-preview";
import { LIMITS } from "@/contracts/creatives";
import type { Objective } from "@/contracts/onboarding";
import { formatCents, parseBRLToCents } from "@/lib/money";
import type { FormState } from "./form-state";

const CTA: Record<Objective, string> = {
  mensagens_whatsapp: "Chamar no WhatsApp",
  visitas_perfil: "Ver no Instagram",
  trafego_site: "Ver no site",
  reconhecimento_local: "Saiba mais",
};

const cut = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);

/** Rascunho da peça montado com o que o dono já digitou. A versão final é escrita pela IA. */
export function LivePreview({ form, width = 280 }: { form: FormState; width?: number }) {
  const { business, offer, goal, identity } = form;
  const price = offer.show_price ? parseBRLToCents(offer.price) : null;
  const brand = /^#[0-9A-Fa-f]{6}$/.test(identity.brand_primary_color) ? identity.brand_primary_color : "#2A45E8";
  const headline = cut(offer.name.trim() || business.name.trim() || "Seu produto aqui", LIMITS.headline);
  const body = cut(
    offer.description.trim() || offer.differentiators.find((d) => d.trim())?.trim() || "Conte o que você vende",
    LIMITS.body,
  );

  return (
    <figure className="flex flex-col items-center gap-3">
      <AdPreview
        width={width}
        label={`Prévia do anúncio: ${headline}`}
        format="feed"
        businessName={business.name.trim() || "Seu negócio"}
        priceLabel={price === null ? null : formatCents(price)}
        content={{
          template: "oferta",
          headline,
          body,
          cta: CTA[goal.objective as Objective] ?? "Saiba mais",
          show_price: price !== null,
          colors: { background: "#0F172A", accent: brand.toUpperCase(), text: "#FFFFFF" },
        }}
      />
      <figcaption className="max-w-[280px] text-center text-xs text-ink-faint">
        Rascunho com o que você digitou. A IA escreve as 5 versões finais.
      </figcaption>
    </figure>
  );
}
