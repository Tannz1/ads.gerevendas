"use server";

import { revalidatePath } from "next/cache";
import { apiError, type ApiError, type ApiResult } from "@/contracts/api";
import { linkPageSchema, sendInviteSchema } from "@/contracts/meta";
import { fieldErrors } from "@/contracts/onboarding";
import { serverEnv } from "@/lib/env";
import { resolveFlags } from "@/lib/flags";
import { log } from "@/lib/logger";
import { parsePageLink } from "@/lib/meta-page-link";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAppContext, getCorrelationId } from "../context";
import { loadMetaOnboarding } from "./data";
import { MetaError } from "./errors";
import { metaBusinessClient } from "./index";
import { resolveMetaBusinessMode, type ActiveMetaBusinessMode } from "./mode";
import { computeSteps } from "./steps";

type OwnerContext = {
  orgId: string;
  orgName: string;
  correlationId: string;
  mode: ActiveMetaBusinessMode;
};

const isApiError = (v: unknown): v is ApiError =>
  typeof v === "object" && v !== null && (v as { ok?: unknown }).ok === false;

async function ownerContext(): Promise<OwnerContext | ApiError> {
  const correlationId = await getCorrelationId();
  const ctx = await getAppContext();
  if (ctx.mode !== "supabase" || !ctx.organization) {
    return apiError("feature_disabled", "Disponível no piloto com conta.", correlationId);
  }
  if (ctx.organization.role !== "owner") {
    return apiError("forbidden", "Apenas o proprietário da empresa pode conectar a Meta.", correlationId);
  }
  const env = serverEnv();
  const mode = resolveMetaBusinessMode(env, resolveFlags(env));
  if (mode.kind === "disabled") {
    if (mode.reason === "config_missing") {
      log("error", "meta.config_missing", { correlation_id: correlationId, missing: mode.missing });
      return apiError(
        "feature_disabled",
        "A integração com a Meta não está configurada. Nossa equipe foi avisada.",
        correlationId,
      );
    }
    return apiError("feature_disabled", "Integração com a Meta suspensa temporariamente.", correlationId);
  }
  return { orgId: ctx.organization.id, orgName: ctx.organization.name, correlationId, mode };
}

function metaFailure(e: unknown, correlationId: string, event: string): ApiError {
  if (e instanceof MetaError) {
    log(e.code === "rate_limited" ? "warn" : "error", event, {
      correlation_id: correlationId,
      code: e.code,
      meta_code: e.metaCode,
      meta_subcode: e.metaSubcode,
    });
    if (e.code === "rate_limited") {
      return apiError("external_unavailable", "A Meta pediu uma pausa. Tente de novo em alguns minutos.", correlationId);
    }
    return apiError("external_unavailable", "Não conseguimos falar com a Meta agora. Tente de novo em instantes.", correlationId);
  }
  log("error", event, { correlation_id: correlationId, error: e instanceof Error ? e.message : "unknown" });
  return apiError("internal", "Algo deu errado. Tente de novo.", correlationId);
}

async function rpcOrThrow(promise: PromiseLike<{ error: { message: string; code?: string } | null }>) {
  const { error } = await promise;
  if (error) throw new Error(`rpc_failed:${error.code ?? "unknown"}:${error.message}`);
}

function done<T>(data: T, correlationId: string): ApiResult<T> {
  revalidatePath("/app/conexoes");
  revalidatePath("/app/campanhas", "layout");
  return { ok: true, data, correlation_id: correlationId };
}

/** Passo 1: reserva uma conta do estoque e, se nova, renomeia na Meta com o nome do negócio. */
export async function requestAdAccount(): Promise<ApiResult<{ pool_empty: boolean }>> {
  const c = await ownerContext();
  if (isApiError(c)) return c;

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("assign_pool_account", {
    p_org: c.orgId,
    p_simulated: c.mode.kind === "mock",
    p_correlation_id: c.correlationId,
  });
  if (error) {
    if (error.code === "42501") return apiError("forbidden", "Sem permissão para reservar a conta.", c.correlationId);
    log("error", "meta.assign_failed", { correlation_id: c.correlationId, code: error.code });
    return apiError("internal", "Não foi possível reservar sua conta agora.", c.correlationId);
  }

  const res = data as { pool_empty: boolean; ad_account_id?: string; newly_assigned?: boolean };
  if (res.newly_assigned && res.ad_account_id) {
    const name = `${c.orgName} — GereVendas Ads`.slice(0, 120);
    try {
      await metaBusinessClient(c.mode).renameAdAccount(res.ad_account_id, name);
      await rpcOrThrow(
        createSupabaseAdminClient().rpc("meta_set_ad_account_name", {
          p_org: c.orgId,
          p_name: name,
          p_correlation_id: c.correlationId,
        }),
      );
    } catch (e) {
      // O nome é só identificação: a conta já é do cliente mesmo se a renomeação falhar.
      log("warn", "meta.rename_failed", {
        correlation_id: c.correlationId,
        code: e instanceof MetaError ? e.code : "rpc",
      });
    }
  }
  return done({ pool_empty: res.pool_empty }, c.correlationId);
}

/** Passo 2: confere na BM se a Página (e o Instagram) do link foram compartilhados e vincula. */
export async function linkMetaPage(
  input: unknown,
): Promise<ApiResult<{ page_name: string; instagram: "linked" | "not_found" | "taken" | "skipped" }>> {
  const correlationId = await getCorrelationId();
  const parsed = linkPageSchema.safeParse(input);
  if (!parsed.success) {
    return apiError("validation_failed", "Revise o link e o @.", correlationId, fieldErrors(parsed.error));
  }
  const c = await ownerContext();
  if (isApiError(c)) return c;

  const ref = parsePageLink(parsed.data.page_url);
  if (!ref) {
    return apiError(
      "validation_failed",
      "Esse link não é de uma Página do Facebook. Abra sua Página e copie o endereço da barra do navegador.",
      c.correlationId,
      { page_url: ["Link de Página inválido"] },
    );
  }

  const admin = createSupabaseAdminClient();
  const attempt = await admin.rpc("meta_link_attempt", { p_org: c.orgId });
  if (attempt.error) {
    log("error", "meta.link_attempt_failed", { correlation_id: c.correlationId, code: attempt.error.code });
    return apiError("internal", "Algo deu errado. Tente de novo.", c.correlationId);
  }
  if (attempt.data !== true) {
    return apiError("conflict", "Muitas tentativas seguidas. Espere alguns minutos e tente de novo.", c.correlationId);
  }

  const client = metaBusinessClient(c.mode);
  let page;
  try {
    page = await client.findClientPage(ref);
  } catch (e) {
    return metaFailure(e, c.correlationId, "meta.find_page_failed");
  }
  if (!page) {
    return apiError(
      "not_found",
      "Ainda não recebemos o compartilhamento dessa Página. Confira o passo a passo e tente de novo em 1 minuto.",
      c.correlationId,
    );
  }

  const setPage = await admin.rpc("meta_set_page", {
    p_org: c.orgId,
    p_status: "done",
    p_page_id: page.id,
    p_page_name: page.name,
    p_correlation_id: c.correlationId,
  });
  if (setPage.error) {
    if (setPage.error.message.includes("page_already_linked")) {
      return apiError(
        "conflict",
        "Esta Página já está ligada a outra empresa no GereVendas Ads. Fale com o suporte.",
        c.correlationId,
      );
    }
    if (setPage.error.message.includes("connection_not_found")) {
      return apiError("conflict", "Reserve sua conta de anúncios antes de ligar a Página.", c.correlationId);
    }
    log("error", "meta.set_page_failed", { correlation_id: c.correlationId, code: setPage.error.code });
    return apiError("internal", "Não foi possível salvar a Página agora.", c.correlationId);
  }

  const instagram = parsed.data.instagram_username
    ? await attachInstagram(c, parsed.data.instagram_username)
    : "skipped";
  return done({ page_name: page.name, instagram }, c.correlationId);
}

/** Procura o @ entre os Instagram compartilhados com a BM e vincula. Falhas não desfazem a Página. */
async function attachInstagram(c: OwnerContext, username: string): Promise<"linked" | "not_found" | "taken"> {
  try {
    const ig = await metaBusinessClient(c.mode).findClientInstagram(username);
    if (!ig) return "not_found";
    const setIg = await createSupabaseAdminClient().rpc("meta_set_instagram", {
      p_org: c.orgId,
      p_status: "done",
      p_instagram_id: ig.id,
      p_correlation_id: c.correlationId,
    });
    if (setIg.error?.message.includes("instagram_already_linked")) return "taken";
    if (setIg.error) throw new Error(`rpc_failed:${setIg.error.code}`);
    return "linked";
  } catch (e) {
    log("warn", "meta.find_instagram_failed", {
      correlation_id: c.correlationId,
      code: e instanceof MetaError ? e.code : "rpc",
    });
    return "not_found";
  }
}

/** Liga o Instagram depois, quando a Página já está conectada. */
export async function linkMetaInstagram(
  input: unknown,
): Promise<ApiResult<{ instagram: "linked" | "not_found" | "taken" }>> {
  const correlationId = await getCorrelationId();
  const parsed = linkPageSchema.pick({ instagram_username: true }).safeParse(input);
  if (!parsed.success || !parsed.data.instagram_username) {
    return apiError("validation_failed", "Digite o @ do Instagram.", correlationId);
  }
  const c = await ownerContext();
  if (isApiError(c)) return c;
  const row = await loadMetaOnboarding(c.orgId);
  if (row?.page_access_status !== "done") {
    return apiError("conflict", "Conecte a Página antes do Instagram.", c.correlationId);
  }
  const instagram = await attachInstagram(c, parsed.data.instagram_username);
  return done({ instagram }, c.correlationId);
}

/** Passo 3: convida o e-mail do dono para a BM (para ele virar admin da própria conta). */
export async function sendMetaInvite(input: unknown): Promise<ApiResult<{ sent: true }>> {
  const correlationId = await getCorrelationId();
  const parsed = sendInviteSchema.safeParse(input);
  if (!parsed.success) {
    return apiError("validation_failed", "Informe um e-mail válido.", correlationId, fieldErrors(parsed.error));
  }
  const c = await ownerContext();
  if (isApiError(c)) return c;

  const row = await loadMetaOnboarding(c.orgId);
  const invite = computeSteps(row).find((s) => s.key === "invite");
  if (!row || invite?.state === "locked" || invite?.state === "done") {
    return apiError("conflict", "Conclua os passos anteriores primeiro.", c.correlationId);
  }

  try {
    await metaBusinessClient(c.mode).inviteBusinessUser(parsed.data.email);
    await rpcOrThrow(
      createSupabaseAdminClient().rpc("meta_set_invite", {
        p_org: c.orgId,
        p_status: "pending",
        p_email: parsed.data.email,
        p_business_user_id: null,
        p_correlation_id: c.correlationId,
      }),
    );
  } catch (e) {
    return metaFailure(e, c.correlationId, "meta.invite_failed");
  }
  return done({ sent: true }, c.correlationId);
}

/** Confere na Meta o que estava aguardando: estoque, convite aceito e forma de pagamento. */
export async function refreshMetaStatus(): Promise<ApiResult<{ checked: boolean; changed: boolean }>> {
  const c = await ownerContext();
  if (isApiError(c)) return c;

  const row = await loadMetaOnboarding(c.orgId);
  if (row && row.ad_account_status !== "done") {
    const assigned = await requestAdAccount();
    if (!assigned.ok) return assigned;
    return done({ checked: true, changed: !assigned.data.pool_empty }, c.correlationId);
  }
  if (!row?.ad_account_id) return done({ checked: false, changed: false }, c.correlationId);

  const admin = createSupabaseAdminClient();
  const touch = await admin.rpc("meta_touch_checked", { p_org: c.orgId, p_min_interval_seconds: 15 });
  if (touch.error) {
    log("error", "meta.touch_failed", { correlation_id: c.correlationId, code: touch.error.code });
    return apiError("internal", "Algo deu errado. Tente de novo.", c.correlationId);
  }
  if (touch.data !== true) return done({ checked: false, changed: false }, c.correlationId);

  const client = metaBusinessClient(c.mode);
  let changed = false;
  let inviteAccepted = row.client_invite_status === "accepted";
  try {
    if (row.client_invite_status === "pending" && row.client_invite_email) {
      const inv = await client.getBusinessUserInvite(row.client_invite_email);
      if (inv.status === "accepted" && inv.business_user_id) {
        await client.assignAdAccountUser(row.ad_account_id, inv.business_user_id);
        await rpcOrThrow(
          admin.rpc("meta_set_invite", {
            p_org: c.orgId,
            p_status: "accepted",
            p_email: null,
            p_business_user_id: inv.business_user_id,
            p_correlation_id: c.correlationId,
          }),
        );
        inviteAccepted = true;
        changed = true;
      } else if (inv.status === "expired") {
        await rpcOrThrow(
          admin.rpc("meta_set_invite", {
            p_org: c.orgId,
            p_status: "expired",
            p_email: null,
            p_business_user_id: null,
            p_correlation_id: c.correlationId,
          }),
        );
        changed = true;
      }
    }
    if (inviteAccepted && row.billing_status !== "verified") {
      const funding = await client.getFunding(row.ad_account_id);
      if (funding.has_funding_source) {
        await rpcOrThrow(admin.rpc("meta_set_billing", { p_org: c.orgId, p_verified: true, p_correlation_id: c.correlationId }));
        changed = true;
      }
    }
  } catch (e) {
    return metaFailure(e, c.correlationId, "meta.refresh_failed");
  }
  return done({ checked: true, changed }, c.correlationId);
}

/** Desfaz a Página/Instagram ligados (para trocar por outra Página). */
export async function unlinkMetaPage(): Promise<ApiResult<{ unlinked: true }>> {
  const correlationId = await getCorrelationId();
  const ctx = await getAppContext();
  if (ctx.mode !== "supabase" || !ctx.organization) {
    return apiError("feature_disabled", "Disponível no piloto com conta.", correlationId);
  }
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("unlink_meta_page", {
    p_org: ctx.organization.id,
    p_correlation_id: correlationId,
  });
  if (error) {
    if (error.code === "42501") return apiError("forbidden", "Apenas o proprietário pode trocar a Página.", correlationId);
    log("error", "meta.unlink_failed", { correlation_id: correlationId, code: error.code });
    return apiError("internal", "Não foi possível trocar a Página agora.", correlationId);
  }
  return done({ unlinked: true }, correlationId);
}
