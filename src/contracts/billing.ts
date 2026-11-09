import { z } from "zod";
import { currencySchema, externalIdSchema, uuidSchema } from "./common";

export const SUBSCRIPTION_STATUSES = ["trialing", "active", "past_due", "canceled", "suspended"] as const;
export const subscriptionStatusSchema = z.enum(SUBSCRIPTION_STATUSES);
export type SubscriptionStatus = z.infer<typeof subscriptionStatusSchema>;

export const PLAN_MONTHLY_PRICE_CENTS = 19_900; // R$ 199,00/mês

export const BILLING_EVENT_TYPES = [
  "subscription.activated",
  "invoice.paid",
  "invoice.payment_failed",
  "subscription.canceled",
] as const;
export const billingEventTypeSchema = z.enum(BILLING_EVENT_TYPES);
export type BillingEventType = z.infer<typeof billingEventTypeSchema>;

export const WEBHOOK_EVENT_TYPES = [...BILLING_EVENT_TYPES, "media.topup_paid"] as const;
export const webhookEventTypeSchema = z.enum(WEBHOOK_EVENT_TYPES);
export type WebhookEventType = z.infer<typeof webhookEventTypeSchema>;

export const billingWebhookPayloadSchema = z.object({
  provider: z.string().trim().min(2).max(40),
  event_id: externalIdSchema,
  event_type: webhookEventTypeSchema,
  organization_id: uuidSchema,
  amount_cents: z.number().int().nonnegative().default(PLAN_MONTHLY_PRICE_CENTS),
  currency: currencySchema.default("BRL"),
  simulated: z.boolean().default(true),
});
export type BillingWebhookPayload = z.infer<typeof billingWebhookPayloadSchema>;

export const MEDIA_TOPUP_PRESETS_CENTS = [7_000, 14_000, 25_000, 50_000] as const;

export const mediaTopupSchema = z
  .object({
    amount_cents: z
      .number()
      .int("Informe o valor em centavos inteiros")
      .min(1_000, "Valor mínimo de R$ 10,00")
      .max(5_000_000, "Valor máximo de R$ 50.000,00 por recarga"),
    idempotency_key: z.string().trim().min(4).max(120).optional(),
    external_reference: z.string().trim().min(4).max(120).optional(),
  })
  .refine((v) => Boolean(v.idempotency_key || v.external_reference), {
    message: "Informe a referência da recarga",
    path: ["idempotency_key"],
  })
  .transform((v) => ({
    amount_cents: v.amount_cents,
    idempotency_key: (v.idempotency_key ?? v.external_reference)!,
  }));
export type MediaTopupInput = z.infer<typeof mediaTopupSchema>;

export const operatorMediaTopupSchema = z.object({
  organization_id: uuidSchema,
  amount_cents: z
    .number()
    .int("Informe o valor em centavos inteiros")
    .min(1_000, "Valor mínimo de R$ 10,00")
    .max(5_000_000, "Valor máximo de R$ 50.000,00 por recarga"),
  external_reference: z.string().trim().min(4).max(120),
});
export type OperatorMediaTopupInput = z.infer<typeof operatorMediaTopupSchema>;

export const PILOT_FEEDBACK_STAGES = ["onboarding", "strategy", "creative", "campaign"] as const;
export const PILOT_FEEDBACK_RATINGS = ["helpful", "needs_improvement"] as const;

export const submitPilotFeedbackSchema = z.object({
  stage: z.enum(PILOT_FEEDBACK_STAGES),
  rating: z.enum(PILOT_FEEDBACK_RATINGS),
  comment: z.string().trim().max(500, "Máximo de 500 caracteres").optional(),
  creative_id: uuidSchema.optional(),
});
export type SubmitPilotFeedbackInput = z.infer<typeof submitPilotFeedbackSchema>;
