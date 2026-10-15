import { z } from "zod";
import type { Objective } from "./onboarding";

/**
 * Contratos da fase 2: estratégia e conceitos gerados por IA a partir de um brief submetido.
 * A IA PROPÕE; nada aqui é fato. Regras de veracidade em `src/server/ai/fact-guard.ts`.
 */

const text = (min: number, max: number) => z.string().trim().min(min).max(max);

export const CTA_BY_OBJECTIVE: Record<Objective, readonly string[]> = {
  mensagens_whatsapp: ["Chamar no WhatsApp", "Pedir no WhatsApp", "Fale com a gente"],
  visitas_perfil: ["Ver no Instagram", "Conheça o perfil", "Mande um direct"],
  trafego_site: ["Saiba mais", "Ver no site", "Comprar agora"],
  reconhecimento_local: ["Venha conhecer", "Saiba mais", "Visite a loja"],
};
export const ALL_CTAS = [...new Set(Object.values(CTA_BY_OBJECTIVE).flat())] as [string, ...string[]];
export const ctaSchema = z.enum(ALL_CTAS);

export const CONCEPT_ANGLES = [
  "oferta_direta",
  "beneficio_principal",
  "diferencial",
  "rotina_do_cliente",
  "convite_local",
] as const;
export const conceptAngleSchema = z.enum(CONCEPT_ANGLES);
export type ConceptAngle = z.infer<typeof conceptAngleSchema>;

export const CONCEPT_ANGLE_LABELS: Record<ConceptAngle, string> = {
  oferta_direta: "Oferta direta",
  beneficio_principal: "Benefício principal",
  diferencial: "Diferencial",
  rotina_do_cliente: "Rotina do cliente",
  convite_local: "Convite local",
};

export const CREATIVE_FORMATS = ["feed_4x5", "stories_9x16"] as const;
export const creativeFormatSchema = z.enum(CREATIVE_FORMATS);
export type CreativeFormat = z.infer<typeof creativeFormatSchema>;

export const TEMPLATE_KEYS = ["destaque", "oferta", "minimal", "faixa"] as const;
export const templateKeySchema = z.enum(TEMPLATE_KEYS);
export type TemplateKey = z.infer<typeof templateKeySchema>;

/** Limites de texto do conceito (iguais aos do editor; ver creative.ts). */
export const COPY_LIMITS = { headline: 40, body: 90, primary_text: 280 } as const;

export const strategySchema = z.object({
  summary: text(40, 500),
  positioning: text(10, 200),
  audience_insights: z.array(text(10, 160)).min(2).max(4),
  key_messages: z.array(text(5, 120)).min(3).max(5),
  recommended_formats: z.array(creativeFormatSchema).min(1).max(2),
  channel_note: text(10, 240),
  /** Avisos honestos, ex.: "Sem preço confirmado: as peças não mostram valores". */
  cautions: z.array(text(5, 200)).max(4),
});
export type Strategy = z.infer<typeof strategySchema>;

export const conceptSchema = z.object({
  angle: conceptAngleSchema,
  title: text(3, 60),
  rationale: text(10, 240),
  headline: text(3, COPY_LIMITS.headline),
  body: text(0, COPY_LIMITS.body),
  /** Texto principal do anúncio (acima da imagem no feed). */
  primary_text: text(10, COPY_LIMITS.primary_text),
  cta: ctaSchema,
  /** Só pode ser true quando a oferta tem preço confirmado pelo cliente. */
  show_price: z.boolean(),
  template_key: templateKeySchema,
  visual_direction: text(10, 240),
});
export type Concept = z.infer<typeof conceptSchema>;

/** Saída completa de uma geração (validada antes de persistir). */
export const generatedStrategySchema = z.object({
  strategy: strategySchema,
  concepts: z.array(conceptSchema).min(3).max(5),
});
export type GeneratedStrategy = z.infer<typeof generatedStrategySchema>;

/**
 * Fatos confirmados que a IA pode usar. Montado no servidor a partir do brief, da oferta e
 * do negócio (nunca do cliente). Tudo que não estiver aqui não pode virar afirmação.
 */
export const briefFactsSchema = z.object({
  business_name: z.string(),
  segment: z.string(),
  city: z.string(),
  state: z.string(),
  offer_name: z.string(),
  offer_description: z.string(),
  /** null quando o cliente não confirmou preço. */
  price_cents: z.number().int().nonnegative().nullable(),
  currency: z.string(),
  differentiators: z.array(z.string()),
  audience_description: z.string(),
  age_min: z.number().int(),
  age_max: z.number().int(),
  service_radius_km: z.number().int().nullable(),
  objective: z.enum(["mensagens_whatsapp", "visitas_perfil", "trafego_site", "reconhecimento_local"]),
  tone_of_voice: z.string().nullable(),
  brand_primary_color: z.string().nullable(),
  has_whatsapp: z.boolean(),
  has_instagram: z.boolean(),
  has_website: z.boolean(),
});
export type BriefFacts = z.infer<typeof briefFactsSchema>;

// ---------------------------------------------------------------- jobs

export const JOB_STATUSES = ["queued", "running", "succeeded", "failed"] as const;
export const jobStatusSchema = z.enum(JOB_STATUSES);
export type JobStatus = z.infer<typeof jobStatusSchema>;

export const JOB_ERROR_CODES = [
  "provider_timeout",
  "provider_unavailable",
  "provider_rate_limited",
  "invalid_output",
  "fact_check_failed",
  "stale_timeout",
  "quota_exceeded",
  "feature_disabled",
  "internal",
] as const;
export const jobErrorCodeSchema = z.enum(JOB_ERROR_CODES);
export type JobErrorCode = z.infer<typeof jobErrorCodeSchema>;

export const AI_PROVIDERS = ["mock", "openai"] as const;
export const aiProviderSchema = z.enum(AI_PROVIDERS);
export type AiProviderName = z.infer<typeof aiProviderSchema>;

export const generationJobSchema = z.object({
  id: z.uuid(),
  status: jobStatusSchema,
  attempts: z.number().int().nonnegative(),
  max_attempts: z.number().int().positive(),
  error_code: jobErrorCodeSchema.nullable(),
  provider: aiProviderSchema,
  is_simulation: z.boolean(),
  result_strategy_id: z.uuid().nullable(),
  created_at: z.string(),
  started_at: z.string().nullable(),
  finished_at: z.string().nullable(),
});
export type GenerationJob = z.infer<typeof generationJobSchema>;

export const usageSchema = z.object({
  input_tokens: z.number().int().nonnegative(),
  output_tokens: z.number().int().nonnegative(),
  /** Custo estimado em micro-dólares (1 USD = 1_000_000). 0 no provider mock. */
  cost_micro_usd: z.number().int().nonnegative(),
});
export type Usage = z.infer<typeof usageSchema>;

/** Estratégia persistida, como a UI recebe. */
export const strategyViewSchema = z.object({
  id: z.uuid(),
  brief_id: z.uuid(),
  version: z.number().int().positive(),
  provider: aiProviderSchema,
  model: z.string().nullable(),
  is_simulation: z.boolean(),
  created_at: z.string(),
  content: strategySchema,
  concepts: z.array(
    z.object({
      id: z.uuid(),
      position: z.number().int().min(1).max(5),
      content: conceptSchema,
    }),
  ),
});
export type StrategyView = z.infer<typeof strategyViewSchema>;

/** Limite diário de gerações por organização (também imposto no banco). */
export const DAILY_GENERATION_LIMIT = 20;
