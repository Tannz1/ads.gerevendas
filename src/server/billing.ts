"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { apiError, type ApiResult } from "@/contracts/api";
import {
  BILLING_EVENT_TYPES,
  PLAN_MONTHLY_PRICE_CENTS,
  submitPilotFeedbackSchema,
  type BillingEventType,
} from "@/contracts/billing";
import { fieldErrors } from "@/contracts/onboarding";
import { log } from "@/lib/logger";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAppContext, getCorrelationId } from "./context";

const simulateEventSchema = z.object({
  event_type: z.enum(BILLING_EVENT_TYPES),
  event_id: z.string().trim().min(4).max(120),
});

export async function simulateBillingEvent(input: unknown): Promise<ApiResult<{ replayed: boolean; status?: string }>> {
  const correlationId = await getCorrelationId();
  const parsed = simulateEventSchema.safeParse(input);
  if (!parsed.success) {
    return apiError("validation_failed", "Evento de cobrança inválido.", correlationId);
  }
  const ctx = await getAppContext();
  if (ctx.mode !== "supabase" || !ctx.organization) {
    return apiError("feature_disabled", "Disponível no piloto com conta.", correlationId);
  }
  if (ctx.organization.role !== "owner" && ctx.organization.role !== "admin") {
    return apiError("forbidden", "Apenas proprietários ou administradores gerenciam a assinatura.", correlationId);
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("process_billing_event", {
    p_org: ctx.organization.id,
    p_provider: "mock",
    p_event_id: parsed.data.event_id,
    p_event_type: parsed.data.event_type as BillingEventType,
    p_amount_cents: PLAN_MONTHLY_PRICE_CENTS,
    p_simulated: true,
    p_correlation_id: correlationId,
  });

  if (error) {
    if (error.code === "42501") return apiError("forbidden", "Sem permissão.", correlationId);
    log("error", "billing.simulate_failed", { correlation_id: correlationId, code: error.code });
    return apiError("internal", "Não foi possível processar o evento agora.", correlationId);
  }

  revalidatePath("/app/assinatura");
  revalidatePath("/app/conta");
  const res = data as { replayed: boolean; status?: string };
  return { ok: true, data: res, correlation_id: correlationId };
}

export async function submitPilotFeedback(input: unknown): Promise<ApiResult<{ id: string }>> {
  const correlationId = await getCorrelationId();
  const parsed = submitPilotFeedbackSchema.safeParse(input);
  if (!parsed.success) {
    return apiError("validation_failed", "Revise sua avaliação.", correlationId, fieldErrors(parsed.error));
  }
  const ctx = await getAppContext();
  if (ctx.mode !== "supabase" || !ctx.organization) {
    return apiError("feature_disabled", "Disponível no piloto com conta.", correlationId);
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("submit_pilot_feedback", {
    p_org: ctx.organization.id,
    p_stage: parsed.data.stage,
    p_rating: parsed.data.rating,
    p_comment: parsed.data.comment ?? null,
    p_creative: parsed.data.creative_id ?? null,
    p_correlation_id: correlationId,
  });

  if (error) {
    log("error", "pilot.feedback_failed", { correlation_id: correlationId, code: error.code });
    return apiError("internal", "Não foi possível enviar o feedback agora.", correlationId);
  }

  revalidatePath("/app/criativos", "layout");
  return { ok: true, data: { id: data as string }, correlation_id: correlationId };
}
