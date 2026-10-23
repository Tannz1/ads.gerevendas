import { ANGLE_KEYS, type AngleKey, type CreativeContent, type StrategyPlan } from "@/contracts/creatives";

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

/**
 * Layout de cada peça: o que a estratégia escolheu, sem repetir. Escolha repetida fica com um
 * layout ainda livre, para as 5 peças nunca saírem com a mesma composição.
 */
function distinctLayouts(plan: StrategyPlan): AngleKey[] {
  const used = new Set<AngleKey>();
  const picked = plan.angles.map((a) => {
    if (used.has(a.layout)) return null;
    used.add(a.layout);
    return a.layout;
  });
  const free = ANGLE_KEYS.filter((k) => !used.has(k));
  return picked.map((l) => l ?? free.shift()!);
}

/** Conteúdo inicial das 5 peças a partir do plano: cor da marca só no botão e nos destaques, fundo neutro. */
export function initialContents(
  plan: StrategyPlan,
  brandColor: string | null,
  priceCents: number | null,
): Array<{ angle_key: AngleKey; content: CreativeContent }> {
  const accent = brandColor ?? "#2A45E8";
  const background = "#0F172A";
  const text = "#FFFFFF";
  const layouts = distinctLayouts(plan);
  return plan.angles.map((a, i) => ({
    angle_key: a.key,
    content: {
      template: layouts[i],
      headline: a.headline,
      body: a.body,
      cta: a.cta,
      // Selo de preço só na oferta e só se a IA não citou o valor no texto (evita preço duplicado).
      show_price: a.key === "oferta" && priceCents !== null && !/R\$/.test(`${a.headline} ${a.body}`),
      colors: { background, accent, text },
    },
  }));
}
