"use server";

import { createHash, randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { apiError, type ApiResult } from "@/contracts/api";
import { creativeContentSchema, strategyPlanSchema, type AngleKey, type JobStatus } from "@/contracts/creatives";
import { fieldErrors } from "@/contracts/onboarding";
import { initialContents } from "@/lib/creatives";
import { detectImage, MAX_PHOTO_BYTES } from "@/lib/image-bytes";
import { serverEnv } from "@/lib/env";
import { log } from "@/lib/logger";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { checkFacts } from "./ai/facts";
import { ProviderError } from "./ai/openai-text";
import { confirmedFacts, PROMPT_VERSION } from "./ai/prompt";
import { buildImagePrompt, IMAGE_PROMPT_VERSION } from "./ai/image-prompt";
import { selectImageProvider, selectTextProvider } from "./ai/provider";
import type { StrategyInput } from "./ai/types";
import { getAppContext, getCorrelationId } from "./context";
import { ASSETS_BUCKET, loadCreative } from "./creatives-data";

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>;

const uuid = z.uuid();

/** Fatos do brief para a IA + o que o render precisa (cor da marca). */
async function loadBriefFacts(supabase: Supabase, briefId: string) {
  const { data, error } = await supabase
    .from("briefs")
    .select(
      "objective, audience_description, age_min, age_max, service_radius_km, " +
        "businesses(name, segment, city, state, tone_of_voice, brand_primary_color), " +
        "offers(name, description, price_cents, differentiators)",
    )
    .eq("id", briefId)
    .single();
  if (error || !data) throw new Error(`brief_not_found:${error?.code ?? ""}`);

  // Sem tipos gerados do banco: o formato vem do select acima.
  const row = data as unknown as {
    objective: StrategyInput["objective"];
    audience_description: string;
    age_min: number;
    age_max: number;
    service_radius_km: number | null;
    businesses: StrategyInput["business"] & { brand_primary_color: string | null };
    offers: StrategyInput["offer"];
  };
  const { brand_primary_color, ...business } = row.businesses;
  const input: StrategyInput = {
    business,
    offer: row.offers,
    audience: {
      description: row.audience_description,
      age_min: row.age_min,
      age_max: row.age_max,
      service_radius_km: row.service_radius_km,
    },
    objective: row.objective,
  };
  return { input, brandColor: brand_primary_color };
}

/** Executa o job de estratégia (dentro de `after()`): provedor → validação → checagem de fatos → RPC. */
async function runStrategyJob(jobId: string, briefId: string, correlationId: string) {
  const supabase = await createSupabaseServerClient();
  const provider = selectTextProvider(serverEnv());
  const meta = { correlation_id: correlationId, job_id: jobId, provider: provider.name, model: provider.model };
  const fail = async (code: string) => {
    log("warn", "creatives.strategy_failed", { ...meta, error_code: code });
    await supabase.rpc("fail_generation_job", {
      p_job: jobId,
      p_code: code,
      p_provider: provider.name,
      p_model: provider.model,
      p_prompt_version: PROMPT_VERSION,
    });
  };

  try {
    const { input, brandColor } = await loadBriefFacts(supabase, briefId);
    const started = Date.now();
    const result = await provider.generateStrategy(input);

    const parsed = strategyPlanSchema.safeParse(result.data);
    if (!parsed.success) return await fail("invalid_output");
    const violations = checkFacts(parsed.data, confirmedFacts(input));
    if (violations.length > 0) {
      log("warn", "creatives.facts_violation", { ...meta, violations });
      return await fail("facts_violation");
    }

    const { error } = await supabase.rpc("finish_strategy_job", {
      p_job: jobId,
      p_plan: parsed.data,
      p_contents: initialContents(parsed.data, brandColor, input.offer.price_cents),
      p_simulated: provider.name === "mock",
      p_provider: provider.name,
      p_model: provider.model,
      p_prompt_version: PROMPT_VERSION,
      p_input_tokens: result.usage.input_tokens,
      p_output_tokens: result.usage.output_tokens,
    });
    if (error) {
      log("error", "creatives.strategy_save_failed", { ...meta, code: error.code });
      return await fail("internal");
    }
    log("info", "creatives.strategy_generated", {
      ...meta,
      request_id: result.request_id,
      ms: Date.now() - started,
      input_tokens: result.usage.input_tokens,
      output_tokens: result.usage.output_tokens,
    });
  } catch (e) {
    await fail(e instanceof ProviderError ? e.code : "internal");
  }
}

/** Pede a estratégia do brief. Responde na hora; o trabalho continua em segundo plano. */
export async function generateStrategy(briefId: unknown): Promise<ApiResult<{ job_id: string }>> {
  const correlationId = await getCorrelationId();
  const ctx = await getAppContext();
  if (ctx.mode !== "supabase") {
    return apiError("feature_disabled", "Disponível no piloto com conta.", correlationId);
  }
  const id = uuid.safeParse(briefId);
  if (!id.success) return apiError("validation_failed", "Cadastro inválido.", correlationId);

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("start_strategy_job", {
    p_brief: id.data,
    p_correlation_id: correlationId,
  });
  if (error) {
    log("error", "creatives.strategy_start_failed", { correlation_id: correlationId, code: error.code });
    if (error.code === "42501") return apiError("forbidden", "Sem permissão para esta empresa.", correlationId);
    if (error.message.includes("brief_not_ready")) {
      return apiError("conflict", "Conclua o cadastro do negócio antes de gerar.", correlationId);
    }
    return apiError("internal", "Não foi possível começar agora. Tente novamente.", correlationId);
  }

  const { job_id, reused } = data as { job_id: string; reused: boolean };
  if (!reused) after(() => runStrategyJob(job_id, id.data, correlationId));
  return { ok: true, data: { job_id }, correlation_id: correlationId };
}

export type JobView = { status: JobStatus; error_code: string | null };

/** Estado do job para o polling da tela. */
export async function getJobStatus(jobId: unknown): Promise<ApiResult<JobView>> {
  const correlationId = await getCorrelationId();
  const id = uuid.safeParse(jobId);
  if (!id.success) return apiError("validation_failed", "Job inválido.", correlationId);
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("generation_jobs")
    .select("status, error_code, started_at")
    .eq("id", id.data)
    .maybeSingle();
  if (error) return apiError("internal", "Não foi possível consultar agora.", correlationId);
  if (!data) return apiError("not_found", "Job não encontrado.", correlationId);

  const stale = data.status === "running" && Date.now() - new Date(data.started_at).getTime() > 5 * 60_000;
  return {
    ok: true,
    data: stale ? { status: "failed", error_code: "timeout" } : { status: data.status, error_code: data.error_code },
    correlation_id: correlationId,
  };
}

/** Salva o que o editor mudou. Preço só aparece se a oferta tem preço confirmado. */
export async function updateCreative(creativeId: unknown, content: unknown): Promise<ApiResult<{ saved: true }>> {
  const correlationId = await getCorrelationId();
  const id = uuid.safeParse(creativeId);
  const parsed = creativeContentSchema.safeParse(content);
  if (!id.success || !parsed.success) {
    return apiError(
      "validation_failed",
      "Revise os campos destacados.",
      correlationId,
      parsed.success ? undefined : fieldErrors(parsed.error),
    );
  }
  const ctx = await getAppContext();
  if (ctx.mode !== "supabase") return apiError("feature_disabled", "Disponível no piloto com conta.", correlationId);

  const supabase = await createSupabaseServerClient();
  if (parsed.data.show_price) {
    const view = await loadCreative(id.data);
    if (!view) return apiError("not_found", "Peça não encontrada.", correlationId);
    if (view.price_cents === null) {
      return apiError("validation_failed", "Esta oferta não tem preço confirmado.", correlationId, {
        show_price: ["Informe e confirme o preço no cadastro do negócio para mostrá-lo."],
      });
    }
  }

  const { data, error } = await supabase
    .from("creatives")
    .update({ content: parsed.data })
    .eq("id", id.data)
    .select("id");
  if (error) {
    log("error", "creatives.update_failed", { correlation_id: correlationId, code: error.code });
    return apiError("internal", "Não foi possível salvar agora.", correlationId);
  }
  if (!data?.length) return apiError("not_found", "Peça não encontrada.", correlationId);
  revalidatePath("/app/criativos", "layout");
  return { ok: true, data: { saved: true }, correlation_id: correlationId };
}

export async function approveCreative(creativeId: unknown): Promise<ApiResult<{ approved: true }>> {
  const correlationId = await getCorrelationId();
  const id = uuid.safeParse(creativeId);
  if (!id.success) return apiError("validation_failed", "Peça inválida.", correlationId);
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("approve_creative", { p_creative: id.data, p_correlation_id: correlationId });
  if (error) {
    if (error.code === "42501") {
      return apiError("forbidden", "Só o dono ou um administrador da empresa pode aprovar.", correlationId);
    }
    log("error", "creatives.approve_failed", { correlation_id: correlationId, code: error.code });
    return apiError("internal", "Não foi possível aprovar agora.", correlationId);
  }
  revalidatePath("/app/criativos", "layout");
  return { ok: true, data: { approved: true }, correlation_id: correlationId };
}

// ---------------------------------------------------------------------------
// Imagem de fundo (subprojeto 2)
// ---------------------------------------------------------------------------

/** Identificador estável e não pessoal da organização para a OpenAI (safety_identifier). */
const safetyId = (orgId: string) => createHash("sha256").update(`gv-ads:${orgId}`).digest("hex").slice(0, 32);

async function runImageJob(jobId: string, creativeId: string, orgId: string, correlationId: string) {
  const supabase = await createSupabaseServerClient();
  const provider = selectImageProvider(serverEnv());
  const meta = { correlation_id: correlationId, job_id: jobId, model: provider?.model };
  const fail = async (code: string) => {
    log("warn", "creatives.image_failed", { ...meta, error_code: code });
    await supabase.rpc("fail_generation_job", {
      p_job: jobId,
      p_code: code,
      p_provider: "openai",
      p_model: provider?.model ?? null,
      p_prompt_version: IMAGE_PROMPT_VERSION,
    });
  };
  if (!provider) return fail("feature_disabled");

  try {
    const { data } = await supabase
      .from("creatives")
      .select("angle_key, strategies(briefs(businesses(segment, city), offers(name)))")
      .eq("id", creativeId)
      .single();
    const row = data as unknown as {
      angle_key: AngleKey;
      strategies: { briefs: { businesses: { segment: string; city: string }; offers: { name: string } } };
    } | null;
    if (!row) return await fail("internal");
    const { businesses: b, offers: o } = row.strategies.briefs;
    const prompt = buildImagePrompt({ segment: b.segment, offer_name: o.name, city: b.city }, row.angle_key);

    const started = Date.now();
    const image = await provider.generate(prompt, safetyId(orgId));
    const assetId = randomUUID();
    const path = `${orgId}/${assetId}.${image.ext}`;
    const up = await supabase.storage
      .from(ASSETS_BUCKET)
      .upload(path, image.bytes, { contentType: image.mime, upsert: false });
    if (up.error) return await fail("storage_failed");

    const { error } = await supabase.rpc("finish_image_job", {
      p_job: jobId,
      p_asset: assetId,
      p_storage_path: path,
      p_mime: image.mime,
      p_bytes: image.bytes.length,
      p_provider: provider.name,
      p_model: provider.model,
    });
    if (error) {
      await supabase.storage.from(ASSETS_BUCKET).remove([path]);
      log("error", "creatives.image_save_failed", { ...meta, code: error.code });
      return await fail("internal");
    }
    log("info", "creatives.image_generated", { ...meta, ms: Date.now() - started, bytes: image.bytes.length });
  } catch (e) {
    await fail(e instanceof ProviderError ? e.code : "internal");
  }
}

/** Gera a imagem de fundo da peça com IA (em segundo plano). Só existe com a OpenAI configurada. */
export async function generateImage(creativeId: unknown): Promise<ApiResult<{ job_id: string }>> {
  const correlationId = await getCorrelationId();
  const id = uuid.safeParse(creativeId);
  if (!id.success) return apiError("validation_failed", "Peça inválida.", correlationId);
  const ctx = await getAppContext();
  if (ctx.mode !== "supabase" || !ctx.organization) {
    return apiError("feature_disabled", "Disponível no piloto com conta.", correlationId);
  }
  if (!selectImageProvider(serverEnv())) {
    return apiError("feature_disabled", "A geração de imagens ainda não está ativada.", correlationId);
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("start_image_job", {
    p_creative: id.data,
    p_correlation_id: correlationId,
  });
  if (error) {
    if (error.code === "42501") return apiError("forbidden", "Sem permissão para esta peça.", correlationId);
    log("error", "creatives.image_start_failed", { correlation_id: correlationId, code: error.code });
    return apiError("internal", "Não foi possível começar agora.", correlationId);
  }
  const { job_id, reused } = data as { job_id: string; reused: boolean };
  const orgId = ctx.organization.id;
  if (!reused) after(() => runImageJob(job_id, id.data, orgId, correlationId));
  return { ok: true, data: { job_id }, correlation_id: correlationId };
}

/** Foto do cliente: JPEG/PNG até 5 MB, conferida pelos bytes, com declaração de direito de uso. */
export async function uploadPhoto(formData: FormData): Promise<ApiResult<{ asset_id: string }>> {
  const correlationId = await getCorrelationId();
  const id = uuid.safeParse(formData.get("creative_id"));
  const file = formData.get("file");
  if (!id.success) return apiError("validation_failed", "Peça inválida.", correlationId);
  if (formData.get("rights") !== "on") {
    return apiError("validation_failed", "Confirme que você pode usar esta imagem.", correlationId, {
      rights: ["Confirme que você tem direito de usar esta imagem em anúncios."],
    });
  }
  if (!(file instanceof File) || file.size === 0) {
    return apiError("validation_failed", "Escolha uma imagem.", correlationId, { file: ["Escolha uma imagem."] });
  }
  if (file.size > MAX_PHOTO_BYTES) {
    return apiError("validation_failed", "Imagem acima de 5 MB.", correlationId, {
      file: ["Use uma imagem de até 5 MB."],
    });
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const kind = detectImage(bytes);
  if (!kind) {
    return apiError("validation_failed", "Formato não aceito.", correlationId, { file: ["Use uma foto JPG ou PNG."] });
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
    log("error", "creatives.photo_upload_failed", { correlation_id: correlationId });
    return apiError("internal", "Não foi possível enviar a imagem agora.", correlationId);
  }

  const { error } = await supabase.rpc("register_photo", {
    p_creative: id.data,
    p_asset: assetId,
    p_storage_path: path,
    p_mime: kind.mime,
    p_bytes: bytes.length,
    p_correlation_id: correlationId,
  });
  if (error) {
    await supabase.storage.from(ASSETS_BUCKET).remove([path]);
    if (error.code === "42501") return apiError("forbidden", "Sem permissão para esta peça.", correlationId);
    log("error", "creatives.photo_register_failed", { correlation_id: correlationId, code: error.code });
    return apiError("internal", "Não foi possível salvar a imagem agora.", correlationId);
  }
  revalidatePath("/app/criativos", "layout");
  return { ok: true, data: { asset_id: assetId }, correlation_id: correlationId };
}

/** Tira a imagem de fundo (o arquivo continua guardado). */
export async function removeImage(creativeId: unknown): Promise<ApiResult<{ removed: true }>> {
  const correlationId = await getCorrelationId();
  const id = uuid.safeParse(creativeId);
  if (!id.success) return apiError("validation_failed", "Peça inválida.", correlationId);
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("creatives")
    .update({ image_asset_id: null })
    .eq("id", id.data)
    .select("id");
  if (error) return apiError("internal", "Não foi possível remover agora.", correlationId);
  if (!data?.length) return apiError("not_found", "Peça não encontrada.", correlationId);
  revalidatePath("/app/criativos", "layout");
  return { ok: true, data: { removed: true }, correlation_id: correlationId };
}
