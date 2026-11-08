"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { apiError, type ApiError, type ApiResult } from "@/contracts/api";
import { fieldErrors } from "@/contracts/onboarding";
import {
  productDescription,
  productInputSchema,
  REACH_OPTIONS,
  recordSaleSchema,
  setReachSchema,
} from "@/contracts/products";
import { detectImage, MAX_PHOTO_BYTES } from "@/lib/image-bytes";
import { log } from "@/lib/logger";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAppContext, getCorrelationId } from "./context";
import { generateStrategy } from "./creatives";
import { ASSETS_BUCKET } from "./creatives-data";

/** Fluxo simples (ADR 0010): produto com foto â†’ 5 peÃ§as â†’ regiÃ£o â†’ verba â†’ campanha PAUSADA. */

const uuid = z.uuid();

type OrgCheck =
  { error: ApiError } | { error?: undefined; org: { id: string; role: "owner" | "admin" | "member" | "support" } };

async function requireOrg(correlationId: string): Promise<OrgCheck> {
  const ctx = await getAppContext();
  if (ctx.mode !== "supabase" || !ctx.organization) {
    return { error: apiError("feature_disabled", "DisponÃ­vel no piloto com conta.", correlationId) };
  }
  return { org: ctx.organization };
}

/** Foto do produto: JPG/PNG atÃ© 5 MB, conferida pelos bytes, com declaraÃ§Ã£o de direito de uso. */
export async function uploadProductPhoto(formData: FormData): Promise<ApiResult<{ asset_id: string; url: string }>> {
  const correlationId = await getCorrelationId();
  const file = formData.get("file");
  if (formData.get("rights") !== "on") {
    return apiError("validation_failed", "Confirme que vocÃª pode usar esta foto.", correlationId, {
      rights: ["Confirme que a foto Ã© sua ou que vocÃª tem direito de usÃ¡-la em anÃºncios."],
    });
  }
  if (!(file instanceof File) || file.size === 0) {
    return apiError("validation_failed", "Escolha uma foto.", correlationId, { file: ["Escolha uma foto."] });
  }
  if (file.size > MAX_PHOTO_BYTES) {
    return apiError("validation_failed", "Foto acima de 5 MB.", correlationId, {
      file: ["Use uma foto de atÃ© 5 MB."],
    });
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const kind = detectImage(bytes);
  if (!kind) {
    return apiError("validation_failed", "Formato nÃ£o aceito.", correlationId, { file: ["Use uma foto JPG ou PNG."] });
  }

  const auth = await requireOrg(correlationId);
  if (auth.error) return auth.error;
  const supabase = await createSupabaseServerClient();
  const assetId = randomUUID();
  const path = `${auth.org.id}/${assetId}.${kind.ext}`;
  const up = await supabase.storage.from(ASSETS_BUCKET).upload(path, bytes, { contentType: kind.mime, upsert: false });
  if (up.error) {
    log("error", "products.photo_upload_failed", { correlation_id: correlationId });
    return apiError("internal", "NÃ£o foi possÃ­vel enviar a foto agora.", correlationId);
  }
  const { error } = await supabase.rpc("register_product_photo", {
    p_org: auth.org.id,
    p_asset: assetId,
    p_storage_path: path,
    p_mime: kind.mime,
    p_bytes: bytes.length,
    p_correlation_id: correlationId,
  });
  if (error) {
    await supabase.storage.from(ASSETS_BUCKET).remove([path]);
    if (error.code === "42501") return apiError("forbidden", "Sem permissÃ£o para esta empresa.", correlationId);
    log("error", "products.photo_register_failed", { correlation_id: correlationId, code: error.code });
    return apiError("internal", "NÃ£o foi possÃ­vel salvar a foto agora.", correlationId);
  }
  const { data: signed } = await supabase.storage.from(ASSETS_BUCKET).createSignedUrl(path, 3600);
  return { ok: true, data: { asset_id: assetId, url: signed?.signedUrl ?? "" }, correlation_id: correlationId };
}

/**
 * Cria o produto (oferta + brief) e jÃ¡ pede as 5 peÃ§as. Se a geraÃ§Ã£o nÃ£o comeÃ§ar (ex.: limite do mÃªs),
 * o produto fica salvo e a tela da prÃ©via oferece tentar de novo.
 */
export async function createProduct(
  input: unknown,
): Promise<ApiResult<{ brief_id: string; job_started: boolean; warning?: string }>> {
  const correlationId = await getCorrelationId();
  const parsed = productInputSchema.safeParse(input);
  if (!parsed.success) {
    return apiError("validation_failed", "Revise os campos destacados.", correlationId, fieldErrors(parsed.error));
  }
  const auth = await requireOrg(correlationId);
  if (auth.error) return auth.error;

  const p = parsed.data;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("create_product_brief", {
    p_org: auth.org.id,
    p_payload: {
      name: p.name,
      description: productDescription(p),
      price_cents: p.price_cents,
      differentiators: p.highlights.map((h) => h.text),
      photo_asset_id: p.photo_asset_id,
      request_key: p.request_key,
      facts_confirmed: p.facts_confirmed,
    },
    p_correlation_id: correlationId,
  });
  if (error) {
    if (error.code === "42501") return apiError("forbidden", "Sem permissÃ£o para esta empresa.", correlationId);
    if (error.message.includes("onboarding_required")) {
      return apiError("conflict", "Conclua o cadastro do seu negÃ³cio antes de criar o anÃºncio.", correlationId);
    }
    if (error.message.includes("missing_whatsapp")) {
      return apiError(
        "conflict",
        "O anÃºncio leva as pessoas para o seu WhatsApp. Adicione o nÃºmero em Meu negÃ³cio.",
        correlationId,
      );
    }
    if (error.message.includes("invalid_photo")) {
      return apiError("validation_failed", "A foto nÃ£o foi encontrada. Envie de novo.", correlationId, {
        file: ["Envie a foto de novo."],
      });
    }
    log("error", "products.create_failed", { correlation_id: correlationId, code: error.code });
    return apiError("internal", "NÃ£o foi possÃ­vel salvar o produto agora.", correlationId);
  }

  const { brief_id } = data as { brief_id: string; replayed: boolean };
  const job = await generateStrategy(brief_id);
  revalidatePath("/app", "layout");
  return {
    ok: true,
    data: { brief_id, job_started: job.ok, warning: job.ok ? undefined : job.error.message },
    correlation_id: correlationId,
  };
}

/** Alcance do anÃºncio: grava o raio no brief (lido na publicaÃ§Ã£o). */
export async function setProductReach(input: unknown): Promise<ApiResult<{ saved: true }>> {
  const correlationId = await getCorrelationId();
  const parsed = setReachSchema.safeParse(input);
  if (!parsed.success) return apiError("validation_failed", "Escolha onde mostrar o anÃºncio.", correlationId);
  const auth = await requireOrg(correlationId);
  if (auth.error) return auth.error;

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("briefs")
    .update({ service_radius_km: REACH_OPTIONS[parsed.data.reach].radius_km })
    .eq("id", parsed.data.brief_id)
    .eq("organization_id", auth.org.id)
    .not("request_key", "is", null)
    .select("id");
  if (error) {
    log("error", "products.reach_failed", { correlation_id: correlationId, code: error.code });
    return apiError("internal", "NÃ£o foi possÃ­vel salvar agora.", correlationId);
  }
  if (!data?.length) return apiError("not_found", "AnÃºncio nÃ£o encontrado.", correlationId);
  return { ok: true, data: { saved: true }, correlation_id: correlationId };
}

/** "Gostei, continuar": aprova as 5 versÃµes que o dono acabou de ver. SÃ³ owner/admin (RPC confere). */
export async function approveProductCreatives(strategyId: unknown): Promise<ApiResult<{ approved: number }>> {
  const correlationId = await getCorrelationId();
  const id = uuid.safeParse(strategyId);
  if (!id.success) return apiError("validation_failed", "AnÃºncio invÃ¡lido.", correlationId);
  const auth = await requireOrg(correlationId);
  if (auth.error) return auth.error;
  if (auth.org.role !== "owner" && auth.org.role !== "admin") {
    return apiError("forbidden", "SÃ³ o dono ou um administrador da empresa pode aprovar.", correlationId);
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("creatives")
    .select("id, status")
    .eq("strategy_id", id.data)
    .eq("organization_id", auth.org.id);
  if (error) return apiError("internal", "NÃ£o foi possÃ­vel carregar o anÃºncio.", correlationId);
  if (!data?.length) return apiError("not_found", "AnÃºncio nÃ£o encontrado.", correlationId);

  for (const c of data.filter((x) => x.status !== "approved")) {
    const { error: e } = await supabase.rpc("approve_creative", { p_creative: c.id, p_correlation_id: correlationId });
    if (e) {
      log("error", "products.approve_failed", { correlation_id: correlationId, code: e.code });
      return apiError(
        e.code === "42501" ? "forbidden" : "internal",
        "NÃ£o foi possÃ­vel aprovar agora.",
        correlationId,
      );
    }
  }
  revalidatePath("/app", "layout");
  return { ok: true, data: { approved: data.length }, correlation_id: correlationId };
}

/** Venda que veio das conversas, declarada pelo dono (nÃ£o Ã© dado da Meta). */
export async function recordSale(input: unknown): Promise<ApiResult<{ sale_id: string }>> {
  const correlationId = await getCorrelationId();
  const parsed = recordSaleSchema.safeParse(input);
  if (!parsed.success) {
    return apiError("validation_failed", "Revise os campos destacados.", correlationId, fieldErrors(parsed.error));
  }
  const auth = await requireOrg(correlationId);
  if (auth.error) return auth.error;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("record_sale", {
    p_campaign: parsed.data.campaign_id,
    p_quantity: parsed.data.quantity,
    p_amount_cents: parsed.data.amount_cents,
    p_correlation_id: correlationId,
  });
  if (error) {
    if (error.code === "42501") return apiError("forbidden", "Sem permissÃ£o para esta campanha.", correlationId);
    log("error", "products.sale_failed", { correlation_id: correlationId, code: error.code });
    return apiError("internal", "NÃ£o foi possÃ­vel registrar agora.", correlationId);
  }
  revalidatePath("/app", "layout");
  return { ok: true, data: { sale_id: data as string }, correlation_id: correlationId };
}

export async function deleteSale(saleId: unknown): Promise<ApiResult<{ deleted: true }>> {
  const correlationId = await getCorrelationId();
  const id = uuid.safeParse(saleId);
  if (!id.success) return apiError("validation_failed", "Registro invÃ¡lido.", correlationId);
  const auth = await requireOrg(correlationId);
  if (auth.error) return auth.error;
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("delete_sale", { p_sale: id.data, p_correlation_id: correlationId });
  if (error) {
    if (error.code === "42501") {
      return apiError("forbidden", "SÃ³ quem registrou ou o dono da empresa pode apagar.", correlationId);
    }
    return apiError("internal", "NÃ£o foi possÃ­vel apagar agora.", correlationId);
  }
  revalidatePath("/app", "layout");
  return { ok: true, data: { deleted: true }, correlation_id: correlationId };
}
