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

export const billingWebhookPayloadSchema = z.object({
  provider: z.string().trim().min(2).max(40),
  event_id: externalIdSchema,
  event_type: billingEventTypeSchema,
  organization_id: uuidSchema,
  amount_cents: z.number().int().nonnegative().default(PLAN_MONTHLY_PRICE_CENTS),
  currency: currencySchema.default("BRL"),
  simulated: z.boolean().default(true),
});
export type BillingWebhookPayload = z.infer<typeof billingWebhookPayloadSchema>;

export const PILOT_FEEDBACK_STAGES = ["onboarding", "strategy", "creative", "campaign"] as const;
export const PILOT_FEEDBACK_RATINGS = ["helpful", "needs_improvement"] as const;

export const submitPilotFeedbackSchema = z.object({
  stage: z.enum(PILOT_FEEDBACK_STAGES),
  rating: z.enum(PILOT_FEEDBACK_RATINGS),
  comment: z.string().trim().max(500, "Máximo de 500 caracteres").optional(),
  creative_id: uuidSchema.optional(),
});
export type SubmitPilotFeedbackInput = z.infer<typeof submitPilotFeedbackSchema>;
