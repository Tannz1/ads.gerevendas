import type { AngleKey } from "@/contracts/creatives";

export const IMAGE_PROMPT_VERSION = "image.v2";

export type ImageFacts = {
  segment: string;
  offer_name: string;
  city: string;
  /** Descrição da oferta e texto da peça: dão o contexto da cena. */
  offer_description?: string | null;
  headline?: string;
  body?: string;
};

const SCENE: Record<AngleKey, string> = {
  oferta:
    "composição de estúdio publicitário com o produto ou serviço em foco absoluto, iluminação dramática limpa e atmosfera comercial premium",
  problema:
    "cena autêntica do cotidiano ilustrando a necessidade ou dor do cliente de forma expressiva, humana e com apelo emocional",
  beneficio:
    "destaque visual do resultado transformador do serviço, transmitindo sensação de alívio, bem-estar, beleza, confiança e satisfação",
  demonstracao:
    "o especialista em ação em seu espaço de trabalho impecável, com instrumentos e ferramentas em foco, transmitindo extrema competência e cuidado",
  conveniencia:
    "cena ágil e dinâmica retratando facilidade, conveniência, atendimento rápido ou entrega próxima com sensação de proximidade e confiança",
};

const clip = (s: string, max: number) => s.replace(/\s+/g, " ").trim().slice(0, max);
// Preços e números do cliente não entram no prompt: a imagem nunca mostra valores.
const noNumbers = (s: string) => s.replace(/R\$\s*[\d.,]+/gi, " ").replace(/\d+(?:[.,]\d+)?\s*%?/g, " ");

/**
 * Prompt da imagem-base enriquecido com padrões visuais de anúncios de alta conversão (Instagram/Facebook Ads Brasil).
 * Gera fotos com estética de anúncio profissional, luz comercial e espaço negativo equilibrado.
 */
export function buildImagePrompt(facts: ImageFacts, angle: AngleKey): string {
  const offerName = clip(noNumbers(facts.offer_name), 120);
  const offerDescription = facts.offer_description ? clip(noNumbers(facts.offer_description), 200) : "";
  const message = clip(noNumbers([facts.headline, facts.body].filter(Boolean).join(". ")), 220);
  return [
    `Fotografia publicitária profissional de alto padrão para anúncio de um negócio local de ${clip(facts.segment, 80)} em ${clip(facts.city, 80)}, Brasil.`,
    `O que o negócio oferece: ${offerDescription ? `${offerName}: ${offerDescription}` : offerName}.`,
    message && `A foto deve ilustrar a ideia desta peça, sem escrever nenhuma palavra dela: "${message}".`,
    `Cena: ${SCENE[angle]}.`,
    "Estética visual moderna, cinematográfica ou de estúdio comercial com profundidade de campo sutil, iluminação limpa e cores vibrantes e atraentes que chamam atenção no feed.",
    "Composição vertical com área mais limpa e menos detalhada na metade inferior, para receber texto depois.",
    "A imagem não deve ter texto: sem nenhum texto, letras, palavras, números, preços, placas legíveis, logotipo, marca ou marca d'água.",
    "Sem rostos em close, sem pessoas famosas, sem comparação de antes e depois, sem exageros que prometam resultado.",
    "Luz natural, cores vivas mas realistas.",
  ]
    .filter(Boolean)
    .join(" ");
}
