import { describe, expect, it } from "vitest";
import { OBJECTIVES } from "@/contracts/onboarding";
import {
  ALL_CTAS,
  CONCEPT_ANGLES,
  conceptSchema,
  CREATIVE_FORMATS,
  CTA_BY_OBJECTIVE,
  generatedStrategySchema,
  strategySchema,
  TEMPLATE_KEYS,
} from "@/contracts/strategy";
import {
  GENERATED_STRATEGY_JSON_SCHEMA,
  generatedStrategyJsonSchemaFor,
  type JsonSchema,
} from "@/server/ai/json-schema";

type ObjectSchema = Extract<JsonSchema, { type: "object" }>;
type ArraySchema = Extract<JsonSchema, { type: "array" }>;

function asObject(schema: JsonSchema | undefined): ObjectSchema {
  if (!schema || schema.type !== "object") throw new Error("esperava objeto");
  return schema;
}
function asArray(schema: JsonSchema | undefined): ArraySchema {
  if (!schema || schema.type !== "array") throw new Error("esperava array");
  return schema;
}

const root = asObject(GENERATED_STRATEGY_JSON_SCHEMA);
const strategy = asObject(root.properties.strategy);
const concept = asObject(asArray(root.properties.concepts).items);

const sorted = (keys: Iterable<string>) => [...keys].sort();

/** Percorre o schema inteiro (objetos, arrays e itens). */
function walk(schema: JsonSchema, visit: (s: JsonSchema) => void) {
  visit(schema);
  if (schema.type === "object") Object.values(schema.properties).forEach((s) => walk(s, visit));
  if (schema.type === "array") walk(schema.items, visit);
}

describe("JSON Schema da saída estruturada (sem divergir do Zod)", () => {
  it("propriedades batem com as chaves dos schemas Zod", () => {
    expect(sorted(Object.keys(root.properties))).toEqual(sorted(Object.keys(generatedStrategySchema.shape)));
    expect(sorted(Object.keys(strategy.properties))).toEqual(sorted(Object.keys(strategySchema.shape)));
    expect(sorted(Object.keys(concept.properties))).toEqual(sorted(Object.keys(conceptSchema.shape)));
  });

  it("modo estrito: todo objeto exige todas as propriedades e proíbe extras", () => {
    let objects = 0;
    walk(GENERATED_STRATEGY_JSON_SCHEMA, (s) => {
      if (s.type !== "object") return;
      objects++;
      expect(sorted(s.required)).toEqual(sorted(Object.keys(s.properties)));
      expect(s.additionalProperties).toBe(false);
    });
    expect(objects).toBe(3);
  });

  it("não usa palavras-chave fora do suportado (limites ficam na descrição)", () => {
    const forbidden = ["minLength", "maxLength", "minItems", "maxItems", "pattern", "format", "default", "$ref"];
    const json = JSON.stringify(GENERATED_STRATEGY_JSON_SCHEMA);
    for (const key of forbidden) expect(json).not.toContain(`"${key}"`);
  });

  it("enums batem com o contrato", () => {
    expect(concept.properties.angle).toMatchObject({ enum: [...CONCEPT_ANGLES] });
    expect(concept.properties.template_key).toMatchObject({ enum: [...TEMPLATE_KEYS] });
    expect(concept.properties.cta).toMatchObject({ enum: [...ALL_CTAS] });
    expect(asArray(strategy.properties.recommended_formats).items).toMatchObject({ enum: [...CREATIVE_FORMATS] });
    expect(concept.properties.show_price).toMatchObject({ type: "boolean" });
  });

  it.each(OBJECTIVES)("schema por objetivo restringe o CTA (%s)", (objective) => {
    const perObjective = asObject(
      asArray(asObject(generatedStrategyJsonSchemaFor(objective)).properties.concepts).items,
    );
    expect(perObjective.properties.cta).toMatchObject({ enum: [...CTA_BY_OBJECTIVE[objective]] });
    expect(sorted(Object.keys(perObjective.properties))).toEqual(sorted(Object.keys(conceptSchema.shape)));
  });
});
