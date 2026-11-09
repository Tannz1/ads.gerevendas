"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { apiError, type ApiError, type ApiResult } from "@/contracts/api";
import { operatorMediaTopupSchema } from "@/contracts/billing";
import { registerPoolAccountsSchema, retirePoolAccountSchema } from "@/contracts/meta";
import { fieldErrors } from "@/contracts/onboarding";
import { serverEnv } from "@/lib/env";
import { resolveFlags } from "@/lib/flags";
import { log } from "@/lib/logger";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAppContext, getCorrelationId } from "../context";
import { activateRealCampaign, loadRealCampaignForOperator, withCampaignExecution } from "./campaign-real";
import { MetaError } from "./errors";
import { metaBusinessClient } from "./index";
import { resolveMetaBusinessMode, type ActiveMetaBusinessMode } from "./mode";

type OperatorContext = { correlationId: string; mode: ActiveMetaBusinessMode };

const isApiError = (v: unknown): v is ApiError =>
  typeof v === "object" && v !== null && (v as { ok?: unknown }).ok === false;

async function operatorContext(): Promise<OperatorContext | ApiError> {
  const correlationId = await getCorrelationId();
  const ctx = await getAppContext();
  if (ctx.mode !== "supabase") return apiError("feature_disabled", "Disponível só com conta.", correlationId);
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.rpc("am_i_platform_operator");
  if (data !== true) return apiError("forbidden", "Acesso restrito à equipe GereVendas.", correlationId);
  const env = serverEnv();
  const mode = resolveMetaBusinessMode(env, resolveFlags(env));
  if (mode.kind === "disabled") {
    return apiError(
      "feature_disabled",
      mode.reason === "kill_switch" ? "Kill switch ligado." : `Faltam variáveis: ${(mode.missing ?? []).join(", ")}.`,
      correlationId,
    );
  }
  return { correlationId, mode };
}

function failure(e: unknown, correlationId: string, event: string): ApiError {
  const code = e instanceof MetaError ? e.code : "unknown";
  log("error", event, {
    correlation_id: correlationId,
    code,
    meta_code: e instanceof MetaError ? e.metaCode : undefined,
    meta_subcode: e instanceof MetaError ? e.metaSubcode : undefined,
  });
  return apiError(
    "external_unavailable",
    `A Meta recusou a operação (${code}). Veja os logs pelo correlation_id.`,
    correlationId,
  );
}

/** Contas ativas em BRL da BM que ainda não estão no estoque, para o operador escolher. */
export async function listImportCandidates(): Promise<ApiResult<{ accounts: Array<{ id: string; name: string }> }>> {
  const c = await operatorContext();
  if (isApiError(c)) return c;
  try {
    const all = await metaBusinessClient(c.mode).listBusinessAdAccounts();
    const supabase = await createSupabaseServerClient();
    const { data: known } = await supabase.from("meta_ad_account_pool").select("ad_account_id");
    const knownIds = new Set((known ?? []).map((k: { ad_account_id: string }) => k.ad_account_id));
    const accounts = all
      .filter((a) => a.account_status === 1 && a.currency === "BRL" && !knownIds.has(a.id))
      .map((a) => ({ id: a.id, name: a.name }));
    return { ok: true, data: { accounts }, correlation_id: c.correlationId };
  } catch (e) {
    return failure(e, c.correlationId, "meta.pool_list_failed");
  }
}

/** Registra no estoque as contas escolhidas, conferindo que pertencem à BM. */
export async function registerPoolAccounts(input: unknown): Promise<ApiResult<{ added: number }>> {
  const correlationId = await getCorrelationId();
  const parsed = registerPoolAccountsSchema.safeParse(input);
  if (!parsed.success) {
    return apiError("validation_failed", "Escolha as contas.", correlationId, fieldErrors(parsed.error));
  }
  const c = await operatorContext();
  if (isApiError(c)) return c;
  let accounts;
  try {
    const all = await metaBusinessClient(c.mode).listBusinessAdAccounts();
    const wanted = new Set(parsed.data.ad_account_ids);
    accounts = all.filter((a) => wanted.has(a.id) && a.account_status === 1 && a.currency === "BRL");
  } catch (e) {
    return failure(e, c.correlationId, "meta.pool_register_failed");
  }
  if (accounts.length !== parsed.data.ad_account_ids.length) {
    return apiError("conflict", "Alguma conta não pertence à BM ou não está ativa em BRL.", c.correlationId);
  }
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("register_pool_accounts", {
    p_accounts: accounts.map((a) => ({ ad_account_id: a.id, name: a.name, currency: a.currency })),
    p_simulated: c.mode.kind === "mock",
    p_source: "imported",
    p_correlation_id: c.correlationId,
  });
  if (error) {
    log("error", "meta.pool_register_rpc_failed", { correlation_id: c.correlationId, code: error.code });
    return apiError("internal", "Não foi possível registrar as contas.", c.correlationId);
  }
  revalidatePath("/app/operador/estoque");
  return { ok: true, data: { added: data as number }, correlation_id: c.correlationId };
}

/** Cria 1 conta pela API (a Meta permite até 5 por BM) e registra no estoque. */
export async function createPoolAccount(): Promise<ApiResult<{ ad_account_id: string }>> {
  const c = await operatorContext();
  if (isApiError(c)) return c;
  let account;
  try {
    const name = `GereVendas Ads — estoque ${new Date().toISOString().slice(0, 10)}`;
    account = await metaBusinessClient(c.mode).createAdAccount({ name });
  } catch (e) {
    if (e instanceof MetaError && e.code === "config_missing") {
      return apiError(
        "feature_disabled",
        "Defina META_AD_ACCOUNT_TIMEZONE_ID para criar contas pela API.",
        c.correlationId,
      );
    }
    return failure(e, c.correlationId, "meta.pool_create_failed");
  }
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("register_pool_accounts", {
    p_accounts: [{ ad_account_id: account.id, name: account.name, currency: account.currency }],
    p_simulated: c.mode.kind === "mock",
    p_source: "api",
    p_correlation_id: c.correlationId,
  });
  if (error) {
    // A conta existe na Meta: registrar pelo "Buscar contas da BM" recupera.
    log("error", "meta.pool_create_rpc_failed", {
      correlation_id: c.correlationId,
      code: error.code,
      ad_account_id: account.id,
    });
    return apiError(
      "internal",
      `Conta ${account.id} criada na Meta, mas não registrada. Use Buscar contas da BM.`,
      c.correlationId,
    );
  }
  revalidatePath("/app/operador/estoque");
  return { ok: true, data: { ad_account_id: account.id }, correlation_id: c.correlationId };
}

export async function retirePoolAccount(input: unknown): Promise<ApiResult<{ retired: true }>> {
  const correlationId = await getCorrelationId();
  const parsed = retirePoolAccountSchema.safeParse(input);
  if (!parsed.success) return apiError("validation_failed", "Conta inválida.", correlationId);
  const c = await operatorContext();
  if (isApiError(c)) return c;
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("retire_pool_account", {
    p_id: parsed.data.id,
    p_correlation_id: c.correlationId,
  });
  if (error) {
    if (error.message.includes("not_available")) {
      return apiError("conflict", "Só contas livres podem ser aposentadas.", c.correlationId);
    }
    log("error", "meta.pool_retire_failed", { correlation_id: c.correlationId, code: error.code });
    return apiError("internal", "Não foi possível aposentar a conta.", c.correlationId);
  }
  revalidatePath("/app/operador/estoque");
  return { ok: true, data: { retired: true }, correlation_id: c.correlationId };
}

/** Operador confirma recebimento de saldo de mídia de um cliente e já financia campanhas aguardando verba. */
export async function operatorAddClientMediaBalance(
  input: unknown,
): Promise<ApiResult<{ balance_cents: number; auto_funded_campaigns: number }>> {
  const correlationId = await getCorrelationId();
  const parsed = operatorMediaTopupSchema.safeParse(input);
  if (!parsed.success) {
    return apiError(
      "validation_failed",
      "Revise os dados do crédito de mídia.",
      correlationId,
      fieldErrors(parsed.error),
    );
  }
  const c = await operatorContext();
  if (isApiError(c)) return c;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("add_media_balance", {
    p_org: parsed.data.organization_id,
    p_amount_cents: parsed.data.amount_cents,
    p_provider: "operator",
    p_external_reference: parsed.data.external_reference,
    p_simulated: c.mode.kind === "mock",
    p_correlation_id: c.correlationId,
  });
  if (error) {
    log("error", "meta.operator_topup_failed", { correlation_id: c.correlationId, code: error.code });
    return apiError("internal", "Não foi possível creditar o saldo de mídia do cliente.", c.correlationId);
  }
  revalidatePath("/app/operador/estoque");
  revalidatePath("/app", "layout");
  const res = data as { balance_cents: number; funded_campaigns: number };
  return {
    ok: true,
    data: { balance_cents: res.balance_cents, auto_funded_campaigns: res.funded_campaigns },
    correlation_id: c.correlationId,
  };
}

const operatorActivateSchema = z.object({
  campaign_id: z.uuid(),
});

/** Operador ativa campanha de cliente na conta compartilhada depois que a verba está financiada (`funded`). */
export async function operatorActivateSharedCampaign(input: unknown): Promise<ApiResult<{ activated: true }>> {
  const correlationId = await getCorrelationId();
  const parsed = operatorActivateSchema.safeParse(input);
  if (!parsed.success) {
    return apiError("validation_failed", "Campanha inválida.", correlationId);
  }
  const c = await operatorContext();
  if (isApiError(c)) return c;
  const ctx = await getAppContext();
  if (ctx.mode !== "supabase") {
    return apiError("feature_disabled", "Disponível só com conta.", c.correlationId);
  }
  const campaign = await loadRealCampaignForOperator(parsed.data.campaign_id);
  if (!campaign) return apiError("not_found", "Campanha não encontrada.", c.correlationId);
  if (campaign.status !== "paused") {
    return apiError("conflict", "Apenas campanhas pausadas podem ser ativadas.", c.correlationId);
  }

  let error: { code?: string; message: string } | null = null;
  if (campaign.simulated) {
    const supabase = await createSupabaseServerClient();
    ({ error } = await supabase.rpc("activate_campaign", {
      p_campaign: campaign.id,
      p_confirmed_daily_budget_cents: campaign.daily_budget_cents,
      p_confirmed_duration_days: campaign.duration_days,
      p_idempotency_key: `op_activate_${campaign.id}_${randomUUID().slice(0, 8)}`,
      p_correlation_id: c.correlationId,
    }));
  } else {
    if (c.mode.kind !== "real") {
      return apiError("feature_disabled", "Publicação real suspensa no momento.", c.correlationId);
    }
    try {
      ({ error } = await withCampaignExecution(campaign.id, async () => {
        const current = await loadRealCampaignForOperator(campaign.id);
        if (!current || current.status !== "paused") {
          return { error: { message: "campaign_not_paused" } };
        }
        return activateRealCampaign(
          current,
          ctx.user.id,
          {
            confirmed_daily_budget_cents: current.daily_budget_cents,
            confirmed_duration_days: current.duration_days,
            idempotency_key: `op_activate_${current.id}_${randomUUID().slice(0, 8)}`,
          },
          metaBusinessClient(c.mode),
          c.correlationId,
        );
      }));
    } catch (e) {
      return failure(e, c.correlationId, "meta.operator_activate_failed");
    }
  }

  if (error) {
    if (error.message.includes("media_funding_required")) {
      return apiError("conflict", "Confirme o saldo da verba de mídia antes de ativar a campanha.", c.correlationId);
    }
    if (error.message.includes("campaign_not_paused")) {
      return apiError("conflict", "Apenas campanhas pausadas podem ser ativadas.", c.correlationId);
    }
    log("error", "meta.operator_activate_rpc_failed", { correlation_id: c.correlationId, code: error.code });
    return apiError("internal", "Não foi possível ativar a campanha do cliente.", c.correlationId);
  }

  revalidatePath("/app/operador/estoque");
  revalidatePath("/app", "layout");
  return { ok: true, data: { activated: true }, correlation_id: c.correlationId };
}
