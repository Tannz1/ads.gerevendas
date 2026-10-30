"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { apiError, type ApiError, type ApiResult } from "@/contracts/api";
import { activateCampaignSchema, createPausedCampaignSchema } from "@/contracts/campaigns";
import { fieldErrors } from "@/contracts/onboarding";
import { serverEnv } from "@/lib/env";
import { resolveFlags } from "@/lib/flags";
import { log } from "@/lib/logger";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAppContext, getCorrelationId } from "./context";
import {
  withCampaignExecution,
  activateRealCampaign,
  loadRealCampaign,
  pauseRealCampaign,
  publishRealCampaign,
  syncRealCampaign,
} from "./meta/campaign-real";
import { loadMetaConnection } from "./campaigns-data";
import { MetaError } from "./meta/errors";
import { isPlatformOperator } from "./meta/data";
import { metaBusinessClient } from "./meta/index";
import { resolveMetaBusinessMode, resolveMetaStopMode } from "./meta/mode";
import { PublishError, type PublishErrorCode } from "./meta/publish";

const uuid = z.uuid();

/** Gera IDs externos determinísticos e rotulados para o modo Simulação. */
function simulatedExternalIds(orgId: string, idempotencyKey: string) {
  const digest = createHash("sha256").update(`${orgId}:${idempotencyKey}`).digest("hex").slice(0, 12);
  return {
    externalCampaignId: `sim_camp_${digest}`,
    externalAdsetId: `sim_adset_${digest}`,
  };
}

const PUBLISH_ERROR_MESSAGES: Record<PublishErrorCode, string> = {
  missing_website: "Este objetivo leva ao seu site, mas o cadastro não tem site. Adicione em Meu negócio.",
  missing_whatsapp: "Este objetivo leva ao seu WhatsApp, mas o cadastro não tem WhatsApp. Adicione em Meu negócio.",
  missing_instagram: "Este objetivo leva ao seu Instagram, mas o cadastro não tem o @. Adicione em Meu negócio.",
  missing_destination: "Adicione site, WhatsApp ou Instagram em Meu negócio para o anúncio ter para onde levar.",
  city_not_found: "A Meta não encontrou a cidade do seu cadastro. Confira a cidade e o estado em Meu negócio.",
  video_processing: "A Meta ainda está processando o vídeo. Aguarde alguns minutos e retome a publicação.",
  video_failed: "A Meta não aceitou o vídeo de uma das peças. Fale com o suporte para revisar a publicação.",
};

/** Mensagem para o cliente quando a publicação na Meta parou no meio (a campanha fica salva para retomar). */
function publishFailureMessage(e: unknown, correlationId: string): string {
  if (
    e instanceof Error &&
    (e.message === "campaign_execution_busy" || e.message.includes("publication_reconciliation_required"))
  ) {
    return "A publicação aguarda conferência dos objetos já enviados à Meta. Fale com o suporte antes de tentar novamente.";
  }
  if (e instanceof PublishError) return PUBLISH_ERROR_MESSAGES[e.code];
  if (e instanceof MetaError) {
    log(e.code === "rate_limited" ? "warn" : "error", "campaigns.real_publish_failed", {
      correlation_id: correlationId,
      code: e.code,
      meta_code: e.metaCode,
      meta_subcode: e.metaSubcode,
    });
    return e.code === "rate_limited"
      ? "A Meta pediu uma pausa. Tente retomar a publicação em alguns minutos."
      : "A Meta não aceitou parte da publicação agora. Tente retomar em instantes.";
  }
  log("error", "campaigns.real_publish_failed", {
    correlation_id: correlationId,
    error: e instanceof Error ? e.message : "unknown",
  });
  return "A publicação parou no meio. Tente retomar em instantes.";
}

function realMetaError(e: unknown, correlationId: string, event: string): ApiError {
  if (e instanceof Error && e.message === "campaign_execution_busy") {
    return apiError(
      "conflict",
      "Esta campanha tem uma operação em andamento ou aguardando conferência. Se precisar interromper a veiculação agora, pause no Gerenciador de Anúncios da Meta.",
      correlationId,
    );
  }
  if (e instanceof Error && e.message === "activation_recovery_required") {
    log("error", "campaigns.activation_recovery_required", { correlation_id: correlationId });
    return apiError(
      "external_unavailable",
      "Não foi possível confirmar a pausa após uma falha. Confira e pause a campanha no Gerenciador de Anúncios da Meta e fale com o suporte.",
      correlationId,
    );
  }
  log("error", event, {
    correlation_id: correlationId,
    code: e instanceof MetaError ? e.code : "unknown",
    meta_code: e instanceof MetaError ? e.metaCode : undefined,
  });
  return apiError(
    "external_unavailable",
    "Não conseguimos falar com a Meta agora. Tente de novo em instantes.",
    correlationId,
  );
}

/**
 * Cria a campanha obrigatoriamente em estado PAUSED.
 * Exige papel `owner` e consentimento explícito de orçamento.
 * Em modo real (FEATURE_FLAG_REAL_PUBLISHING + BM configurada) cria de fato na conta do cliente (ADR 0006).
 */
export async function publishPausedCampaign(
  input: unknown,
): Promise<ApiResult<{ campaign_id: string; simulated: boolean; warning?: string }>> {
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

  const env = serverEnv();
  const flags = resolveFlags(env);
  if (flags.killSwitch) {
    return apiError(
      "feature_disabled",
      "Kill switch ativo: publicações estão temporariamente bloqueadas.",
      correlationId,
    );
  }
  const mode = resolveMetaBusinessMode(env, flags);
  const supabase = await createSupabaseServerClient();

  if (flags.realPublishing && mode.kind !== "real") {
    return apiError(
      "feature_disabled",
      "A publicação real não está configurada. Confira a integração antes de publicar.",
      correlationId,
    );
  }

  if (flags.realPublishing && mode.kind === "real") {
    const { data, error } = await supabase.rpc("start_real_publication", {
      p_org: ctx.organization.id,
      p_strategy: parsed.data.strategy_id,
      p_name: parsed.data.name,
      p_objective: parsed.data.objective,
      p_daily_budget_cents: parsed.data.daily_budget_cents,
      p_duration_days: parsed.data.duration_days,
      p_creative_ids: parsed.data.creative_ids,
      p_idempotency_key: parsed.data.idempotency_key,
      p_correlation_id: correlationId,
    });
    if (error) return publishRpcError(error, correlationId);
    const campaignId = (data as { campaign_id: string }).campaign_id;
    let warning: string | undefined;
    try {
      await withCampaignExecution(campaignId, () =>
        publishRealCampaign(campaignId, metaBusinessClient(mode), correlationId),
      );
    } catch (e) {
      warning = publishFailureMessage(e, correlationId);
    }
    revalidatePath("/app/campanhas", "layout");
    return { ok: true, data: { campaign_id: campaignId, simulated: false, warning }, correlation_id: correlationId };
  }

  const { externalCampaignId, externalAdsetId } = simulatedExternalIds(
    ctx.organization.id,
    parsed.data.idempotency_key,
  );
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
    p_simulated: true,
    p_correlation_id: correlationId,
  });
  if (error) return publishRpcError(error, correlationId);

  const res = data as { campaign_id: string; replayed: boolean };
  revalidatePath("/app/campanhas", "layout");
  return { ok: true, data: { campaign_id: res.campaign_id, simulated: true }, correlation_id: correlationId };
}

function publishRpcError(error: { code?: string; message: string }, correlationId: string): ApiError {
  if (error.code === "42501") {
    return apiError("forbidden", "Apenas o proprietário da empresa pode publicar campanhas.", correlationId);
  }
  if (error.message.includes("meta_not_connected")) {
    return apiError("conflict", "Conclua os 4 passos em Conexões antes de publicar a campanha.", correlationId);
  }
  if (error.message.includes("meta_connection_simulated")) {
    return apiError("conflict", "Sua conexão Meta é de Simulação. Refaça a conexão em Conexões.", correlationId);
  }
  if (error.message.includes("creatives_not_approved")) {
    return apiError("conflict", "Todas as peças selecionadas precisam estar aprovadas.", correlationId);
  }
  log("error", "campaigns.publish_paused_failed", { correlation_id: correlationId, code: error.code });
  return apiError("internal", "Não foi possível criar a campanha pausada agora.", correlationId);
}

/** Retoma uma publicação real que parou no meio (só cria o que ainda não tem ID na Meta). */
export async function resumeRealPublication(
  campaignId: unknown,
): Promise<ApiResult<{ completed: boolean; warning?: string }>> {
  const correlationId = await getCorrelationId();
  const id = uuid.safeParse(campaignId);
  if (!id.success) return apiError("validation_failed", "Campanha inválida.", correlationId);
  const ctx = await getAppContext();
  if (ctx.mode !== "supabase" || !ctx.organization) {
    return apiError("feature_disabled", "Disponível no piloto com conta.", correlationId);
  }
  if (ctx.organization.role !== "owner") {
    return apiError("forbidden", "Apenas o proprietário pode retomar a publicação.", correlationId);
  }
  const env = serverEnv();
  const flags = resolveFlags(env);
  const mode = resolveMetaBusinessMode(env, flags);
  if (!flags.realPublishing || mode.kind !== "real") {
    return apiError("feature_disabled", "Publicação real suspensa no momento.", correlationId);
  }
  const campaign = await loadRealCampaign(id.data);
  if (!campaign || campaign.simulated) return apiError("not_found", "Campanha não encontrada.", correlationId);
  if (campaign.status !== "draft") return { ok: true, data: { completed: true }, correlation_id: correlationId };

  try {
    await withCampaignExecution(campaign.id, () =>
      publishRealCampaign(campaign.id, metaBusinessClient(mode), correlationId),
    );
  } catch (e) {
    revalidatePath("/app/campanhas", "layout");
    return {
      ok: true,
      data: { completed: false, warning: publishFailureMessage(e, correlationId) },
      correlation_id: correlationId,
    };
  }
  revalidatePath("/app/campanhas", "layout");
  return { ok: true, data: { completed: true }, correlation_id: correlationId };
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

  const env = serverEnv();
  const flags = resolveFlags(env);
  if (flags.killSwitch) {
    return apiError("feature_disabled", "Kill switch ativo: ativações suspensas.", correlationId);
  }

  const campaign = await loadRealCampaign(parsed.data.campaign_id);
  if (!campaign) return apiError("not_found", "Campanha não encontrada.", correlationId);

  let error: { code?: string; message: string } | null;
  if (campaign.simulated) {
    const supabase = await createSupabaseServerClient();
    ({ error } = await supabase.rpc("activate_campaign", {
      p_campaign: parsed.data.campaign_id,
      p_confirmed_daily_budget_cents: parsed.data.confirmed_daily_budget_cents,
      p_confirmed_duration_days: parsed.data.confirmed_duration_days,
      p_idempotency_key: parsed.data.idempotency_key,
      p_correlation_id: correlationId,
    }));
  } else {
    const mode = resolveMetaBusinessMode(env, flags);
    if (!flags.realPublishing || mode.kind !== "real") {
      return apiError("feature_disabled", "Publicação real suspensa no momento.", correlationId);
    }
    // Conta compartilhada (ADR 0009): a verba sai do cartão da GereVendas, então só a equipe ativa,
    // depois de confirmar o pagamento da verba pelo cliente.
    // ponytail: equipe precisa ser owner da empresa; ativar empresas de clientes vem com a cobrança da verba.
    if (env.META_SHARED_AD_ACCOUNT_ID && !(await isPlatformOperator())) {
      return apiError(
        "forbidden",
        "A GereVendas ativa a campanha assim que confirmar o pagamento da verba de mídia.",
        correlationId,
      );
    }
    // Confere antes de mexer na Meta; o banco confere de novo dentro da transação.
    if (campaign.status !== "paused") {
      return apiError("conflict", "Apenas campanhas pausadas podem ser ativadas.", correlationId);
    }
    if (
      campaign.daily_budget_cents !== parsed.data.confirmed_daily_budget_cents ||
      campaign.duration_days !== parsed.data.confirmed_duration_days
    ) {
      return apiError("conflict", "O orçamento ou duração mudou. Recarregue a página antes de ativar.", correlationId);
    }
    try {
      ({ error } = await withCampaignExecution(campaign.id, async () => {
        const current = await loadRealCampaign(campaign.id);
        if (
          !current ||
          current.status !== "paused" ||
          current.daily_budget_cents !== parsed.data.confirmed_daily_budget_cents ||
          current.duration_days !== parsed.data.confirmed_duration_days
        ) {
          return { error: { message: "budget_snapshot_mismatch" } };
        }
        const connection = await loadMetaConnection(ctx.organization!.id);
        if (!connection || connection.simulated || connection.status !== "connected") {
          return { error: { message: "meta_not_connected" } };
        }
        return activateRealCampaign(current, ctx.user.id, parsed.data, metaBusinessClient(mode), correlationId);
      }));
    } catch (e) {
      return realMetaError(e, correlationId, "campaigns.real_activate_failed");
    }
  }

  if (error) {
    if (error.code === "42501") {
      return apiError("forbidden", "Apenas o proprietário da empresa pode ativar a campanha.", correlationId);
    }
    if (error.message.includes("budget_snapshot_mismatch")) {
      return apiError("conflict", "O orçamento ou duração mudou. Recarregue a página antes de ativar.", correlationId);
    }
    if (error.message.includes("idempotency_conflict")) {
      return apiError(
        "conflict",
        "Esta autorização já foi usada. Recarregue a página e confirme uma nova ativação.",
        correlationId,
      );
    }
    if (error.message.includes("campaign_not_paused")) {
      return apiError("conflict", "Apenas campanhas pausadas podem ser ativadas.", correlationId);
    }
    if (error.message.includes("meta_not_connected")) {
      return apiError("conflict", "Confira os passos da sua conta em Conexões antes de ativar.", correlationId);
    }
    if (error.message.includes("publication_incomplete")) {
      return apiError("conflict", "Conclua a publicação antes de ativar.", correlationId);
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

  const campaign = await loadRealCampaign(id.data);
  if (!campaign) return apiError("not_found", "Campanha não encontrada.", correlationId);

  let error: { code?: string; message: string } | null;
  if (campaign.simulated) {
    const supabase = await createSupabaseServerClient();
    ({ error } = await supabase.rpc("pause_campaign", { p_campaign: id.data, p_correlation_id: correlationId }));
  } else {
    if (ctx.organization.role !== "owner" && ctx.organization.role !== "admin") {
      return apiError("forbidden", "Apenas o proprietário ou administrador pode pausar a campanha.", correlationId);
    }
    // Pausar reduz gasto: funciona mesmo com kill switch ligado.
    const mode = resolveMetaStopMode(serverEnv());
    if (!mode) return apiError("feature_disabled", "A integração com a Meta não está configurada.", correlationId);
    try {
      ({ error } = await withCampaignExecution(campaign.id, () =>
        pauseRealCampaign(campaign, ctx.user.id, metaBusinessClient(mode), correlationId),
      ));
    } catch (e) {
      return realMetaError(e, correlationId, "campaigns.real_pause_failed");
    }
  }

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

/** Atualiza status de revisão e métricas a partir da Meta (no máximo 1 vez por minuto por campanha). */
export async function syncCampaignFromMeta(campaignId: unknown): Promise<ApiResult<{ synced: boolean }>> {
  const correlationId = await getCorrelationId();
  const id = uuid.safeParse(campaignId);
  if (!id.success) return apiError("validation_failed", "Campanha inválida.", correlationId);
  const ctx = await getAppContext();
  if (ctx.mode !== "supabase" || !ctx.organization) {
    return apiError("feature_disabled", "Disponível no piloto com conta.", correlationId);
  }
  const campaign = await loadRealCampaign(id.data);
  if (!campaign) return apiError("not_found", "Campanha não encontrada.", correlationId);
  if (campaign.simulated) return { ok: true, data: { synced: false }, correlation_id: correlationId };

  const mode = resolveMetaStopMode(serverEnv());
  if (!mode) return apiError("feature_disabled", "A integração com a Meta não está configurada.", correlationId);
  try {
    const synced = await syncRealCampaign(campaign, metaBusinessClient(mode));
    if (synced) revalidatePath(`/app/campanhas/${campaign.id}`);
    return { ok: true, data: { synced }, correlation_id: correlationId };
  } catch (e) {
    return realMetaError(e, correlationId, "campaigns.sync_failed");
  }
}

/** Atualiza até 20 campanhas da organização atual, começando pelas mais antigas. */
export async function refreshDashboardMetrics(): Promise<ApiResult<{ synced: number; failed: number }>> {
  const correlationId = await getCorrelationId();
  const ctx = await getAppContext();
  if (ctx.mode !== "supabase" || !ctx.organization) {
    return apiError("feature_disabled", "Entre com sua conta para atualizar as métricas.", correlationId);
  }
  const mode = resolveMetaStopMode(serverEnv());
  if (!mode) return apiError("feature_disabled", "A integração com a Meta não está configurada.", correlationId);
  const db = await createSupabaseServerClient();
  const { data, error } = await db
    .from("campaigns")
    .select("id")
    .eq("organization_id", ctx.organization.id)
    .eq("simulated", false)
    .neq("status", "draft")
    .order("last_synced_at", { ascending: true, nullsFirst: true })
    .limit(20);
  if (error) return apiError("internal", "Não foi possível carregar suas campanhas.", correlationId);
  let synced = 0;
  let failed = 0;
  for (const row of data ?? []) {
    try {
      const campaign = await loadRealCampaign(row.id);
      if (campaign && (await syncRealCampaign(campaign, metaBusinessClient(mode)))) synced++;
    } catch (e) {
      failed++;
      realMetaError(e, correlationId, "dashboard.sync_failed");
    }
  }
  revalidatePath("/app/painel");
  revalidatePath("/app/campanhas", "layout");
  return { ok: true, data: { synced, failed }, correlation_id: correlationId };
}
