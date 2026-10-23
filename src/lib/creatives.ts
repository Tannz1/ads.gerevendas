import type { AngleKey, CreativeContent, StrategyPlan } from "@/contracts/creatives";

const LIGHT = "#FFFFFF";
const DARK = "#111827";

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Razão de contraste WCAG entre duas cores hexadecimais. */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Cor de texto (branco ou quase preto) com mais contraste sobre o fundo. */
export function readableOn(bg: string): string {
  return contrastRatio(bg, LIGHT) >= contrastRatio(bg, DARK) ? LIGHT : DARK;
}

/** Conteúdo inicial das 5 peças a partir do plano: cor da marca como destaque (accent/botões), fundo neutro escuro ou limpo para a foto. */
export function initialContents(
  plan: StrategyPlan,
  brandColor: string | null,
  priceCents: number | null,
): Array<{ angle_key: AngleKey; content: CreativeContent }> {
  const accent = brandColor ?? "#2A45E8";
  const background = "#0F172A";
  const text = "#FFFFFF";
  return plan.angles.map((a) => ({
    angle_key: a.key,
    content: {
      template: a.key,
      headline: a.headline,
      body: a.body,
      cta: a.cta,
      // Selo de preço só na oferta e só se a IA não citou o valor no texto (evita preço duplicado).
      show_price: a.key === "oferta" && priceCents !== null && !/R\$/.test(`${a.headline} ${a.body}`),
      colors: { background, accent, text },
    },
  }));
}
