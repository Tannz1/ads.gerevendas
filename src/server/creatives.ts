"use server";

import { createHash, randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { apiError, type ApiResult } from "@/contracts/api";
import {
  creativeContentSchema,
  marketResearchSchema,
  storedStrategyPlanSchema,
  strategyPlanSchema,
  type AngleKey,
  type JobStatus,
  type MarketResearch,
  type StoredStrategyPlan,
} from "@/contracts/creatives";
import { fieldErrors } from "@/contracts/onboarding";
import { initialContents } from "@/lib/creatives";
import { detectImage, MAX_PHOTO_BYTES } from "@/lib/image-bytes";
import { serverEnv } from "@/lib/env";
import { log } from "@/lib/logger";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { checkFacts } from "./ai/facts";
import { ProviderError } from "./ai/openai-text";
import { confirmedFacts, PROMPT_VERSION, RESEARCH_PROMPT_VERSION } from "./ai/prompt";
import { buildImagePrompt, IMAGE_PROMPT_VERSION } from "./ai/image-prompt";
import { selectImageProvider, selectTextProvider } from "./ai/provider";
import type { ResearchInput, StrategyInput, TextProvider } from "./ai/types";
import { getAppContext, getCorrelationId } from "./context";
import { ASSETS_BUCKET, loadCreative, loadCreditSummary } from "./creatives-data";

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>;

const uuid = z.uuid();

/** Fatos do brief para a IA + o que o render precisa (cor da marca). */
async function loadBriefFacts(supabase: Supabase, briefId: string) {
  const { data, error } = await supabase
    .from("briefs")
    .select(
      "objective, audience_description, age_min, age_max, service_radius_km, " +
        "businesses(name, segment, city, state, tone_of_voice, brand_primary_color, instagram_handle, website_url, competitors), " +
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
    businesses: StrategyInput["business"] & {
      brand_primary_color: string | null;
      instagram_handle: string | null;
      website_url: string | null;
      competitors: string[] | null;
    };
    offers: StrategyInput["offer"];
  };
  const { brand_primary_color, instagram_handle, website_url, competitors, ...business } = row.businesses;
  const researchInput: ResearchInput = {
    business: {
      name: business.name,
      segment: business.segment,
      city: business.city,
      state: business.state,
      instagram_handle,
      website_url,
    },
    offer: { name: row.offers.name, description: row.offers.description },
    competitors_listed: competitors ?? [],
  };
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
  return { input, researchInput, brandColor: brand_primary_color };
}

type StoredResearch = NonNullable<StoredStrategyPlan["research"]>;

/**
 * Pesquisa de mercado na web (primeiro passo da estratégia). Falha não derruba a estratégia:
 * ela sai só com os fatos do cliente.
 */
async function runResearch(provider: TextProvider, input: ResearchInput, meta: Record<string, unknown>) {
  try {
    const r = await provider.research(input);
    const parsed = marketResearchSchema.safeParse(r.data);
    if (!parsed.success) {
      log("warn", "creatives.research_invalid", { ...meta, prompt_version: RESEARCH_PROMPT_VERSION });
      return { research: null, usage: r.usage };
    }
    const research: StoredResearch = { ...parsed.data, sources: r.sources };
    return { research, usage: r.usage };
  } catch (e) {
    log("warn", "creatives.research_failed", { ...meta, error_code: e instanceof ProviderError ? e.code : "internal" });
    return { research: null, usage: { input_tokens: 0, output_tokens: 0 } };
  }
}

/** A estratégia recebe a pesquisa sem as fontes (as fontes são só para a tela). */
const forStrategy = (research: StoredResearch | null | undefined): MarketResearch | null =>
  research ? marketResearchSchema.parse(research) : null;

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

  let strategyId: string | null = null;
  try {
    const { input, researchInput, brandColor } = await loadBriefFacts(supabase, briefId);
    const started = Date.now();
    const { research, usage: researchUsage } = await runResearch(provider, researchInput, meta);
    const result = await provider.generateStrategy({ ...input, research: forStrategy(research) });

    const parsed = strategyPlanSchema.safeParse(result.data);
    if (!parsed.success) return await fail("invalid_output");
    const violations = checkFacts(parsed.data, confirmedFacts(input));
    if (violations.length > 0) {
      log("warn", "creatives.facts_violation", { ...meta, violations });
      return await fail("facts_violation");
    }

    const { data: savedId, error } = await supabase.rpc("finish_strategy_job", {
      p_job: jobId,
      p_plan: { ...parsed.data, research },
      p_contents: initialContents(parsed.data, brandColor, input.offer.price_cents),
      p_simulated: provider.name === "mock",
      p_provider: provider.name,
      p_model: provider.model,
      p_prompt_version: PROMPT_VERSION,
      p_input_tokens: result.usage.input_tokens + researchUsage.input_tokens,
      p_output_tokens: result.usage.output_tokens + researchUsage.output_tokens,
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
      research: research ? { competitors: research.competitors.length, sources: research.sources.length } : null,
    });
    strategyId = savedId as string;
  } catch (e) {
    await fail(e instanceof ProviderError ? e.code : "internal");
  }

  // Imagem de cada peça logo em seguida, com o texto dela como contexto. Fora do try acima: uma
  // falha aqui não pode marcar como falha a estratégia, que já foi salva.
  if (strategyId && provider.name !== "mock" && selectImageProvider(serverEnv())) {
    try {
      const { jobs } = await startMissingImageJobs(strategyId, correlationId);
      await runImageJobs(jobs, correlationId);
    } catch (e) {
      log("error", "creatives.image_auto_failed", { ...meta, reason: e instanceof Error ? e.message : "unknown" });
    }
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
  // Simulação não consome crédito nem conta no teto de tokens.
  const env = serverEnv();
  const billable = selectTextProvider(env).name === "openai";
  if (billable && ctx.organization) {
    const summary = await loadCreditSummary(ctx.organization.id);
    if (summary && summary.tokens >= env.AI_MONTHLY_TOKEN_CAP) {
      return apiError("credit_limit_reached", "O uso de IA deste mês chegou ao limite da conta.", correlationId);
    }
  }
  const { data, error } = await supabase.rpc("start_strategy_job", {
    p_brief: id.data,
    p_correlation_id: correlationId,
    p_billable: billable,
  });
  if (error) {
    log("error", "creatives.strategy_start_failed", { correlation_id: correlationId, code: error.code });
    if (error.code === "42501") return apiError("forbidden", "Sem permissão para esta empresa.", correlationId);
    if (error.message.includes("credit_limit_reached")) {
      return apiError(
        "credit_limit_reached",
        "Você já gerou as 4 estratégias deste mês. O limite renova no dia 1º.",
        correlationId,
      );
    }
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

/**
 * Regenera apenas o texto (headline, body, cta) da peça mantendo a imagem de fundo e as cores atuais (docs/04).
 */
export async function regenerateCreativeCopy(
  creativeId: unknown,
): Promise<ApiResult<{ headline: string; body: string; cta: string }>> {
  const correlationId = await getCorrelationId();
  const id = uuid.safeParse(creativeId);
  if (!id.success) return apiError("validation_failed", "Peça inválida.", correlationId);
  const ctx = await getAppContext();
  if (ctx.mode !== "supabase" || !ctx.organization) {
    return apiError("feature_disabled", "Disponível no piloto com conta.", correlationId);
  }

  const supabase = await createSupabaseServerClient();
  const { data: row, error: fetchErr } = await supabase
    .from("creatives")
    .select("id, angle_key, content, strategies(brief_id, plan)")
    .eq("id", id.data)
    .maybeSingle();
  if (fetchErr || !row) return apiError("not_found", "Peça não encontrada.", correlationId);

  const r = row as unknown as {
    id: string;
    angle_key: AngleKey;
    content: unknown;
    strategies: { brief_id: string; plan: unknown };
  };
  const currentContent = creativeContentSchema.safeParse(r.content);
  if (!currentContent.success) return apiError("internal", "Conteúdo atual inválido.", correlationId);

  try {
    const { input } = await loadBriefFacts(supabase, r.strategies.brief_id);
    const provider = selectTextProvider(serverEnv());
    // Mesma pesquisa da estratégia salva: o texto novo segue o mesmo contexto, sem pesquisar de novo.
    const research = storedStrategyPlanSchema.safeParse(r.strategies.plan).data?.research;
    const result = await provider.generateStrategy({ ...input, research: forStrategy(research) });
    const parsedPlan = strategyPlanSchema.safeParse(result.data);
    if (!parsedPlan.success) return apiError("external_unavailable", "Falha ao gerar novo texto.", correlationId);

    const violations = checkFacts(parsedPlan.data, confirmedFacts(input));
    if (violations.length > 0) {
      return apiError("facts_not_confirmed", "O texto gerado continha informações não confirmadas.", correlationId);
    }

    const angle = parsedPlan.data.angles.find((a) => a.key === r.angle_key) ?? parsedPlan.data.angles[0];
    const updatedContent = {
      ...currentContent.data,
      headline: angle.headline,
      body: angle.body,
      cta: angle.cta,
    };

    const { error: upErr } = await supabase.from("creatives").update({ content: updatedContent }).eq("id", id.data);
    if (upErr) return apiError("internal", "Não foi possível atualizar o texto da peça.", correlationId);

    revalidatePath("/app/criativos", "layout");
    return {
      ok: true,
      data: { headline: angle.headline, body: angle.body, cta: angle.cta },
      correlation_id: correlationId,
    };
  } catch {
    return apiError("external_unavailable", "Não foi possível gerar novo texto agora.", correlationId);
  }
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
      .select("angle_key, content, strategies(briefs(businesses(segment, city), offers(name, description)))")
      .eq("id", creativeId)
      .single();
    const row = data as unknown as {
      angle_key: AngleKey;
      content: { headline?: string; body?: string } | null;
      strategies: {
        briefs: { businesses: { segment: string; city: string }; offers: { name: string; description: string | null } };
      };
    } | null;
    if (!row) return await fail("internal");
    const { businesses: b, offers: o } = row.strategies.briefs;
    const prompt = buildImagePrompt(
      {
        segment: b.segment,
        offer_name: o.name,
        offer_description: o.description,
        city: b.city,
        headline: row.content?.headline,
        body: row.content?.body,
      },
      row.angle_key,
    );

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

type ImageJobRef = { jobId: string; creativeId: string; orgId: string };

/**
 * Abre um job de imagem para cada peça da estratégia ainda sem imagem, um de cada vez para o
 * limite mensal de créditos valer. Peça com job já em andamento fica de fora (outra chamada roda).
 */
async function startMissingImageJobs(
  strategyId: string,
  correlationId: string,
): Promise<{ jobs: ImageJobRef[]; limitReached: boolean }> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("creatives")
    .select("id, organization_id")
    .eq("strategy_id", strategyId)
    .is("image_asset_id", null)
    .order("created_at");
  const jobs: ImageJobRef[] = [];
  for (const c of (data ?? []) as Array<{ id: string; organization_id: string }>) {
    const { data: job, error } = await supabase.rpc("start_image_job", {
      p_creative: c.id,
      p_correlation_id: correlationId,
    });
    if (error) {
      const limitReached = error.message.includes("credit_limit_reached");
      log("warn", "creatives.image_auto_skipped", { correlation_id: correlationId, code: error.code, limitReached });
      if (limitReached) return { jobs, limitReached };
      continue;
    }
    const started = job as { job_id: string; reused: boolean };
    if (!started.reused) jobs.push({ jobId: started.job_id, creativeId: c.id, orgId: c.organization_id });
  }
  return { jobs, limitReached: false };
}

// ponytail: as imagens rodam em paralelo; se a conta OpenAI tiver limite baixo de imagens por minuto,
// algumas falham e o botão "Gerar imagem com IA" da lista refaz só as que faltaram.
function runImageJobs(jobs: ImageJobRef[], correlationId: string) {
  return Promise.all(jobs.map((j) => runImageJob(j.jobId, j.creativeId, j.orgId, correlationId)));
}

/** Gera com IA a imagem das peças da estratégia que ainda não têm imagem (em segundo plano). */
export async function generateMissingImages(strategyId: unknown): Promise<ApiResult<{ started: number }>> {
  const correlationId = await getCorrelationId();
  const id = uuid.safeParse(strategyId);
  if (!id.success) return apiError("validation_failed", "Estratégia inválida.", correlationId);
  const ctx = await getAppContext();
  if (ctx.mode !== "supabase" || !ctx.organization) {
    return apiError("feature_disabled", "Disponível no piloto com conta.", correlationId);
  }
  if (!selectImageProvider(serverEnv())) {
    return apiError("feature_disabled", "A geração de imagens ainda não está ativada.", correlationId);
  }

  const { jobs, limitReached } = await startMissingImageJobs(id.data, correlationId);
  if (jobs.length === 0 && limitReached) {
    return apiError(
      "credit_limit_reached",
      "Você já gerou as 20 imagens com IA deste mês. Envie uma foto ou aguarde o dia 1º.",
      correlationId,
    );
  }
  after(() => runImageJobs(jobs, correlationId));
  return { ok: true, data: { started: jobs.length }, correlation_id: correlationId };
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
    if (error.message.includes("credit_limit_reached")) {
      return apiError(
        "credit_limit_reached",
        "Você já gerou as 20 imagens com IA deste mês. Envie uma foto ou aguarde o dia 1º.",
        correlationId,
      );
    }
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
