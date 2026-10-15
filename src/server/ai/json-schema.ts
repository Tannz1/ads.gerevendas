import type { Objective } from "@/contracts/onboarding";
import {
  ALL_CTAS,
  CONCEPT_ANGLES,
  COPY_LIMITS,
  CREATIVE_FORMATS,
  CTA_BY_OBJECTIVE,
  TEMPLATE_KEYS,
} from "@/contracts/strategy";

/**
 * JSON Schema escrito à mão para a saída estruturada estrita da OpenAI (Responses API,
 * `text.format.type = "json_schema"`, `strict: true`). Regras do modo estrito: todo objeto lista
 * todas as propriedades em `required` e tem `additionalProperties: false`. Limites de tamanho e de
 * quantidade ficam na `description` (palavras-chave como minLength/maxItems não são usadas) e são
 * impostos depois pelo Zod (`generatedStrategySchema`), que continua sendo a fonte da verdade.
 * Um teste garante que as propriedades daqui batem com as chaves dos schemas Zod.
 */

export type JsonSchema =
  | { type: "string"; description?: string; enum?: readonly string[] }
  | { type: "boolean"; description?: string }
  | { type: "array"; description?: string; items: JsonSchema }
  | {
      type: "object";
      description?: string;
      properties: Record<string, JsonSchema>;
      required: readonly string[];
      additionalProperties: false;
    };

const text = (description: string): JsonSchema => ({ type: "string", description });
const list = (description: string, items: JsonSchema): JsonSchema => ({ type: "array", description, items });

function object(properties: Record<string, JsonSchema>, description?: string): JsonSchema {
  return {
    type: "object",
    ...(description ? { description } : {}),
    properties,
    required: Object.keys(properties),
    additionalProperties: false,
  };
}

const strategyProperties: Record<string, JsonSchema> = {
  summary: text("Resumo da estratégia em português do Brasil. Entre 40 e 500 caracteres."),
  positioning: text("Posicionamento em uma frase. Entre 10 e 200 caracteres."),
  audience_insights: list(
    "De 2 a 4 percepções sobre o público, baseadas só nos fatos.",
    text("Entre 10 e 160 caracteres."),
  ),
  key_messages: list("De 3 a 5 mensagens-chave.", text("Entre 5 e 120 caracteres.")),
  recommended_formats: list("1 ou 2 formatos, sem repetir.", { type: "string", enum: [...CREATIVE_FORMATS] }),
  channel_note: text("Onde e como os anúncios aparecem. Entre 10 e 240 caracteres."),
  cautions: list(
    "Até 4 avisos honestos ao dono do negócio (ex.: preço não confirmado). Pode ser lista vazia.",
    text("Entre 5 e 200 caracteres."),
  ),
};

function conceptProperties(ctas: readonly string[]): Record<string, JsonSchema> {
  return {
    angle: { type: "string", enum: [...CONCEPT_ANGLES], description: "Ângulo do conceito." },
    title: text("Nome interno do conceito. Entre 3 e 60 caracteres."),
    rationale: text("Por que este conceito funciona para este negócio. Entre 10 e 240 caracteres."),
    headline: text(`Título da peça. Entre 3 e ${COPY_LIMITS.headline} caracteres.`),
    body: text(`Texto curto da peça. No máximo ${COPY_LIMITS.body} caracteres (pode ser vazio).`),
    primary_text: text(
      `Texto principal do anúncio, acima da imagem. Entre 10 e ${COPY_LIMITS.primary_text} caracteres.`,
    ),
    cta: { type: "string", enum: [...ctas], description: "Texto do botão." },
    show_price: { type: "boolean", description: "true só no conceito oferta_direta e só se houver preço confirmado." },
    template_key: { type: "string", enum: [...TEMPLATE_KEYS], description: "Modelo visual da peça." },
    visual_direction: text("Direção visual da peça (foto, composição). Entre 10 e 240 caracteres."),
  };
}

function generatedStrategyJsonSchema(ctas: readonly string[]): JsonSchema {
  return object({
    strategy: object(strategyProperties),
    concepts: list(
      `Exatamente 5 conceitos, um por ângulo, nesta ordem: ${CONCEPT_ANGLES.join(", ")}.`,
      object(conceptProperties(ctas)),
    ),
  });
}

/** Schema com todos os CTAs do contrato (referência e testes). */
export const GENERATED_STRATEGY_JSON_SCHEMA: JsonSchema = generatedStrategyJsonSchema(ALL_CTAS);

/** Schema enviado à OpenAI: o enum de CTA fica restrito aos CTAs do objetivo do brief. */
export function generatedStrategyJsonSchemaFor(objective: Objective): JsonSchema {
  return generatedStrategyJsonSchema(CTA_BY_OBJECTIVE[objective]);
}
