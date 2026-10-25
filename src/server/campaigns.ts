"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { apiError, type ApiResult } from "@/contracts/api";
import { activateCampaignSchema, createPausedCampaignSchema } from "@/contracts/campaigns";
import { fieldErrors } from "@/contracts/onboarding";
import { serverEnv } from "@/lib/env";
import { resolveFlags } from "@/lib/flags";
import { log } from "@/lib/logger";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAppContext, getCorrelationId } from "./context";

const uuid = z.uuid();

/** Gera IDs externos determinísticos e rotulados para o modo Simulação. */
function simulatedExternalIds(orgId: string, idempotencyKey: string) {
  const digest = createHash("sha256").update(`${orgId}:${idempotencyKey}`).digest("hex").slice(0, 12);
  return {
    externalCampaignId: `sim_camp_${digest}`,
    externalAdsetId: `sim_adset_${digest}`,
  };
}

/**
 * Cria a campanha obrigatoriamente em estado PAUSED.
 * Exige papel `owner` e consentimento explícito de orçamento.
 */
export async function publishPausedCampaign(
  input: unknown,
): Promise<ApiResult<{ campaign_id: string; simulated: boolean }>> {
  const correlationId = await getCorrelationId();
  const parsed = createPausedCampaignSchema.safeParse(input);
  if (!parsed.success) {
    return apiError("validation_failed", "Revise os dados da campanha.", correlationId, fieldErrors(parsed.error));
  }
  const ctx = await getAppContext();
  if (ctx.mode !== "supabase" || !ctx.organization) {
    return apiError("feature_disabled", "Disponível no piloto com conta.", correlationId);
  }
  if (ctx.organization.role !== "owner") {
    return apiError(
      "forbidden",
      "Apenas o proprietário da empresa pode autorizar orçamento e publicar campanhas.",
      correlationId,
    );
  }

  const flags = resolveFlags(serverEnv());
  if (flags.killSwitch) {
    return apiError(
      "feature_disabled",
      "Kill switch ativo: publicações estão temporariamente bloqueadas.",
      correlationId,
    );
  }
  const simulated = !flags.realPublishing || flags.metaMode === "mock";
  // Sem adaptador real da Meta ainda: nunca gravar IDs simulados como campanha real.
  if (!simulated) {
    return apiError("feature_disabled", "Publicação real na Meta ainda não está disponível.", correlationId);
  }
  const { externalCampaignId, externalAdsetId } = simulatedExternalIds(
    ctx.organization.id,
    parsed.data.idempotency_key,
  );

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("publish_campaign_paused", {
    p_org: ctx.organization.id,
    p_strategy: parsed.data.strategy_id,
    p_name: parsed.data.name,
    p_objective: parsed.data.objective,
    p_daily_budget_cents: parsed.data.daily_budget_cents,
    p_duration_days: parsed.data.duration_days,
    p_creative_ids: parsed.data.creative_ids,
    p_idempotency_key: parsed.data.idempotency_key,
    p_external_campaign_id: externalCampaignId,
    p_external_adset_id: externalAdsetId,
    p_simulated: simulated,
    p_correlation_id: correlationId,
  });

  if (error) {
    if (error.code === "42501") {
      return apiError("forbidden", "Apenas o proprietário da empresa pode publicar campanhas.", correlationId);
    }
    if (error.message.includes("meta_not_connected")) {
      return apiError("conflict", "Conecte a conta Meta antes de publicar a campanha.", correlationId);
    }
    if (error.message.includes("creatives_not_approved")) {
      return apiError("conflict", "Todas as peças selecionadas precisam estar aprovadas.", correlationId);
    }
    log("error", "campaigns.publish_paused_failed", { correlation_id: correlationId, code: error.code });
    return apiError("internal", "Não foi possível criar a campanha pausada agora.", correlationId);
  }

  const res = data as { campaign_id: string; replayed: boolean };
  revalidatePath("/app/campanhas", "layout");
  return { ok: true, data: { campaign_id: res.campaign_id, simulated }, correlation_id: correlationId };
}

/**
 * Segunda confirmação humana contextual do `owner`: ativa uma campanha que estava `paused`.
 */
export async function activatePausedCampaign(input: unknown): Promise<ApiResult<{ activated: true }>> {
  const correlationId = await getCorrelationId();
  const parsed = activateCampaignSchema.safeParse(input);
  if (!parsed.success) {
    return apiError(
      "validation_failed",
      "Confirme os dados para ativar a campanha.",
      correlationId,
      fieldErrors(parsed.error),
    );
  }
  const ctx = await getAppContext();
  if (ctx.mode !== "supabase" || !ctx.organization) {
    return apiError("feature_disabled", "Disponível no piloto com conta.", correlationId);
  }
  if (ctx.organization.role !== "owner") {
    return apiError("forbidden", "Apenas o proprietário da empresa pode ativar a veiculação.", correlationId);
  }

  const flags = resolveFlags(serverEnv());
  if (flags.killSwitch) {
    return apiError("feature_disabled", "Kill switch ativo: ativações suspensas.", correlationId);
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("activate_campaign", {
    p_campaign: parsed.data.campaign_id,
    p_confirmed_daily_budget_cents: parsed.data.confirmed_daily_budget_cents,
    p_confirmed_duration_days: parsed.data.confirmed_duration_days,
    p_idempotency_key: parsed.data.idempotency_key,
    p_correlation_id: correlationId,
  });

  if (error) {
    if (error.code === "42501") {
      return apiError("forbidden", "Apenas o proprietário da empresa pode ativar a campanha.", correlationId);
    }
    if (error.message.includes("budget_snapshot_mismatch")) {
      return apiError("conflict", "O orçamento ou duração mudou. Recarregue a página antes de ativar.", correlationId);
    }
    if (error.message.includes("campaign_not_paused")) {
      return apiError("conflict", "Apenas campanhas pausadas podem ser ativadas.", correlationId);
    }
    log("error", "campaigns.activate_failed", { correlation_id: correlationId, code: error.code });
    return apiError("internal", "Não foi possível ativar a campanha agora.", correlationId);
  }

  revalidatePath("/app/campanhas", "layout");
  return { ok: true, data: { activated: true }, correlation_id: correlationId };
}

export async function pauseActiveCampaign(campaignId: unknown): Promise<ApiResult<{ paused: true }>> {
  const correlationId = await getCorrelationId();
  const id = uuid.safeParse(campaignId);
  if (!id.success) return apiError("validation_failed", "Campanha inválida.", correlationId);
  const ctx = await getAppContext();
  if (ctx.mode !== "supabase" || !ctx.organization) {
    return apiError("feature_disabled", "Disponível no piloto com conta.", correlationId);
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("pause_campaign", {
    p_campaign: id.data,
    p_correlation_id: correlationId,
  });
  if (error) {
    if (error.code === "42501") {
      return apiError("forbidden", "Apenas o proprietário ou administrador pode pausar a campanha.", correlationId);
    }
    log("error", "campaigns.pause_failed", { correlation_id: correlationId, code: error.code });
    return apiError("internal", "Não foi possível pausar a campanha agora.", correlationId);
  }

  revalidatePath("/app/campanhas", "layout");
  return { ok: true, data: { paused: true }, correlation_id: correlationId };
}
