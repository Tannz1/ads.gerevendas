"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { apiError, type ApiResult } from "@/contracts/api";
import { serverEnv } from "@/lib/env";
import { detectImage, MAX_PHOTO_BYTES, type ImageKind } from "@/lib/image-bytes";
import { log } from "@/lib/logger";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { MAX_SCRIPT_CHARS, type VoiceVideoProvider } from "./ai/elevenlabs";
import { checkTexts } from "./ai/facts";
import { ProviderError } from "./ai/openai-text";
import { selectVoiceVideoProvider } from "./ai/provider";
import { getAppContext, getCorrelationId } from "./context";
import { ASSETS_BUCKET, VIDEOS_BUCKET } from "./creatives-data";
import type { JobView } from "./creatives";

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>;

const uuid = z.uuid();
const MODEL = "creatify-aurora";
const MAX_VIDEO_BYTES = 50 * 1024 * 1024;

/** Provedor só com chave e pelo menos uma voz configurada. */
function videoProvider(): VoiceVideoProvider | null {
  const env = serverEnv();
  return env.ELEVENLABS_VOICE_IDS.length > 0 ? selectVoiceVideoProvider(env) : null;
}

/** O roteiro passa pela mesma checagem de fatos das peças: preço e promessas só se o cliente confirmou. */
async function scriptViolations(supabase: Supabase, creativeId: string, script: string): Promise<string[] | null> {
  const { data } = await supabase
    .from("creatives")
    .select(
      "strategies(briefs(audience_description, businesses(name), offers(name, description, price_cents, differentiators)))",
    )
    .eq("id", creativeId)
    .maybeSingle();
  const brief = (
    data as unknown as {
      strategies: {
        briefs: {
          audience_description: string;
          businesses: { name: string };
          offers: { name: string; description: string; price_cents: number | null; differentiators: string[] };
        };
      };
    } | null
  )?.strategies.briefs;
  if (!brief) return null;
  return checkTexts([script], {
    price_cents: brief.offers.price_cents,
    confirmed_text: [
      brief.businesses.name,
      brief.offers.name,
      brief.offers.description,
      brief.audience_description,
      ...brief.offers.differentiators,
    ].join("\n"),
  });
}

async function failJob(supabase: Supabase, jobId: string, code: string, correlationId: string) {
  log("warn", "creatives.video_failed", { correlation_id: correlationId, job_id: jobId, error_code: code });
  await supabase.rpc("fail_generation_job", { p_job: jobId, p_code: code, p_provider: "elevenlabs", p_model: MODEL });
}

/** Narração + pedido do avatar. A conclusão vem de `checkVideoJob` (sobrevive a reinício do container). */
async function runVideoJob(
  jobId: string,
  photo: { bytes: Uint8Array; mime: ImageKind["mime"] },
  script: string,
  voiceId: string,
  correlationId: string,
) {
  const supabase = await createSupabaseServerClient();
  const provider = videoProvider();
  if (!provider) return failJob(supabase, jobId, "feature_disabled", correlationId);
  try {
    const audio = await provider.speech(script, voiceId);
    const generationId = await provider.createAvatarVideo(photo, audio);
    const { error } = await supabase.rpc("set_video_generation", { p_job: jobId, p_generation_id: generationId });
    if (error) {
      // A geração existe (e foi cobrada) na ElevenLabs: o ID fica no log para conferência.
      log("error", "creatives.video_generation_unsaved", {
        correlation_id: correlationId,
        job_id: jobId,
        generation_id: generationId,
        code: error.code,
      });
      return failJob(supabase, jobId, "internal", correlationId);
    }
    log("info", "creatives.video_requested", {
      correlation_id: correlationId,
      job_id: jobId,
      generation_id: generationId,
    });
  } catch (e) {
    await failJob(supabase, jobId, e instanceof ProviderError ? e.code : "internal", correlationId);
  }
}

/** Pede o vídeo com avatar da peça: foto do rosto (com consentimento), roteiro e voz. */
export async function startAvatarVideo(formData: FormData): Promise<ApiResult<{ job_id: string }>> {
  const correlationId = await getCorrelationId();
  const id = uuid.safeParse(formData.get("creative_id"));
  const script = String(formData.get("script") ?? "").trim();
  const voiceId = String(formData.get("voice_id") ?? "");
  const file = formData.get("file");
  if (!id.success) return apiError("validation_failed", "Peça inválida.", correlationId);

  const provider = videoProvider();
  if (!provider) return apiError("feature_disabled", "O vídeo com avatar ainda não está ativado.", correlationId);

  const fields: Record<string, string[]> = {};
  if (!script || script.length > MAX_SCRIPT_CHARS) {
    fields.script = [`Escreva o roteiro com até ${MAX_SCRIPT_CHARS} caracteres.`];
  }
  if (!serverEnv().ELEVENLABS_VOICE_IDS.includes(voiceId)) fields.voice_id = ["Escolha uma das vozes."];
  if (formData.get("rights") !== "on") fields.rights = ["Confirme que você tem direito de usar esta foto."];
  if (formData.get("likeness") !== "on") {
    fields.likeness = ["Confirme que o rosto é seu ou que a pessoa autorizou o uso."];
  }
  if (!(file instanceof File) || file.size === 0) fields.file = ["Escolha uma foto do rosto."];
  else if (file.size > MAX_PHOTO_BYTES) fields.file = ["Use uma foto de até 5 MB."];
  if (Object.keys(fields).length > 0) {
    return apiError("validation_failed", "Revise os campos destacados.", correlationId, fields);
  }
  const bytes = new Uint8Array(await (file as File).arrayBuffer());
  const kind = detectImage(bytes);
  if (!kind) {
    return apiError("validation_failed", "Formato não aceito.", correlationId, { file: ["Use uma foto JPG ou PNG."] });
  }

  const ctx = await getAppContext();
  if (ctx.mode !== "supabase" || !ctx.organization) {
    return apiError("feature_disabled", "Disponível no piloto com conta.", correlationId);
  }
  const supabase = await createSupabaseServerClient();
  const violations = await scriptViolations(supabase, id.data, script);
  if (!violations) return apiError("not_found", "Peça não encontrada.", correlationId);
  if (violations.length > 0) {
    return apiError(
      "facts_not_confirmed",
      "O roteiro tem preço, desconto ou promessa que não está no seu cadastro.",
      correlationId,
      { script: ["Tire do roteiro o que você não confirmou no cadastro do negócio."] },
    );
  }

  const assetId = randomUUID();
  const path = `${ctx.organization.id}/${assetId}.${kind.ext}`;
  const up = await supabase.storage.from(ASSETS_BUCKET).upload(path, bytes, { contentType: kind.mime, upsert: false });
  if (up.error) {
    log("error", "creatives.avatar_photo_upload_failed", { correlation_id: correlationId });
    return apiError("internal", "Não foi possível enviar a foto agora.", correlationId);
  }

  const { data, error } = await supabase.rpc("start_video_job", {
    p_creative: id.data,
    p_script: script,
    p_voice_id: voiceId,
    p_photo_asset: assetId,
    p_photo_path: path,
    p_photo_mime: kind.mime,
    p_photo_bytes: bytes.length,
    p_likeness_consent: true,
    p_correlation_id: correlationId,
  });
  const reused = (data as { reused?: boolean } | null)?.reused === true;
  if (error || reused) await supabase.storage.from(ASSETS_BUCKET).remove([path]);
  if (error) {
    if (error.code === "42501") return apiError("forbidden", "Sem permissão para esta peça.", correlationId);
    if (error.message.includes("credit_limit_reached")) {
      return apiError("credit_limit_reached", "Você chegou ao limite de vídeos deste mês.", correlationId);
    }
    log("error", "creatives.video_start_failed", { correlation_id: correlationId, code: error.code });
    return apiError("internal", "Não foi possível começar agora.", correlationId);
  }

  const jobId = (data as { job_id: string }).job_id;
  if (!reused) after(() => runVideoJob(jobId, { bytes, mime: kind.mime }, script, voiceId, correlationId));
  return { ok: true, data: { job_id: jobId }, correlation_id: correlationId };
}

const isMp4 = (b: Uint8Array) => b.length > 8 && String.fromCharCode(b[4], b[5], b[6], b[7]) === "ftyp";

/** Baixa o MP4 pronto (a URL da ElevenLabs expira em ~1 h) e grava no Storage privado. */
async function saveVideo(supabase: Supabase, job: { id: string; organization_id: string }, url: string) {
  if (!url.startsWith("https://")) return "invalid_output";
  const res = await fetch(url, { signal: AbortSignal.timeout(120_000) }).catch(() => null);
  if (!res?.ok) return "external_unavailable";
  if (Number(res.headers.get("content-length") ?? 0) > MAX_VIDEO_BYTES) return "invalid_output";
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.length > MAX_VIDEO_BYTES || !isMp4(bytes)) return "invalid_output";

  // Caminho fixo pelo job: duas conclusões simultâneas não criam dois arquivos.
  const path = `${job.organization_id}/${job.id}.mp4`;
  const up = await supabase.storage
    .from(VIDEOS_BUCKET)
    .upload(path, bytes, { contentType: "video/mp4", upsert: false });
  if (up.error) return "busy";
  const { error } = await supabase.rpc("finish_video_job", {
    p_job: job.id,
    p_storage_path: path,
    p_bytes: bytes.length,
    p_provider: "elevenlabs",
    p_model: MODEL,
  });
  if (error) {
    await supabase.storage.from(VIDEOS_BUCKET).remove([path]);
    return "internal";
  }
  return null;
}

/**
 * Estado do job de vídeo para o polling da tela. Com a geração pedida, consulta a ElevenLabs e,
 * quando pronta, grava o vídeo na peça.
 */
export async function checkVideoJob(jobId: unknown): Promise<ApiResult<JobView>> {
  const correlationId = await getCorrelationId();
  const id = uuid.safeParse(jobId);
  if (!id.success) return apiError("validation_failed", "Job inválido.", correlationId);
  const supabase = await createSupabaseServerClient();
  const { data: job } = await supabase
    .from("generation_jobs")
    .select("id, organization_id, status, error_code, started_at, external_generation_id")
    .eq("id", id.data)
    .eq("kind", "video")
    .maybeSingle();
  if (!job) return apiError("not_found", "Job não encontrado.", correlationId);
  const ok = (data: JobView): ApiResult<JobView> => ({ ok: true, data, correlation_id: correlationId });

  if (job.status !== "running") return ok({ status: job.status, error_code: job.error_code });
  if (!job.external_generation_id) {
    const stale = Date.now() - new Date(job.started_at).getTime() > 5 * 60_000;
    return ok(stale ? { status: "failed", error_code: "timeout" } : { status: "running", error_code: null });
  }

  const provider = videoProvider();
  if (!provider) return ok({ status: "running", error_code: null });
  try {
    const gen = await provider.getVideo(job.external_generation_id);
    if (gen.status === "failed") {
      const code = gen.failure_reason === "moderated" ? "moderated" : "external_failed";
      await failJob(supabase, job.id, code, correlationId);
      revalidatePath("/app/criativos", "layout");
      return ok({ status: "failed", error_code: code });
    }
    if (gen.status !== "completed") return ok({ status: "running", error_code: null });

    const failure = await saveVideo(supabase, job, gen.content_url);
    // "busy": outra consulta está gravando o mesmo vídeo agora.
    if (failure === "busy" || failure === "external_unavailable") return ok({ status: "running", error_code: null });
    if (failure) {
      await failJob(supabase, job.id, failure, correlationId);
      return ok({ status: "failed", error_code: failure });
    }
    log("info", "creatives.video_generated", { correlation_id: correlationId, job_id: job.id });
    revalidatePath("/app/criativos", "layout");
    return ok({ status: "succeeded", error_code: null });
  } catch {
    // ElevenLabs fora do ar: tenta de novo no próximo polling.
    return ok({ status: "running", error_code: null });
  }
}

/** Tira o vídeo da peça (o arquivo continua guardado). A peça volta a ser publicada como imagem. */
export async function removeVideo(creativeId: unknown): Promise<ApiResult<{ removed: true }>> {
  const correlationId = await getCorrelationId();
  const id = uuid.safeParse(creativeId);
  if (!id.success) return apiError("validation_failed", "Peça inválida.", correlationId);
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("creatives").update({ video_id: null }).eq("id", id.data).select("id");
  if (error) return apiError("internal", "Não foi possível remover agora.", correlationId);
  if (!data?.length) return apiError("not_found", "Peça não encontrada.", correlationId);
  revalidatePath("/app/criativos", "layout");
  return { ok: true, data: { removed: true }, correlation_id: correlationId };
}
