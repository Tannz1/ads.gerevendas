import type { AngleKey } from "@/contracts/creatives";

export const IMAGE_PROMPT_VERSION = "image.v1";

export type ImageFacts = { segment: string; offer_name: string; city: string };

const SCENE: Record<AngleKey, string> = {
  oferta: "o produto ou serviço em destaque, bem iluminado, em primeiro plano",
  problema: "um momento do dia a dia em que alguém precisaria deste produto ou serviço",
  beneficio: "um detalhe que mostre qualidade e cuidado no produto ou serviço",
  demonstracao: "o ambiente de trabalho do negócio, organizado e acolhedor",
  conveniencia: "uma cena de bairro brasileiro, próxima e acessível, ligada ao negócio",
};

const clip = (s: string, max: number) => s.replace(/\s+/g, " ").trim().slice(0, max);

/**
 * Prompt da imagem-base. Determinístico (sem LLM) e só com fatos do cadastro. A imagem é fundo:
 * texto, preço e marca são sempre camadas editáveis por cima, nunca parte da imagem.
 */
export function buildImagePrompt(facts: ImageFacts, angle: AngleKey): string {
  return [
    `Fotografia realista para anúncio de um negócio local de ${clip(facts.segment, 80)} em ${clip(facts.city, 80)}, Brasil.`,
    `Tema: ${clip(facts.offer_name, 120)}. Cena: ${SCENE[angle]}.`,
    "Composição vertical com área mais limpa e menos detalhada na metade inferior, para receber texto depois.",
    "A imagem deve ter sem nenhum texto: nada de letras, palavras, números, preços, placas legíveis, logotipo, marca ou marca d'água.",
    "Sem rostos em close, sem pessoas famosas, sem comparação de antes e depois, sem exageros que prometam resultado.",
    "Luz natural, cores vivas mas realistas.",
  ].join(" ");
}
