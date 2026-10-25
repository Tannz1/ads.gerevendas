import { z } from "zod";
import { currencySchema, uuidSchema } from "./common";
import { objectiveSchema } from "./onboarding";

export const META_CONNECTION_STATUSES = ["disconnected", "connected", "missing_permissions", "token_expired"] as const;
export const metaConnectionStatusSchema = z.enum(META_CONNECTION_STATUSES);
export type MetaConnectionStatus = z.infer<typeof metaConnectionStatusSchema>;

export const CAMPAIGN_STATUSES = ["draft", "paused", "active", "ended"] as const;
export const campaignStatusSchema = z.enum(CAMPAIGN_STATUSES);
export type CampaignStatus = z.infer<typeof campaignStatusSchema>;

export const META_REVIEW_STATUSES = ["not_submitted", "pending_review", "approved", "rejected"] as const;
export const metaReviewStatusSchema = z.enum(META_REVIEW_STATUSES);
export type MetaReviewStatus = z.infer<typeof metaReviewStatusSchema>;

/** Limites de orçamento diário no piloto: mínimo R$ 10,00/dia (1000 centavos), máximo R$ 500,00/dia (50000 centavos). */
export const CAMPAIGN_BUDGET_LIMITS = {
  min_daily_cents: 1_000,
  max_daily_cents: 50_000,
  min_days: 1,
  max_days: 30,
} as const;

export const createPausedCampaignSchema = z.object({
  strategy_id: uuidSchema,
  name: z.string().trim().min(3, "Informe um nome de pelo menos 3 caracteres").max(120, "Máximo de 120 caracteres"),
  objective: objectiveSchema,
  daily_budget_cents: z
    .number()
    .int("O orçamento diário deve ser em centavos inteiros")
    .min(CAMPAIGN_BUDGET_LIMITS.min_daily_cents, "Orçamento mínimo de R$ 10,00 por dia")
    .max(CAMPAIGN_BUDGET_LIMITS.max_daily_cents, "Orçamento máximo de R$ 500,00 por dia no piloto"),
  currency: currencySchema.default("BRL"),
  duration_days: z
    .number()
    .int()
    .min(CAMPAIGN_BUDGET_LIMITS.min_days, "Duração mínima de 1 dia")
    .max(CAMPAIGN_BUDGET_LIMITS.max_days, "Duração máxima de 30 dias"),
  creative_ids: z
    .array(uuidSchema)
    .min(1, "Selecione pelo menos 1 peça aprovada")
    .max(5, "Selecione no máximo 5 peças"),
  spend_confirmed_by_owner: z.literal(true, {
    error: "Confirme que autoriza este orçamento e que o pagamento de mídia é feito direto na Meta",
  }),
  idempotency_key: z.string().trim().min(8).max(64),
});
export type CreatePausedCampaignInput = z.infer<typeof createPausedCampaignSchema>;

export const activateCampaignSchema = z.object({
  campaign_id: uuidSchema,
  confirmed_daily_budget_cents: z.number().int().positive(),
  confirmed_duration_days: z.number().int().positive(),
  owner_activation_confirmed: z.literal(true, {
    error: "Confirme explicitamente a ativação da campanha com o orçamento exibido",
  }),
  idempotency_key: z.string().trim().min(8).max(64),
});
export type ActivateCampaignInput = z.infer<typeof activateCampaignSchema>;
