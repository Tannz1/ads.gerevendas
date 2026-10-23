import type { AngleKey } from "@/contracts/creatives";

export const IMAGE_PROMPT_VERSION = "image.v3";

export type ImageFacts = {
  segment: string;
  offer_name: string;
  city: string;
  /** Descrição da oferta e texto da peça: dão o contexto da cena. */
  offer_description?: string | null;
  headline?: string;
  body?: string;
  /** Briefing da foto escrito pela estratégia (strategy.v3). Sem ele, vale a cena padrão do ângulo. */
  visual_concept?: string;
  /** Composição da peça (`content.template`): define onde a foto precisa de área livre para o texto. */
  layout?: AngleKey;
};

/** Cena padrão por ângulo, para peças de estratégias anteriores ao strategy.v3. */
const SCENE: Record<AngleKey, string> = {
  oferta: "o produto ou serviço em destaque absoluto, foto de estúdio com fundo liso e luz comercial limpa",
  problema: "cena autêntica do dia a dia mostrando a necessidade do cliente, humana e com apelo emocional",
  beneficio: "o resultado do serviço e a sensação de alívio, bem-estar e satisfação de quem usou",
  demonstracao: "o profissional em ação no seu espaço de trabalho, mãos e ferramentas em foco, cuidado e competência",
  conveniencia: "cena que mostra facilidade e proximidade: atendimento rápido, busca ou entrega no bairro",
};

/** Onde o texto entra em cada layout (ver `AdTemplate`): a foto deixa essa área simples. */
const FREE_AREA: Record<AngleKey, string> = {
  oferta:
    "assunto principal no terço superior e no centro; terço inferior simples e escuro, sem detalhes, para receber texto",
  problema:
    "assunto principal nas laterais ou ao fundo, centro da imagem com fundo simples e desfocado, para receber texto",
  beneficio:
    "assunto principal no terço superior e no centro; terço inferior simples e escuro, sem detalhes, para receber texto",
  demonstracao: "assunto principal bem no centro da imagem, com margem em volta (a foto será recortada na horizontal)",
  conveniencia:
    "assunto principal na metade inferior; terço superior simples (parede, céu ou fundo desfocado), para receber texto",
};

const clip = (s: string, max: number) => s.replace(/\s+/g, " ").trim().slice(0, max);
// Preços e números do cliente não entram no prompt: a imagem nunca mostra valores.
const noNumbers = (s: string) => s.replace(/R\$\s*[\d.,]+/gi, " ").replace(/\d+(?:[.,]\d+)?\s*%?/g, " ");

/**
 * Prompt da imagem-base da peça. A direção de arte vem da estratégia (um estilo de foto por peça e
 * outro a cada versão); aqui entram a área livre do layout e as proibições, que valem sempre.
 */
export function buildImagePrompt(facts: ImageFacts, angle: AngleKey): string {
  const offerName = clip(noNumbers(facts.offer_name), 120);
  const offerDescription = facts.offer_description ? clip(noNumbers(facts.offer_description), 200) : "";
  const message = clip(noNumbers([facts.headline, facts.body].filter(Boolean).join(". ")), 220);
  const concept = facts.visual_concept ? clip(noNumbers(facts.visual_concept), 400) : SCENE[angle];
  return [
    `Foto publicitária para anúncio de Instagram e Facebook de um negócio local de ${clip(facts.segment, 80)} em ${clip(facts.city, 80)}, Brasil.`,
    `O que o negócio oferece: ${offerDescription ? `${offerName}: ${offerDescription}` : offerName}.`,
    `Direção de arte: ${concept}.`,
    message && `A foto deve combinar com a mensagem desta peça, sem escrever nenhuma palavra dela: "${message}".`,
    `Composição vertical: ${FREE_AREA[facts.layout ?? angle]}.`,
    "Aparência de foto real feita por fotógrafo profissional para campanha: foco nítido no assunto, luz bem trabalhada, cores naturais e ricas, sem filtro colorido, sem cara de banco de imagem genérico nem de ilustração 3D.",
    "A imagem não deve ter texto: sem nenhum texto, letras, palavras, números, preços, placas legíveis, logotipo, marca ou marca d'água.",
    "Sem rostos em close, sem pessoas famosas, sem comparação de antes e depois, sem exageros que prometam resultado.",
  ]
    .filter(Boolean)
    .join(" ");
}
