"use server";

import { revalidatePath } from "next/cache";
import { apiError, type ApiResult } from "@/contracts/api";
import {
  completeOnboardingResultSchema,
  fieldErrors,
  onboardingDraftSchema,
  onboardingSchema,
  type CompleteOnboardingResult,
} from "@/contracts/onboarding";
import { log } from "@/lib/logger";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAppContext, getCorrelationId } from "./context";

type Saved = { saved_at: string };

/** Autosave do rascunho. Em modo demonstração o rascunho fica no navegador. */
export async function saveOnboardingDraft(input: unknown): Promise<ApiResult<Saved>> {
  const correlationId = await getCorrelationId();
  const ctx = await getAppContext();
  if (ctx.mode !== "supabase") {
    return apiError("feature_disabled", "Modo demonstração: rascunho salvo só no navegador.", correlationId);
  }
  if (!ctx.organization) return apiError("forbidden", "Crie sua empresa antes de continuar.", correlationId);

  const parsed = onboardingDraftSchema.safeParse(input);
  if (!parsed.success) {
    return apiError("validation_failed", "Rascunho inválido.", correlationId, fieldErrors(parsed.error));
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("onboarding_drafts")
    .update({ step: parsed.data.step, data: parsed.data.data, updated_by: ctx.user.id })
    .eq("organization_id", ctx.organization.id)
    .is("completed_brief_id", null);

  if (error) {
    log("error", "onboarding.draft_save_failed", { correlation_id: correlationId, code: error.code });
    return apiError("internal", "Não foi possível salvar agora. Tentaremos de novo.", correlationId);
  }
  return { ok: true, data: { saved_at: new Date().toISOString() }, correlation_id: correlationId };
}

/** Conclui o onboarding: valida tudo no servidor e grava negócio, oferta e brief numa transação. */
export async function completeOnboarding(input: unknown): Promise<ApiResult<CompleteOnboardingResult>> {
  const correlationId = await getCorrelationId();
  const parsed = onboardingSchema.safeParse(input);
  if (!parsed.success) {
    return apiError("validation_failed", "Revise os campos destacados.", correlationId, fieldErrors(parsed.error));
  }

  const ctx = await getAppContext();
  if (ctx.mode !== "supabase") {
    return apiError("feature_disabled", "Modo demonstração: nada foi gravado no servidor.", correlationId);
  }
  if (!ctx.organization) return apiError("forbidden", "Crie sua empresa antes de continuar.", correlationId);

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("complete_onboarding", {
    p_org: ctx.organization.id,
    p_payload: parsed.data,
    p_correlation_id: correlationId,
  });

  if (error) {
    log("error", "onboarding.complete_failed", { correlation_id: correlationId, code: error.code });
    if (error.code === "42501") return apiError("forbidden", "Sem permissão para esta empresa.", correlationId);
    if (error.message.includes("facts_not_confirmed")) {
      return apiError("facts_not_confirmed", "Confirme que as informações são verdadeiras.", correlationId);
    }
    return apiError("internal", "Não foi possível concluir agora. Tente novamente.", correlationId);
  }

  const result = completeOnboardingResultSchema.parse(data);
  log("info", "onboarding.completed", {
    correlation_id: correlationId,
    organization_id: ctx.organization.id,
    brief_id: result.brief_id,
    replayed: result.replayed,
  });
  revalidatePath("/app");
  return { ok: true, data: result, correlation_id: correlationId };
}
