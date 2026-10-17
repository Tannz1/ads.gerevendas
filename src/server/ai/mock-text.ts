import { LIMITS, type StrategyPlan } from "@/contracts/creatives";
import { formatCents } from "@/lib/money";
import type { StrategyInput, TextProvider } from "./types";

/** Corta em limite de palavra, sem reticências. */
function clip(s: string, max: number): string {
  const t = s.trim().replace(/\s+/g, " ");
  if (t.length <= max) return t;
  const cut = t.slice(0, max + 1);
  const i = cut.lastIndexOf(" ");
  return (i > max * 0.5 ? cut.slice(0, i) : t.slice(0, max)).trim();
}

const CTA: Record<StrategyInput["objective"], string> = {
  mensagens_whatsapp: "Chamar no WhatsApp",
  visitas_perfil: "Ver no Instagram",
  trafego_site: "Visitar o site",
  reconhecimento_local: "Saiba mais",
};

/**
 * Estratégia simulada (sem custo, determinística) montada só com os dados do cliente.
 * Usada sem chave de IA ou com kill switch; o resultado é sempre rotulado "Simulação".
 */
export function mockStrategy(input: StrategyInput): StrategyPlan {
  const { business: b, offer: o, audience: a } = input;
  const cta = CTA[input.objective];
  const price = o.price_cents === null ? null : formatCents(o.price_cents);
  const diff = o.differentiators[0] ?? o.description;
  const place = `${b.city}/${b.state}`;
  const h = (s: string) => clip(s, LIMITS.headline);
  const body = (s: string) => clip(s, LIMITS.body);

  return {
    business_summary: clip(`${b.name}: ${b.segment.toLowerCase()} em ${place}. Oferta principal: ${o.name}.`, 400),
    angles: [
      {
        key: "oferta",
        label: "Oferta",
        rationale: "Mostra direto o que você vende, para quem já está procurando.",
        headline: h(o.name),
        body: body(price ? `${o.description} Por ${price}.` : o.description),
        cta,
      },
      {
        key: "problema",
        label: "Rotina do cliente",
        rationale: "Fala com a necessidade de quem compra antes de apresentar a solução.",
        headline: h(`Pensando em ${o.name.toLowerCase()}?`),
        body: body(`Para ${a.description.charAt(0).toLowerCase()}${a.description.slice(1)}`),
        cta,
      },
      {
        key: "beneficio",
        label: "Benefício",
        rationale: "Destaca o diferencial que você mesmo informou.",
        headline: h(diff),
        body: body(o.description),
        cta,
      },
      {
        key: "demonstracao",
        label: "Demonstração",
        rationale: "Apresenta o negócio e o que ele faz, para gerar confiança.",
        headline: h(`Conheça ${b.name}`),
        body: body(`${b.segment} em ${place}. ${o.name}.`),
        cta,
      },
      {
        key: "conveniencia",
        label: "Conveniência",
        rationale: "Reforça que é perto e fácil de falar com você.",
        headline: h(`Perto de você em ${b.city}`),
        body: body(`${o.name}. ${cta} e tire suas dúvidas.`),
        cta,
      },
    ],
    targeting_proposal: {
      locations: [a.service_radius_km ? `${place}, raio de ${a.service_radius_km} km` : place],
      age_range: `${a.age_min} a ${a.age_max} anos`,
    },
    assumptions: ["Textos montados a partir do seu cadastro, sem uso de IA (simulação)."],
    fields_requiring_confirmation: price
      ? []
      : ["Preço: não informado no cadastro, por isso as peças não mostram valor."],
  };
}

export const mockText: TextProvider = {
  name: "mock",
  model: "simulacao",
  async generateStrategy(input) {
    return { data: mockStrategy(input), usage: { input_tokens: 0, output_tokens: 0 } };
  },
};
