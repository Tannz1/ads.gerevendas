"use server";

import { randomBytes, randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  CURRENT_TERMS_VERSION,
  createInviteSchema,
  deleteOrganizationConfirmSchema,
  inviteTokenSchema,
  recordConsentsSchema,
  type ConsentKind,
} from "@/contracts/account";
import { apiError, type ApiResult } from "@/contracts/api";
import { fieldErrors } from "@/contracts/onboarding";
import { detectImage, MAX_PHOTO_BYTES } from "@/lib/image-bytes";
import { log } from "@/lib/logger";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAppContext, getCorrelationId } from "./context";
import { ASSETS_BUCKET } from "./creatives-data";

const uuid = z.uuid();

export function generateInviteToken(): string {
  return randomBytes(24).toString("base64url");
}

export async function createInvite(input: unknown): Promise<ApiResult<{ invite_id: string; token: string }>> {
  const correlationId = await getCorrelationId();
  const parsed = createInviteSchema.safeParse(input);
  if (!parsed.success) {
    return apiError("validation_failed", "Revise os dados do convite.", correlationId, fieldErrors(parsed.error));
  }
  const ctx = await getAppContext();
  if (ctx.mode !== "supabase" || !ctx.organization) {
    return apiError("feature_disabled", "Disponível no piloto com conta.", correlationId);
  }
  if (ctx.organization.role !== "owner" && ctx.organization.role !== "admin") {
    return apiError("forbidden", "Só proprietários ou administradores podem convidar membros.", correlationId);
  }

  const token = generateInviteToken();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("create_organization_invite", {
    p_org: ctx.organization.id,
    p_email: parsed.data.email,
    p_role: parsed.data.role,
    p_token: token,
    p_correlation_id: correlationId,
  });
  if (error) {
    if (error.code === "23505") {
      return apiError("conflict", "Já existe um convite pendente para este e-mail.", correlationId);
    }
    if (error.code === "42501") {
      return apiError("forbidden", "Sem permissão para convidar membros.", correlationId);
    }
    log("error", "account.invite_create_failed", { correlation_id: correlationId, code: error.code });
    return apiError("internal", "Não foi possível criar o convite agora.", correlationId);
  }

  revalidatePath("/app/conta");
  return { ok: true, data: { invite_id: data as string, token }, correlation_id: correlationId };
}

export async function revokeInvite(inviteId: unknown): Promise<ApiResult<{ revoked: true }>> {
  const correlationId = await getCorrelationId();
  const id = uuid.safeParse(inviteId);
  if (!id.success) return apiError("validation_failed", "Convite inválido.", correlationId);
  const ctx = await getAppContext();
  if (ctx.mode !== "supabase" || !ctx.organization) {
    return apiError("feature_disabled", "Disponível no piloto com conta.", correlationId);
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("revoke_organization_invite", {
    p_invite: id.data,
    p_correlation_id: correlationId,
  });
  if (error) {
    if (error.code === "42501") return apiError("forbidden", "Sem permissão para revogar convite.", correlationId);
    log("error", "account.invite_revoke_failed", { correlation_id: correlationId, code: error.code });
    return apiError("internal", "Não foi possível revogar o convite agora.", correlationId);
  }
  revalidatePath("/app/conta");
  return { ok: true, data: { revoked: true }, correlation_id: correlationId };
}

export async function acceptInvite(token: unknown): Promise<ApiResult<{ organization_id: string }>> {
  const correlationId = await getCorrelationId();
  const parsed = inviteTokenSchema.safeParse(token);
  if (!parsed.success) return apiError("validation_failed", "Código de convite inválido.", correlationId);
  const ctx = await getAppContext();
  if (ctx.mode !== "supabase") {
    return apiError("feature_disabled", "Disponível no piloto com conta.", correlationId);
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("accept_organization_invite", {
    p_token: parsed.data,
    p_correlation_id: correlationId,
  });
  if (error) {
    if (error.message.includes("invite_email_mismatch") || error.code === "42501") {
      return apiError("forbidden", "Entre com o mesmo e-mail para o qual o convite foi enviado.", correlationId);
    }
    if (error.message.includes("invite_expired")) {
      return apiError("conflict", "Este convite expirou ou foi revogado.", correlationId);
    }
    if (error.message.includes("invite_not_found") || error.code === "P0002") {
      return apiError("not_found", "Convite não encontrado.", correlationId);
    }
    log("error", "account.invite_accept_failed", { correlation_id: correlationId, code: error.code });
    return apiError("internal", "Não foi possível aceitar o convite agora.", correlationId);
  }

  revalidatePath("/app", "layout");
  return { ok: true, data: { organization_id: data as string }, correlation_id: correlationId };
}

export async function uploadBusinessLogo(formData: FormData): Promise<ApiResult<{ asset_id: string }>> {
  const correlationId = await getCorrelationId();
  const businessId = uuid.safeParse(formData.get("business_id"));
  const file = formData.get("file");
  if (!businessId.success) return apiError("validation_failed", "Negócio inválido.", correlationId);
  if (formData.get("rights") !== "on") {
    return apiError("validation_failed", "Confirme o direito de uso da marca.", correlationId, {
      rights: ["Confirme que você tem autorização para usar este logotipo."],
    });
  }
  if (!(file instanceof File) || file.size === 0) {
    return apiError("validation_failed", "Escolha uma imagem.", correlationId, {
      file: ["Escolha um arquivo PNG ou JPG."],
    });
  }
  if (file.size > MAX_PHOTO_BYTES) {
    return apiError("validation_failed", "Arquivo acima de 5 MB.", correlationId, {
      file: ["Use um arquivo de até 5 MB."],
    });
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const kind = detectImage(bytes);
  if (!kind) {
    return apiError("validation_failed", "Formato não aceito.", correlationId, {
      file: ["Use um arquivo PNG ou JPG."],
    });
  }

  const ctx = await getAppContext();
  if (ctx.mode !== "supabase" || !ctx.organization) {
    return apiError("feature_disabled", "Disponível no piloto com conta.", correlationId);
  }

  const supabase = await createSupabaseServerClient();
  const assetId = randomUUID();
  const path = `${ctx.organization.id}/${assetId}.${kind.ext}`;
  const up = await supabase.storage.from(ASSETS_BUCKET).upload(path, bytes, { contentType: kind.mime, upsert: false });
  if (up.error) {
    log("error", "account.logo_upload_failed", { correlation_id: correlationId });
    return apiError("internal", "Não foi possível enviar o logotipo agora.", correlationId);
  }

  const { error } = await supabase.rpc("register_business_logo", {
    p_business: businessId.data,
    p_asset: assetId,
    p_storage_path: path,
    p_mime: kind.mime,
    p_bytes: bytes.length,
    p_correlation_id: correlationId,
  });
  if (error) {
    await supabase.storage.from(ASSETS_BUCKET).remove([path]);
    if (error.code === "42501") return apiError("forbidden", "Sem permissão para este negócio.", correlationId);
    log("error", "account.logo_register_failed", { correlation_id: correlationId, code: error.code });
    return apiError("internal", "Não foi possível salvar o logotipo agora.", correlationId);
  }

  revalidatePath("/app/conta");
  revalidatePath("/app/criativos", "layout");
  return { ok: true, data: { asset_id: assetId }, correlation_id: correlationId };
}

export async function saveUserConsents(input: unknown): Promise<ApiResult<{ saved: true }>> {
  const correlationId = await getCorrelationId();
  const parsed = recordConsentsSchema.safeParse(input);
  if (!parsed.success) {
    return apiError("validation_failed", "Confirme os termos obrigatórios.", correlationId, fieldErrors(parsed.error));
  }
  const ctx = await getAppContext();
  if (ctx.mode !== "supabase" || !ctx.organization) {
    return apiError("feature_disabled", "Disponível no piloto com conta.", correlationId);
  }

  const kinds: ConsentKind[] = ["terms_of_use", "privacy_policy", "ai_processing"];
  if (parsed.data.pilot_participation) kinds.push("pilot_participation");

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("record_user_consents", {
    p_org: ctx.organization.id,
    p_version: CURRENT_TERMS_VERSION,
    p_kinds: kinds,
    p_correlation_id: correlationId,
  });
  if (error) {
    log("error", "account.consents_failed", { correlation_id: correlationId, code: error.code });
    return apiError("internal", "Não foi possível registrar os consentimentos agora.", correlationId);
  }

  revalidatePath("/app/conta");
  return { ok: true, data: { saved: true }, correlation_id: correlationId };
}

export async function exportOrganizationData(): Promise<ApiResult<Record<string, unknown>>> {
  const correlationId = await getCorrelationId();
  const ctx = await getAppContext();
  if (ctx.mode !== "supabase" || !ctx.organization) {
    return apiError("feature_disabled", "Disponível no piloto com conta.", correlationId);
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("export_organization_data", {
    p_org: ctx.organization.id,
    p_correlation_id: correlationId,
  });
  if (error) {
    if (error.code === "42501") {
      return apiError("forbidden", "Apenas proprietários ou administradores podem exportar dados.", correlationId);
    }
    log("error", "account.export_failed", { correlation_id: correlationId, code: error.code });
    return apiError("internal", "Não foi possível exportar os dados agora.", correlationId);
  }
  return { ok: true, data: data as Record<string, unknown>, correlation_id: correlationId };
}

export async function deleteOrganizationData(input: unknown): Promise<ApiResult<{ deleted: true }>> {
  const correlationId = await getCorrelationId();
  const parsed = deleteOrganizationConfirmSchema.safeParse(input);
  if (!parsed.success) {
    return apiError("validation_failed", "Confirme o nome exato da empresa.", correlationId, fieldErrors(parsed.error));
  }
  const ctx = await getAppContext();
  if (ctx.mode !== "supabase" || !ctx.organization) {
    return apiError("feature_disabled", "Disponível no piloto com conta.", correlationId);
  }
  if (ctx.organization.id !== parsed.data.organization_id) {
    return apiError("forbidden", "Organização inválida.", correlationId);
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("delete_organization", {
    p_org: parsed.data.organization_id,
    p_confirmation_name: parsed.data.confirmation_name,
    p_correlation_id: correlationId,
  });
  if (error) {
    if (error.code === "42501") {
      return apiError("forbidden", "Apenas o proprietário da empresa pode excluir a conta.", correlationId);
    }
    if (error.message.includes("confirmation_mismatch")) {
      return apiError("validation_failed", "O nome digitado não coincide com o nome da empresa.", correlationId);
    }
    log("error", "account.delete_failed", { correlation_id: correlationId, code: error.code });
    return apiError("internal", "Não foi possível excluir a empresa agora.", correlationId);
  }

  revalidatePath("/app", "layout");
  return { ok: true, data: { deleted: true }, correlation_id: correlationId };
}
