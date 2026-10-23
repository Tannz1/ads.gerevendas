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
  oferta: "o produto ou serviço em destaque, bem iluminado, em primeiro plano",
  problema: "um momento do dia a dia em que alguém precisaria deste produto ou serviço",
  beneficio: "um detalhe que mostre qualidade e cuidado no produto ou serviço",
  demonstracao: "o ambiente de trabalho do negócio, organizado e acolhedor",
  conveniencia: "uma cena de bairro brasileiro, próxima e acessível, ligada ao negócio",
};

const clip = (s: string, max: number) => s.replace(/\s+/g, " ").trim().slice(0, max);
// Preços e números do cliente não entram no prompt: a imagem nunca mostra valores.
const noNumbers = (s: string) => s.replace(/R\$\s*[\d.,]+/gi, " ").replace(/\d+(?:[.,]\d+)?\s*%?/g, " ");

/**
 * Prompt da imagem-base. Determinístico (sem LLM) e só com fatos do cadastro e o texto da peça.
 * A imagem é fundo: texto, preço e marca são sempre camadas editáveis por cima, nunca parte da imagem.
 */
export function buildImagePrompt(facts: ImageFacts, angle: AngleKey): string {
  const offerName = clip(noNumbers(facts.offer_name), 120);
  const offerDescription = facts.offer_description ? clip(noNumbers(facts.offer_description), 200) : "";
  const message = clip(noNumbers([facts.headline, facts.body].filter(Boolean).join(". ")), 220);
  return [
    `Fotografia realista para anúncio de um negócio local de ${clip(facts.segment, 80)} em ${clip(facts.city, 80)}, Brasil.`,
    `O que o negócio oferece: ${offerDescription ? `${offerName}: ${offerDescription}` : offerName}.`,
    message && `A foto deve ilustrar a ideia desta peça, sem escrever nenhuma palavra dela: "${message}".`,
    `Cena: ${SCENE[angle]}.`,
    "Composição vertical com área mais limpa e menos detalhada na metade inferior, para receber texto depois.",
    "A imagem não deve ter texto: sem nenhum texto, letras, palavras, números, preços, placas legíveis, logotipo, marca ou marca d'água.",
    "Sem rostos em close, sem pessoas famosas, sem comparação de antes e depois, sem exageros que prometam resultado.",
    "Luz natural, cores vivas mas realistas.",
  ]
    .filter(Boolean)
    .join(" ");
}
