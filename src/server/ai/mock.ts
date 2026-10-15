import type { Objective } from "@/contracts/onboarding";
import {
  CONCEPT_ANGLE_LABELS,
  CONCEPT_ANGLES,
  COPY_LIMITS,
  CTA_BY_OBJECTIVE,
  TEMPLATE_KEYS,
  type BriefFacts,
  type Concept,
  type ConceptAngle,
  type GeneratedStrategy,
  type Usage,
} from "@/contracts/strategy";
import { checkGeneratedAgainstFacts, createFactChecker } from "./fact-guard";
import { ProviderError, type AiTextProvider } from "./types";

/**
 * Provider de simulação (AI_PROVIDER=mock e modo demonstração). Determinístico: os mesmos fatos
 * geram sempre a mesma saída. Usa SÓ os fatos do brief e frases neutras sem números, preços,
 * descontos, garantias ou depoimentos; a UI rotula o resultado como "Simulação".
 */

const ZERO_USAGE: Usage = { input_tokens: 0, output_tokens: 0, cost_micro_usd: 0 };

const TRAILING_JUNK = /[\s,;:–—\-(/]+$/u;
const DANGLING_WORD =
  /\s+(?:e|ou|de|da|do|das|dos|com|para|pra|a|o|as|os|em|no|na|nos|nas|que|por|sem|um|uma|ao|à|seu|sua)$/iu;

/** Corta no limite sem partir palavras e sem terminar em conectivo ("de", "com"...). */
export function fitWords(text: string, max: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  let out = "";
  for (const word of clean.split(" ")) {
    const next = out ? `${out} ${word}` : word;
    if (next.length > max) break;
    out = next;
  }
  let previous = "";
  while (previous !== out) {
    previous = out;
    out = out.replace(TRAILING_JUNK, "").replace(DANGLING_WORD, "");
  }
  return out.trim();
}

/** Primeiro candidato que cabe (sem cortar palavra) com pelo menos `min` caracteres. */
function pick(candidates: Array<string | null | undefined>, max: number, min: number, fallback: string): string {
  for (const candidate of candidates) {
    if (!candidate) continue;
    const fitted = fitWords(candidate, max);
    if (fitted.length >= min) return fitted;
  }
  return fallback;
}

/** Junta frases enquanto couberem; a primeira é cortada por palavra se precisar. */
function sentences(parts: string[], max: number): string {
  let out = "";
  for (const part of parts) {
    const clean = part.replace(/\s+/g, " ").trim();
    if (!clean) continue;
    if (!out) {
      out = fitWords(clean, max);
      continue;
    }
    if (out.length + 1 + clean.length > max) break;
    out = `${out} ${clean}`;
  }
  return out;
}

/** Minúscula inicial, preservando siglas ("SPA facial" continua igual). */
function lowerFirst(text: string): string {
  if (/^\p{Lu}\p{Lu}/u.test(text)) return text;
  return text.charAt(0).toLocaleLowerCase("pt-BR") + text.slice(1);
}

const withPeriod = (text: string) => (/[.!?…]$/.test(text) ? text : `${text}.`);
const withoutPeriod = (text: string) => text.replace(/[.!…]+$/u, "").trim();
const firstSentence = (text: string) => text.trim().split(/(?<=[.!?])\s+/)[0] ?? text;

type ToneBank = {
  adjective: string;
  invite: string;
  routineHeadline: (offer: string) => string;
  localHeadline: (business: string, city: string, state: string) => string;
};

const TONE_BANKS: Record<string, ToneBank> = {
  acolhedor: {
    adjective: "acolhedora",
    invite: "Vai ser um prazer atender você.",
    routineHeadline: (offer) => `Que tal ${lowerFirst(offer)}?`,
    localHeadline: (business, city) => `${business} te espera em ${city}`,
  },
  direto: {
    adjective: "direta",
    invite: "Fale com a gente e veja os detalhes.",
    routineHeadline: (offer) => `Precisa de ${lowerFirst(offer)}?`,
    localHeadline: (business, city) => `${business} em ${city}`,
  },
  premium: {
    adjective: "premium",
    invite: "Conheça os detalhes com calma.",
    routineHeadline: (offer) => `Seu momento: ${lowerFirst(offer)}`,
    localHeadline: (business, city) => `${business}, em ${city}`,
  },
  divertido: {
    adjective: "divertida",
    invite: "Bora? A gente te espera!",
    routineHeadline: (offer) => `Bateu vontade de ${lowerFirst(offer)}?`,
    localHeadline: (business) => `Partiu ${business}?`,
  },
  tecnico: {
    adjective: "técnica",
    invite: "Veja as informações completas antes de decidir.",
    routineHeadline: (offer) => `${offer}: como funciona`,
    localHeadline: (business, city, state) => `${business} | ${city}/${state}`,
  },
};

const NEUTRAL_TONE: ToneBank = {
  adjective: "clara",
  invite: "Fale com a gente para saber mais.",
  routineHeadline: (offer) => `Pensando em ${lowerFirst(offer)}?`,
  localHeadline: (business, city) => `${business} em ${city}`,
};

const OBJECTIVE_COPY: Record<
  Objective,
  { focus: string; closing: (f: BriefFacts) => string; message: (f: BriefFacts) => string; insight: string }
> = {
  mensagens_whatsapp: {
    focus: "receber mensagens no WhatsApp",
    closing: () => "Chame no WhatsApp para tirar suas dúvidas.",
    message: () => "Fale com a gente pelo WhatsApp",
    insight: "Quem chama no WhatsApp espera resposta rápida: deixe alguém pronto para atender.",
  },
  visitas_perfil: {
    focus: "levar pessoas ao Instagram",
    closing: () => "Veja mais no nosso perfil do Instagram.",
    message: () => "Veja mais no nosso Instagram",
    insight: "Quem chega pelo anúncio vai olhar o perfil: mantenha fotos recentes e informações claras.",
  },
  trafego_site: {
    focus: "levar pessoas ao site",
    closing: () => "Veja os detalhes no site.",
    message: () => "Veja os detalhes no site",
    insight: "Quem clica no anúncio espera encontrar a oferta logo na primeira tela do site.",
  },
  reconhecimento_local: {
    focus: "ser lembrado no bairro",
    closing: (f) => `Estamos em ${f.city}/${f.state}.`,
    message: (f) => `Estamos em ${f.city}`,
    insight: "Para ser lembrado no bairro, use imagens reconhecíveis do lugar e da equipe.",
  },
};

function channelNote(f: BriefFacts): string {
  const where = f.service_radius_km !== null ? `num raio de até ${f.service_radius_km} km` : `em ${f.city}`;
  switch (f.objective) {
    case "mensagens_whatsapp":
      return `Feed e Stories do Instagram e do Facebook, para pessoas ${where}, com botão que abre conversa no WhatsApp.`;
    case "visitas_perfil":
      return `Feed e Stories do Instagram, para pessoas ${where}, levando ao perfil e ao direct.`;
    case "trafego_site":
      return `Feed e Stories do Instagram e do Facebook, para pessoas ${where}, com link para o site.`;
    case "reconhecimento_local":
      return `Feed e Stories do Instagram e do Facebook, para pessoas ${where}.`;
  }
}

/** Textos neutros usados se algum trecho montado a partir dos fatos não passar no fact-guard. */
const STATIC_FALLBACK = {
  summary: "Estratégia inicial com base nas informações confirmadas no cadastro. Revise os textos antes de usar.",
  positioning: "Comunicação clara, usando só o que foi confirmado no cadastro.",
  audience_insights: "Público descrito no cadastro do negócio.",
  key_messages: "Conheça nossa oferta",
  channel_note: "Feed e Stories do Instagram e do Facebook.",
  rationale: "Proposta baseada apenas nas informações confirmadas no cadastro.",
  headline: "Conheça nossa oferta",
  body: "",
  primary_text: "Conheça nossa oferta. Fale com a gente para saber mais.",
  visual_direction: "Foto real do produto ou do serviço, com título curto e botão visível.",
} as const;

const SUMMARY_TAIL = "Os textos usam apenas as informações confirmadas no cadastro.";

/** Monta a estratégia de simulação a partir dos fatos. Função pura e determinística. */
export function buildMockStrategy(facts: BriefFacts): GeneratedStrategy {
  const checker = createFactChecker(facts);
  const safe = (text: string | null | undefined) =>
    text && checker.check("mock", text, { adFacing: true }).length === 0 ? text.trim() : null;

  // hasOwn: o tom vem de texto livre no banco ("constructor" não pode virar banco de frases).
  const tone =
    facts.tone_of_voice && Object.hasOwn(TONE_BANKS, facts.tone_of_voice)
      ? TONE_BANKS[facts.tone_of_voice]!
      : NEUTRAL_TONE;
  const objective = OBJECTIVE_COPY[facts.objective];
  const ctas = CTA_BY_OBJECTIVE[facts.objective];

  const business = facts.business_name.trim();
  const offer = facts.offer_name.trim();
  const city = facts.city.trim();
  const description = safe(facts.offer_description);
  const descriptionLead = description ? withoutPeriod(firstSentence(description)) : null;
  const audience = safe(facts.audience_description);
  const differentiators = facts.differentiators.map((d) => d.trim()).filter(Boolean);
  const safeDifferentiators = differentiators.map((d) => safe(d)).filter((d): d is string => Boolean(d));
  const skippedDifferentiators = differentiators.length - safeDifferentiators.length;
  const hasPrice = facts.price_cents !== null;
  const radius = facts.service_radius_km;

  const closing = [tone.invite, objective.closing(facts)];

  function conceptCopy(
    angle: ConceptAngle,
  ): Pick<Concept, "title" | "rationale" | "headline" | "body" | "primary_text" | "visual_direction"> {
    const label = CONCEPT_ANGLE_LABELS[angle];
    const H = COPY_LIMITS.headline;
    const B = COPY_LIMITS.body;
    const P = COPY_LIMITS.primary_text;
    switch (angle) {
      case "oferta_direta":
        return {
          title: pick([`${label}: ${offer}`], 60, 3, label),
          rationale: hasPrice
            ? "Mostra a oferta e o preço confirmado pelo cliente, para quem já está decidindo a compra."
            : "Mostra a oferta de forma clara, sem preço porque ele não foi confirmado.",
          headline: pick([offer, facts.segment], H, 3, STATIC_FALLBACK.headline),
          body: pick([description, descriptionLead, `${facts.segment} em ${city}`], B, 1, ""),
          primary_text: sentences(
            [withPeriod(`${offer} | ${business}, ${city}`), description ? withPeriod(description) : "", ...closing],
            P,
          ),
          visual_direction: hasPrice
            ? "Foto real do produto em destaque, nome da oferta grande, preço confirmado em selo e botão bem visível."
            : "Foto real do produto em destaque, com o nome da oferta grande e o botão bem visível.",
        };
      case "beneficio_principal":
        return {
          title: label,
          rationale: "Destaca o que a oferta entrega, usando as palavras do próprio cliente no cadastro.",
          headline: pick([descriptionLead, `${offer} em ${city}`, offer], H, 3, STATIC_FALLBACK.headline),
          body: pick([`${business}: ${lowerFirst(offer)} em ${city}.`, `${offer} em ${city}.`], B, 1, ""),
          primary_text: sentences(
            [description ? withPeriod(description) : withPeriod(`${offer} em ${city}`), ...closing],
            P,
          ),
          visual_direction: "Close do produto ou do serviço sendo feito, com luz natural e título curto.",
        };
      case "diferencial": {
        const [lead, ...rest] = safeDifferentiators;
        return {
          title: label,
          rationale:
            safeDifferentiators.length > 0
              ? "Usa os diferenciais informados pelo cliente para separar o negócio da concorrência."
              : "Sem diferenciais informados, reforça o nome do negócio e a oferta.",
          headline: pick([lead, `Conheça ${business}`, business], H, 3, STATIC_FALLBACK.headline),
          body: pick([rest.join(" · "), descriptionLead, `${offer} em ${city}`], B, 1, ""),
          primary_text: sentences(
            [
              safeDifferentiators.length > 0
                ? withPeriod(`${business}: ${safeDifferentiators.join("; ")}`)
                : withPeriod(`${business}: ${offer} em ${city}`),
              ...closing,
            ],
            P,
          ),
          visual_direction: "Mostre o diferencial na prática, com foto real e o título sobre a cor da marca.",
        };
      }
      case "rotina_do_cliente":
        return {
          title: label,
          rationale: `Conversa com o dia a dia de quem tem entre ${facts.age_min} e ${facts.age_max} anos, como descrito no cadastro.`,
          headline: pick([tone.routineHeadline(offer), offer], H, 3, STATIC_FALLBACK.headline),
          body: pick(
            [audience ? `Para ${lowerFirst(withoutPeriod(audience))}` : null, `${offer} em ${city}`],
            B,
            1,
            "",
          ),
          primary_text: sentences(
            [
              audience ? withPeriod(`Para ${lowerFirst(withoutPeriod(audience))}`) : "",
              withPeriod(`${offer} | ${business}`),
              ...closing,
            ],
            P,
          ),
          visual_direction: "Cena do dia a dia do público usando o produto ou serviço, com pessoas reais e sem poses.",
        };
      case "convite_local":
        return {
          title: label,
          rationale: "Lembra quem mora ou circula perto que o negócio está ali, reforçando a presença local.",
          headline: pick(
            [tone.localHeadline(business, city, facts.state), `${business} em ${city}`, business],
            H,
            3,
            STATIC_FALLBACK.headline,
          ),
          body: pick(
            [
              radius !== null ? `Atendimento num raio de até ${radius} km em ${city}.` : null,
              `Em ${city}/${facts.state}.`,
            ],
            B,
            1,
            "",
          ),
          primary_text: sentences(
            [
              withPeriod(`${business} em ${city}/${facts.state}`),
              withPeriod(`${offer} perto de quem mora ou circula pela região`),
              ...closing,
            ],
            P,
          ),
          visual_direction: "Fachada, balcão ou equipe reais, com uma faixa de texto na cor da marca.",
        };
    }
  }

  const concepts: Concept[] = CONCEPT_ANGLES.map((angle, i): Concept => ({
    angle,
    cta: ctas[i % ctas.length],
    // Preço só no conceito de oferta direta e só com preço confirmado.
    show_price: angle === "oferta_direta" && hasPrice,
    template_key: TEMPLATE_KEYS[(i + 1) % TEMPLATE_KEYS.length],
    ...conceptCopy(angle),
  }));

  const cautions: string[] = ["Conteúdo de simulação, sem IA real: revise e ajuste os textos antes de usar."];
  if (!hasPrice) cautions.push("As peças não mostram preço porque ele não foi confirmado.");
  if (differentiators.length === 0) {
    cautions.push("Sem diferenciais informados: as mensagens focam na oferta e na cidade.");
  } else if (skippedDifferentiators > 0) {
    cautions.push(
      "Alguns diferenciais não foram usados porque parecem promessa, desconto ou avaliação sem comprovação.",
    );
  }
  if (!description) cautions.push("A descrição da oferta não foi usada nos textos porque precisa de comprovação.");

  const where = radius !== null ? `, num raio de até ${radius} km de ${city}` : ` em ${city}`;
  const audienceText = audience
    ? lowerFirst(withoutPeriod(audience))
    : `pessoas de ${facts.age_min} a ${facts.age_max} anos`;
  const summaryHead = withPeriod(
    fitWords(
      `${business} (${facts.segment}, ${city}/${facts.state}): divulgar ${lowerFirst(offer)} para ${audienceText}, com foco em ${objective.focus}`,
      500 - SUMMARY_TAIL.length - 2,
    ),
  );
  const generated: GeneratedStrategy = {
    strategy: {
      summary: `${summaryHead} ${SUMMARY_TAIL}`,
      positioning: pick(
        [`${offer} em ${city}, com comunicação ${tone.adjective}.`, `${business} em ${city}.`],
        200,
        10,
        STATIC_FALLBACK.positioning,
      ),
      audience_insights: [
        pick(
          [`Público de ${facts.age_min} a ${facts.age_max} anos${where}.`],
          160,
          10,
          STATIC_FALLBACK.audience_insights,
        ),
        pick(
          [audience ? `Como o cliente descreve quem compra: ${lowerFirst(audience)}` : null],
          160,
          10,
          STATIC_FALLBACK.audience_insights,
        ),
        objective.insight,
      ],
      key_messages: [
        pick([`${offer} em ${city}`, offer], 120, 5, STATIC_FALLBACK.key_messages),
        pick(
          [safeDifferentiators[0], descriptionLead, `${offer} na ${business}`],
          120,
          5,
          STATIC_FALLBACK.key_messages,
        ),
        pick([objective.message(facts)], 120, 5, STATIC_FALLBACK.key_messages),
        withoutPeriod(tone.invite),
      ],
      recommended_formats: ["feed_4x5", "stories_9x16"],
      channel_note: pick([channelNote(facts)], 240, 10, STATIC_FALLBACK.channel_note),
      cautions: cautions.slice(0, 4),
    },
    concepts,
  };

  return replaceUnsafeFields(generated, facts);
}

/** Última barreira: qualquer campo que ainda acuse problema vira texto neutro. */
function replaceUnsafeFields(gen: GeneratedStrategy, facts: BriefFacts): GeneratedStrategy {
  const issues = checkGeneratedAgainstFacts(gen, facts);
  if (issues.length === 0) return gen;
  const out: GeneratedStrategy = structuredClone(gen);
  for (const { path } of issues) {
    const match = /^(?:strategy|concepts\[(\d+)\])\.(\w+)(?:\[(\d+)\])?$/.exec(path);
    if (!match) continue;
    const [, conceptIndex, field, itemIndex] = match;
    if (conceptIndex !== undefined) {
      const concept = out.concepts[Number(conceptIndex)];
      if (!concept) continue;
      if (field === "title") concept.title = CONCEPT_ANGLE_LABELS[concept.angle];
      else if (field === "show_price") concept.show_price = false;
      else if (field && field in STATIC_FALLBACK) {
        (concept as Record<string, unknown>)[field] = STATIC_FALLBACK[field as keyof typeof STATIC_FALLBACK];
      }
      continue;
    }
    const strategy = out.strategy as Record<string, unknown>;
    const fallback = STATIC_FALLBACK[field as keyof typeof STATIC_FALLBACK];
    if (!field || fallback === undefined) continue;
    if (itemIndex !== undefined && Array.isArray(strategy[field])) {
      (strategy[field] as string[])[Number(itemIndex)] = fallback;
    } else {
      strategy[field] = fallback;
    }
  }
  return out;
}

export function createMockProvider(): AiTextProvider {
  return {
    name: "mock",
    model: null,
    isSimulation: true,
    async generateStrategy(facts, { signal }) {
      if (signal.aborted) throw new ProviderError("provider_timeout", true, "Tempo esgotado na simulação.");
      return { output: buildMockStrategy(facts), usage: { ...ZERO_USAGE } };
    },
  };
}
