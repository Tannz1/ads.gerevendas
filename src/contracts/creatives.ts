import { z } from "zod";

/**
 * Contrato dos criativos (ADR 0003). `StrategyPlan` é o formato interno que o provedor de texto
 * devolve; `CreativeContent` é o que o editor altera em cada peça. Não são payloads da Meta.
 */

/** Um ângulo por família de template (docs/04): sempre os cinco, sem repetição. */
export const ANGLE_KEYS = ["oferta", "problema", "beneficio", "demonstracao", "conveniencia"] as const;
export const angleKeySchema = z.enum(ANGLE_KEYS);
export type AngleKey = z.infer<typeof angleKeySchema>;

export const TEMPLATE_LABELS: Record<AngleKey, string> = {
  oferta: "Oferta",
  problema: "Problema",
  beneficio: "Benefício",
  demonstracao: "Demonstração",
  conveniencia: "Conveniência",
};

const text = (max: number) => z.string().trim().min(1).max(max);

export const LIMITS = { headline: 60, body: 140, cta: 24 } as const;

export const strategyAngleSchema = z.object({
  key: angleKeySchema,
  label: text(40),
  rationale: text(240),
  headline: text(LIMITS.headline),
  body: text(LIMITS.body),
  cta: text(LIMITS.cta),
});

export const strategyPlanSchema = z.object({
  business_summary: text(400),
  angles: z
    .array(strategyAngleSchema)
    .length(ANGLE_KEYS.length)
    .refine((a) => new Set(a.map((x) => x.key)).size === ANGLE_KEYS.length, "Um ângulo de cada tipo"),
  targeting_proposal: z.object({ locations: z.array(text(80)).max(5), age_range: text(40) }),
  assumptions: z.array(text(200)).max(6),
  fields_requiring_confirmation: z.array(text(200)).max(6),
});
export type StrategyPlan = z.infer<typeof strategyPlanSchema>;

/**
 * Pesquisa de mercado feita pela IA na web antes da estratégia. É contexto, não fato do cliente:
 * nada daqui entra nas peças sem passar pela checagem de fatos.
 */
export const marketResearchSchema = z.object({
  business_context: text(600),
  local_market: text(600),
  competitors: z
    .array(
      z.object({
        name: text(120),
        source_url: z.string().trim().max(400).nullable(),
        positioning: text(300),
        client_listed: z.boolean(),
      }),
    )
    .max(8),
  opportunities: z.array(text(240)).max(5),
  audience_insights: z.array(text(240)).max(5),
});
export type MarketResearch = z.infer<typeof marketResearchSchema>;

export const researchSourceSchema = z.object({ url: z.string().max(600), title: z.string().max(200).nullable() });
export type ResearchSource = z.infer<typeof researchSourceSchema>;

/** Plano como fica gravado: o que o modelo de estratégia devolveu + a pesquisa (com as fontes). */
export const storedStrategyPlanSchema = strategyPlanSchema.extend({
  research: marketResearchSchema.extend({ sources: z.array(researchSourceSchema).max(12) }).nullish(),
});
export type StoredStrategyPlan = z.infer<typeof storedStrategyPlanSchema>;

const hex = z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Cor em hexadecimal, ex.: #C2410C");

export const creativeContentSchema = z.object({
  template: angleKeySchema,
  headline: text(LIMITS.headline),
  body: text(LIMITS.body),
  cta: text(LIMITS.cta),
  show_price: z.boolean(),
  colors: z.object({ background: hex, accent: hex, text: hex }),
});
export type CreativeContent = z.infer<typeof creativeContentSchema>;

/** Formatos de exportação em pixels. */
export const FORMATS = {
  feed: { width: 1080, height: 1350, label: "Feed (4:5)" },
  stories: { width: 1080, height: 1920, label: "Stories (9:16)" },
} as const;
export type Format = keyof typeof FORMATS;

export const JOB_STATUSES = ["queued", "running", "succeeded", "failed"] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];
