"use server";

import { after } from "next/server";
import { z } from "zod";
import { apiError, type ApiResult } from "@/contracts/api";
import { fieldErrors, onboardingSchema } from "@/contracts/onboarding";
import type { BriefFacts, GeneratedStrategy, GenerationJob, JobStatus, StrategyView } from "@/contracts/strategy";
import { serverEnv } from "@/lib/env";
import { resolveFlags } from "@/lib/flags";
import { log } from "@/lib/logger";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { factsFromOnboarding, loadBriefFacts } from "./ai/facts";
import { generateValidatedStrategy, ZERO_USAGE } from "./ai/pipeline";
import { getAiProvider, getDemoProvider, isProviderUnavailableError } from "./ai/provider";
import type { AiTextProvider } from "./ai/types";
import { getAppContext, getCorrelationId } from "./context";
import {
  abortQueuedJob,
  decideJobRecovery,
  isInvalidTransition,
  runGenerationJob,
  type RunGenerationJobInput,
} from "./job-runner";
import { getLatestSubmittedBrief, loadLatestStrategy, mapEnqueueError, readGenerationJob } from "./strategy-data";

/**
 * Server actions de geração de estratégia (ADR 0003). O pedido enfileira um job e responde na
 * hora; o trabalho roda em `after()` com a sessão do usuário. A UI consulta `getGenerationJob`.
 */

/** Simulação é local e instantânea. */
const MOCK_TIMEOUT_MS = 30_000;
/** Teto do pipeline real (2 chamadas), abaixo dos 5 min que marcam um job como travado. */
const MAX_PIPELINE_MS = 240_000;

const idempotencyKeySchema = z.string().regex(/^[A-Za-z0-9-]{8,64}$/, "Chave de idempotência inválida.");

function errorName(error: unknown): string {
  return error instanceof Error ? error.name : typeof error;
}

function resolveProvider(): { provider: AiTextProvider; timeoutMs: number } {
  const env = serverEnv();
  const provider = getAiProvider(env, resolveFlags(env));
  const timeoutMs = provider.isSimulation ? MOCK_TIMEOUT_MS : Math.min(env.OPENAI_TIMEOUT_MS * 2, MAX_PIPELINE_MS);
  return { provider, timeoutMs };
}

const PROVIDER_UNAVAILABLE_MESSAGE =
  "A geração com IA está indisponível no momento (desligada ou sem configuração). Tente mais tarde.";

/** Agenda o runner para depois da resposta. Cliente e fatos já vêm prontos da requisição. */
function scheduleRunner(input: Omit<RunGenerationJobInput, "sleep">) {
  after(async () => {
    try {
      await runGenerationJob(input);
    } catch (error) {
      log("error", "ai.job.runner_crashed", {
        correlation_id: input.correlationId,
        job_id: input.jobId,
        error_name: errorName(error),
      });
    }
  });
}

/** Enfileira a geração da estratégia para o brief submetido mais recente. */
export async function requestStrategyGeneration(input?: {
  idempotency_key?: string;
}): Promise<ApiResult<{ job_id: string; status: JobStatus }>> {
  const correlationId = await getCorrelationId();
  const ctx = await getAppContext();
  if (ctx.mode !== "supabase") {
    return apiError(
      "feature_disabled",
      "Modo demonstração: a estratégia é gerada como Simulação e não fica salva.",
      correlationId,
    );
  }
  if (!ctx.organization) return apiError("forbidden", "Crie sua empresa antes de continuar.", correlationId);
  const orgId = ctx.organization.id;

  let idempotencyKey: string = crypto.randomUUID();
  if (input?.idempotency_key !== undefined) {
    const parsed = idempotencyKeySchema.safeParse(input.idempotency_key);
    if (!parsed.success) {
      return apiError("validation_failed", "Pedido inválido.", correlationId, {
        idempotency_key: parsed.error.issues.map((i) => i.message),
      });
    }
    idempotencyKey = parsed.data;
  }

  let resolved: { provider: AiTextProvider; timeoutMs: number };
  try {
    resolved = resolveProvider();
  } catch (error) {
    if (isProviderUnavailableError(error)) {
      log("warn", "ai.provider_unavailable", { correlation_id: correlationId, reason: errorName(error) });
      return apiError("feature_disabled", PROVIDER_UNAVAILABLE_MESSAGE, correlationId);
    }
    log("error", "ai.provider_config_failed", { correlation_id: correlationId, error_name: errorName(error) });
    return apiError("internal", "Configuração do servidor inválida.", correlationId);
  }
  const { provider, timeoutMs } = resolved;

  try {
    const supabase = await createSupabaseServerClient();
    const brief = await getLatestSubmittedBrief(supabase, orgId);
    if (!brief) {
      return apiError("brief_not_ready", "Conclua o cadastro do negócio antes de gerar a estratégia.", correlationId);
    }

    const { data: jobId, error } = await supabase.rpc("enqueue_generation_job", {
      p_org: orgId,
      p_brief: brief.id,
      p_idempotency_key: idempotencyKey,
      p_provider: provider.name,
      p_model: provider.model,
      p_correlation_id: correlationId,
    });
    if (error) {
      const mapped = mapEnqueueError(error);
      log(mapped.code === "internal" ? "error" : "warn", "ai.job.enqueue_failed", {
        correlation_id: correlationId,
        organization_id: orgId,
        code: error.code,
        mapped_code: mapped.code,
      });
      return apiError(mapped.code, mapped.message, correlationId, mapped.field_errors);
    }

    const record = await readGenerationJob(supabase, orgId, String(jobId));
    if (!record) {
      log("error", "ai.job.enqueued_not_readable", { correlation_id: correlationId, job_id: String(jobId) });
      return apiError("internal", "Não foi possível acompanhar a geração. Tente novamente.", correlationId);
    }

    if (record.job.status === "queued") {
      // Fatos lidos agora, na requisição; o runner não acessa cookies/headers.
      const facts: BriefFacts = await loadBriefFacts(supabase, orgId, record.brief_id);
      scheduleRunner({
        supabase,
        jobId: record.job.id,
        facts,
        provider,
        correlationId,
        timeoutMs,
        expected: { provider: record.job.provider, model: record.model },
      });
    }

    log("info", "ai.job.requested", {
      correlation_id: correlationId,
      organization_id: orgId,
      job_id: record.job.id,
      status: record.job.status,
      provider: record.job.provider,
      is_simulation: record.job.is_simulation,
    });
    return { ok: true, data: { job_id: record.job.id, status: record.job.status }, correlation_id: correlationId };
  } catch (error) {
    log("error", "ai.job.request_failed", { correlation_id: correlationId, error_name: errorName(error) });
    return apiError("internal", "Não foi possível pedir a geração agora. Tente novamente.", correlationId);
  }
}

/**
 * Status do job. Também recupera jobs presos: "running" há mais de 5 min vira falha
 * (`stale_timeout`); "queued" parado há mais de 30 s é reagendado.
 */
export async function getGenerationJob(jobId: string): Promise<ApiResult<GenerationJob>> {
  const correlationId = await getCorrelationId();
  if (!z.uuid().safeParse(jobId).success) {
    return apiError("validation_failed", "Identificador inválido.", correlationId, {
      job_id: ["Identificador inválido."],
    });
  }
  const ctx = await getAppContext();
  if (ctx.mode !== "supabase") {
    return apiError("feature_disabled", "Modo demonstração: não há gerações salvas.", correlationId);
  }
  if (!ctx.organization) return apiError("forbidden", "Crie sua empresa antes de continuar.", correlationId);
  const orgId = ctx.organization.id;

  try {
    const supabase = await createSupabaseServerClient();
    let record = await readGenerationJob(supabase, orgId, jobId);
    if (!record) return apiError("not_found", "Geração não encontrada.", correlationId);

    const recovery = decideJobRecovery(record.job, Date.now());
    if (recovery === "mark_stale") {
      const { error } = await supabase.rpc("fail_generation_job", {
        p_job: jobId,
        p_error_code: "stale_timeout",
        p_retryable: false,
        p_usage: ZERO_USAGE,
      });
      if (error && !isInvalidTransition(error)) {
        log("error", "ai.job.stale_mark_failed", { correlation_id: correlationId, job_id: jobId, code: error.code });
      } else if (!error) {
        log("warn", "ai.job.marked_stale", { correlation_id: correlationId, job_id: jobId });
      }
      record = (await readGenerationJob(supabase, orgId, jobId)) ?? record;
    } else if (recovery === "reschedule") {
      let resolved: { provider: AiTextProvider; timeoutMs: number } | null = null;
      try {
        resolved = resolveProvider();
      } catch (error) {
        if (!isProviderUnavailableError(error)) throw error;
        // IA desligada: encerra o job para a tela não esperar para sempre.
        await abortQueuedJob({ supabase, jobId, code: "feature_disabled", correlationId });
        record = (await readGenerationJob(supabase, orgId, jobId)) ?? record;
      }
      if (resolved) {
        const facts = await loadBriefFacts(supabase, orgId, record.brief_id);
        scheduleRunner({
          supabase,
          jobId,
          facts,
          provider: resolved.provider,
          correlationId,
          timeoutMs: resolved.timeoutMs,
          expected: { provider: record.job.provider, model: record.model },
        });
        log("info", "ai.job.rescheduled", { correlation_id: correlationId, job_id: jobId });
      }
    }

    return { ok: true, data: record.job, correlation_id: correlationId };
  } catch (error) {
    log("error", "ai.job.read_failed", { correlation_id: correlationId, job_id: jobId, error_name: errorName(error) });
    return apiError("internal", "Não foi possível consultar a geração agora.", correlationId);
  }
}

/** Última estratégia (versão mais recente) do brief submetido mais recente, ou null. */
export async function getLatestStrategy(): Promise<ApiResult<StrategyView | null>> {
  const correlationId = await getCorrelationId();
  const ctx = await getAppContext();
  if (ctx.mode !== "supabase") {
    return apiError("feature_disabled", "Modo demonstração: não há estratégias salvas.", correlationId);
  }
  if (!ctx.organization) return apiError("forbidden", "Crie sua empresa antes de continuar.", correlationId);

  try {
    const supabase = await createSupabaseServerClient();
    const view = await loadLatestStrategy(supabase, ctx.organization.id);
    return { ok: true, data: view, correlation_id: correlationId };
  } catch (error) {
    log("error", "strategy.load_failed", { correlation_id: correlationId, error_name: errorName(error) });
    return apiError("internal", "Não foi possível carregar a estratégia agora.", correlationId);
  }
}

/**
 * Modo demonstração: gera a estratégia com o mock (sempre Simulação) a partir do onboarding
 * enviado pelo navegador. Nada é persistido.
 */
export async function generateStrategyDemo(
  onboarding: unknown,
): Promise<ApiResult<{ generated: GeneratedStrategy; is_simulation: true; facts: BriefFacts }>> {
  const correlationId = await getCorrelationId();
  const ctx = await getAppContext();
  if (ctx.mode !== "demo") {
    return apiError("feature_disabled", "A simulação local só existe no modo demonstração.", correlationId);
  }

  const parsed = onboardingSchema.safeParse(onboarding);
  if (!parsed.success) {
    return apiError("validation_failed", "Revise os campos destacados.", correlationId, fieldErrors(parsed.error));
  }

  try {
    const facts = factsFromOnboarding(parsed.data);
    const result = await generateValidatedStrategy(getDemoProvider(), facts, {
      signal: AbortSignal.timeout(MOCK_TIMEOUT_MS),
      correlationId,
    });
    log("info", "ai.demo.generated", {
      correlation_id: correlationId,
      concepts: result.generated.concepts.length,
      dropped_concepts: result.dropped_concepts,
    });
    return {
      ok: true,
      data: { generated: result.generated, is_simulation: true, facts },
      correlation_id: correlationId,
    };
  } catch (error) {
    log("error", "ai.demo.failed", { correlation_id: correlationId, error_name: errorName(error) });
    return apiError("internal", "Não foi possível gerar a simulação agora.", correlationId);
  }
}
