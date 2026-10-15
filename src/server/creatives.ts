"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { apiError, type ApiError, type ApiResult } from "@/contracts/api";
import { checkDesignAgainstOffer, creativeDesignSchema, type CreativeView } from "@/contracts/creative";
import { fieldErrors } from "@/contracts/onboarding";
import { creativeFormatSchema, type CreativeFormat } from "@/contracts/strategy";
import { designFromConcept } from "@/lib/creative/defaults";
import { log } from "@/lib/logger";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAppContext, getCorrelationId } from "./context";
import {
  listCreativeViews,
  loadConceptForCreative,
  mapCreativeRpcError,
  readCreative,
  readOfferPrice,
  StoredContentError,
  type OfferPrice,
} from "./strategy-data";

/**
 * Server actions das peças editáveis. Escritas só via RPC (preço confirmado e concorrência
 * otimista impostos no banco). Em modo demonstração a UI cuida das peças no navegador.
 */

const uuid = z.uuid();
const versionSchema = z.number().int().positive();

function errorName(error: unknown): string {
  return error instanceof Error ? error.name : typeof error;
}

/** Contexto comum: modo Supabase e organização. */
async function requireOrganization(correlationId: string): Promise<{ orgId: string } | ApiError> {
  const ctx = await getAppContext();
  if (ctx.mode !== "supabase") {
    return apiError("feature_disabled", "Modo demonstração: as peças ficam só no navegador.", correlationId);
  }
  if (!ctx.organization) return apiError("forbidden", "Crie sua empresa antes de continuar.", correlationId);
  return { orgId: ctx.organization.id };
}

function idError(correlationId: string, field: string): ApiError {
  return apiError("validation_failed", "Identificador inválido.", correlationId, {
    [field]: ["Identificador inválido."],
  });
}

function internalError(correlationId: string, error: unknown, event: string, message: string): ApiError {
  log("error", event, { correlation_id: correlationId, error_name: errorName(error) });
  if (error instanceof StoredContentError) {
    return apiError("internal", "Esta peça tem dados inválidos e não pode ser aberta.", correlationId);
  }
  return apiError("internal", message, correlationId);
}

/** Cria uma peça (rascunho) a partir de um conceito gerado. */
export async function createCreativeFromConcept(input: {
  concept_id: string;
  format: CreativeFormat;
}): Promise<ApiResult<{ creative_id: string }>> {
  const correlationId = await getCorrelationId();
  const parsed = z.object({ concept_id: uuid, format: creativeFormatSchema }).safeParse(input);
  if (!parsed.success) {
    return apiError("validation_failed", "Pedido inválido.", correlationId, fieldErrors(parsed.error));
  }
  const gate = await requireOrganization(correlationId);
  if ("ok" in gate) return gate;

  try {
    const supabase = await createSupabaseServerClient();
    const source = await loadConceptForCreative(supabase, gate.orgId, parsed.data.concept_id);
    if (!source) return apiError("not_found", "Conceito não encontrado.", correlationId);

    // Preço vem sempre da oferta confirmada, nunca do texto gerado.
    const design = creativeDesignSchema.safeParse(
      designFromConcept(source.concept, source.designFacts, parsed.data.format),
    );
    if (!design.success) {
      log("error", "creative.initial_design_invalid", {
        correlation_id: correlationId,
        concept_id: parsed.data.concept_id,
        issue_paths: design.error.issues.map((i) => i.path.join(".")),
      });
      return apiError("internal", "Não foi possível montar a peça a partir deste conceito.", correlationId);
    }
    const priceIssues = checkDesignAgainstOffer(design.data, source.offer);
    if (priceIssues.length > 0) {
      return apiError(
        "validation_failed",
        priceIssues[0]?.message ?? "Preço inválido.",
        correlationId,
        issuesToFieldErrors(priceIssues),
      );
    }

    const { data, error } = await supabase.rpc("create_creative", {
      p_concept: parsed.data.concept_id,
      p_design: design.data,
    });
    if (error) {
      const mapped = mapCreativeRpcError(error);
      log(mapped.code === "internal" ? "error" : "warn", "creative.create_failed", {
        correlation_id: correlationId,
        code: error.code,
        mapped_code: mapped.code,
      });
      return apiError(mapped.code, mapped.message, correlationId, mapped.field_errors);
    }

    const creativeId = String(data);
    log("info", "creative.created", {
      correlation_id: correlationId,
      organization_id: gate.orgId,
      creative_id: creativeId,
      concept_id: parsed.data.concept_id,
      format: parsed.data.format,
    });
    revalidatePath("/app", "layout");
    return { ok: true, data: { creative_id: creativeId }, correlation_id: correlationId };
  } catch (error) {
    return internalError(correlationId, error, "creative.create_crashed", "Não foi possível criar a peça agora.");
  }
}

/** Peça + preço confirmado da oferta (o editor confere o preço com `checkDesignAgainstOffer`). */
export async function getCreative(
  creativeId: string,
): Promise<ApiResult<{ creative: CreativeView; offer: OfferPrice }>> {
  const correlationId = await getCorrelationId();
  if (!uuid.safeParse(creativeId).success) return idError(correlationId, "creative_id");
  const gate = await requireOrganization(correlationId);
  if ("ok" in gate) return gate;

  try {
    const supabase = await createSupabaseServerClient();
    const found = await readCreative(supabase, gate.orgId, creativeId);
    if (!found) return apiError("not_found", "Peça não encontrada.", correlationId);
    const offer = await readOfferPrice(supabase, gate.orgId, found.offer_id);
    if (!offer) return apiError("not_found", "A oferta desta peça não foi encontrada.", correlationId);
    return { ok: true, data: { creative: found.creative, offer }, correlation_id: correlationId };
  } catch (error) {
    return internalError(correlationId, error, "creative.read_failed", "Não foi possível abrir a peça agora.");
  }
}

/** Peças da organização, mais recentes primeiro (até 50). */
export async function listCreatives(): Promise<ApiResult<CreativeView[]>> {
  const correlationId = await getCorrelationId();
  const gate = await requireOrganization(correlationId);
  if ("ok" in gate) return gate;

  try {
    const supabase = await createSupabaseServerClient();
    const creatives = await listCreativeViews(supabase, gate.orgId);
    return { ok: true, data: creatives, correlation_id: correlationId };
  } catch (error) {
    return internalError(correlationId, error, "creative.list_failed", "Não foi possível carregar as peças agora.");
  }
}

/** Salva o design com concorrência otimista. Editar desfaz a aprovação (regra do banco). */
export async function saveCreative(input: {
  creative_id: string;
  version: number;
  design: unknown;
}): Promise<ApiResult<{ version: number }>> {
  const correlationId = await getCorrelationId();
  if (!uuid.safeParse(input?.creative_id).success) return idError(correlationId, "creative_id");
  if (!versionSchema.safeParse(input.version).success) {
    return apiError("validation_failed", "Versão inválida.", correlationId, { version: ["Versão inválida."] });
  }
  // Erros por campo do design (headline, body, price_cents...) para o editor destacar.
  const design = creativeDesignSchema.safeParse(input.design);
  if (!design.success) {
    return apiError("validation_failed", "Revise os campos destacados.", correlationId, fieldErrors(design.error));
  }
  const gate = await requireOrganization(correlationId);
  if ("ok" in gate) return gate;

  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("save_creative", {
      p_creative: input.creative_id,
      p_version: input.version,
      p_design: design.data,
    });
    if (error) {
      const mapped = mapCreativeRpcError(error);
      log(mapped.code === "internal" ? "error" : "warn", "creative.save_failed", {
        correlation_id: correlationId,
        creative_id: input.creative_id,
        code: error.code,
        mapped_code: mapped.code,
      });
      return apiError(mapped.code, mapped.message, correlationId, mapped.field_errors);
    }
    const version = Number(data);
    log("info", "creative.saved", { correlation_id: correlationId, creative_id: input.creative_id, version });
    return { ok: true, data: { version }, correlation_id: correlationId };
  } catch (error) {
    return internalError(correlationId, error, "creative.save_crashed", "Não foi possível salvar a peça agora.");
  }
}

/** Aprova a versão atual da peça (não publica nada). */
export async function approveCreative(input: {
  creative_id: string;
  version: number;
}): Promise<ApiResult<{ status: "approved" }>> {
  const correlationId = await getCorrelationId();
  if (!uuid.safeParse(input?.creative_id).success) return idError(correlationId, "creative_id");
  if (!versionSchema.safeParse(input.version).success) {
    return apiError("validation_failed", "Versão inválida.", correlationId, { version: ["Versão inválida."] });
  }
  const gate = await requireOrganization(correlationId);
  if ("ok" in gate) return gate;

  try {
    const supabase = await createSupabaseServerClient();
    // Confere de novo o preço contra a oferta (pode ter mudado depois que a peça foi criada).
    const found = await readCreative(supabase, gate.orgId, input.creative_id);
    if (!found) return apiError("not_found", "Peça não encontrada.", correlationId);
    const offer = await readOfferPrice(supabase, gate.orgId, found.offer_id);
    if (!offer) return apiError("not_found", "A oferta desta peça não foi encontrada.", correlationId);
    const priceIssues = checkDesignAgainstOffer(found.creative.design, offer);
    if (priceIssues.length > 0) {
      return apiError(
        "validation_failed",
        priceIssues[0]?.message ?? "Preço inválido.",
        correlationId,
        issuesToFieldErrors(priceIssues),
      );
    }

    const { error } = await supabase.rpc("approve_creative", {
      p_creative: input.creative_id,
      p_version: input.version,
    });
    if (error) {
      const mapped = mapCreativeRpcError(error);
      log(mapped.code === "internal" ? "error" : "warn", "creative.approve_failed", {
        correlation_id: correlationId,
        creative_id: input.creative_id,
        code: error.code,
        mapped_code: mapped.code,
      });
      return apiError(mapped.code, mapped.message, correlationId, mapped.field_errors);
    }
    log("info", "creative.approved", {
      correlation_id: correlationId,
      organization_id: gate.orgId,
      creative_id: input.creative_id,
      version: input.version,
    });
    revalidatePath("/app", "layout");
    return { ok: true, data: { status: "approved" }, correlation_id: correlationId };
  } catch (error) {
    return internalError(correlationId, error, "creative.approve_crashed", "Não foi possível aprovar a peça agora.");
  }
}

function issuesToFieldErrors(issues: ReturnType<typeof checkDesignAgainstOffer>): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const issue of issues) (out[issue.field] ??= []).push(issue.message);
  return out;
}
