import "server-only";
import type { BriefFacts, GenerationJob, JobErrorCode, Usage } from "@/contracts/strategy";
import { log } from "@/lib/logger";
import { generateValidatedStrategy, ZERO_USAGE } from "./ai/pipeline";
import { ProviderError, type AiTextProvider } from "./ai/types";

/**
 * Runner de jobs de geração (ADR 0003, item 1). Roda em `after()` com a sessão do usuário que
 * pediu (sem service role). As transições de estado são feitas pelas RPCs; quem não consegue
 * iniciar (`invalid_transition`) sabe que outro runner já pegou o job e sai em silêncio.
 * Logs: só ids, tentativas, provider, duração, tokens e custo; nunca fatos ou chaves.
 */

export type RpcError = { code?: string | null; message: string };
/** Subconjunto do cliente Supabase usado aqui (facilita testes com cliente falso). */
export type RpcClient = {
  rpc(fn: string, args?: Record<string, unknown>): PromiseLike<{ data: unknown; error: RpcError | null }>;
};

/** Espera entre tentativas: 2 s depois da 1ª falha, 4 s depois da 2ª. */
export const RETRY_BACKOFF_MS = [2_000, 4_000] as const;
/** Job "running" há mais tempo que isto é considerado travado. */
export const STALE_RUNNING_MS = 5 * 60_000;
/** Job "queued" parado há mais tempo que isto é reagendado. */
export const REQUEUE_AFTER_MS = 30_000;
/** Teto de voltas do laço (o banco limita tentativas; isto é só proteção). */
const MAX_LOOPS = 8;

export type RunGenerationJobInput = {
  supabase: RpcClient;
  jobId: string;
  facts: BriefFacts;
  provider: AiTextProvider;
  correlationId: string;
  /** Tempo máximo de cada execução do pipeline (até 2 chamadas ao provider). */
  timeoutMs: number;
  /** Provider/modelo gravados no job: se não baterem com o provider atual, o job falha. */
  expected?: { provider: string; model: string | null };
  sleep?: (ms: number) => Promise<void>;
};

export type RunGenerationJobOutcome =
  | { status: "succeeded"; strategy_id: string; attempts: number }
  | { status: "failed"; error_code: JobErrorCode; attempts: number }
  | { status: "skipped"; reason: "not_queued" | "start_failed" | "lost_ownership" | "fail_rpc_failed" };

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function isInvalidTransition(error: RpcError | null | undefined): boolean {
  return Boolean(error && error.code === "P0001" && error.message.includes("invalid_transition"));
}

/** Erro do banco ao concluir: conteúdo recusado pelas regras do banco não adianta repetir. */
function completeErrorCode(error: RpcError): JobErrorCode {
  if (error.code === "P0001" && /invalid_output|price_not_confirmed|price_mismatch/.test(error.message)) {
    return "invalid_output";
  }
  return "internal";
}

export async function runGenerationJob(input: RunGenerationJobInput): Promise<RunGenerationJobOutcome> {
  const { supabase, jobId, facts, provider, correlationId, timeoutMs } = input;
  const sleep = input.sleep ?? defaultSleep;
  const base = { correlation_id: correlationId, job_id: jobId, provider: provider.name, model: provider.model };

  for (let loop = 0; loop < MAX_LOOPS; loop++) {
    const start = await supabase.rpc("start_generation_job", { p_job: jobId });
    if (start.error) {
      if (isInvalidTransition(start.error)) {
        log("info", "ai.job.skipped", { ...base, reason: "not_queued" });
        return { status: "skipped", reason: "not_queued" };
      }
      log("error", "ai.job.start_failed", { ...base, code: start.error.code });
      return { status: "skipped", reason: "start_failed" };
    }
    const attempt = Number(start.data) || loop + 1;
    const started = Date.now();
    log("info", "ai.job.started", { ...base, attempt });

    let failure: ProviderError;
    if (input.expected && (input.expected.provider !== provider.name || input.expected.model !== provider.model)) {
      // Nunca gravar conteúdo com rótulo de provider/simulação diferente do que o gerou.
      log("warn", "ai.job.provider_mismatch", {
        ...base,
        attempt,
        expected_provider: input.expected.provider,
        expected_model: input.expected.model,
      });
      failure = new ProviderError("feature_disabled", false, "Provider do job diferente do configurado.");
    } else {
      try {
        const result = await generateValidatedStrategy(provider, facts, {
          signal: AbortSignal.timeout(timeoutMs),
          correlationId,
        });
        const complete = await supabase.rpc("complete_generation_job", {
          p_job: jobId,
          p_strategy: result.generated.strategy,
          p_concepts: result.generated.concepts,
          p_usage: result.usage,
        });
        if (!complete.error) {
          log("info", "ai.job.succeeded", {
            ...base,
            attempt,
            duration_ms: Date.now() - started,
            provider_calls: result.attempts,
            dropped_concepts: result.dropped_concepts,
            ...usageFields(result.usage),
            strategy_id: complete.data,
          });
          return { status: "succeeded", strategy_id: String(complete.data), attempts: attempt };
        }
        if (isInvalidTransition(complete.error)) {
          // Outro processo marcou o job (ex.: travado) enquanto gerávamos.
          log("warn", "ai.job.lost_ownership", { ...base, attempt, duration_ms: Date.now() - started });
          return { status: "skipped", reason: "lost_ownership" };
        }
        log("error", "ai.job.complete_failed", { ...base, attempt, code: complete.error.code });
        failure = new ProviderError(
          completeErrorCode(complete.error),
          false,
          "Falha ao gravar a estratégia.",
          result.usage,
        );
      } catch (error) {
        if (error instanceof ProviderError) {
          failure = error;
        } else {
          log("error", "ai.job.unexpected_error", {
            ...base,
            attempt,
            error_name: error instanceof Error ? error.name : typeof error,
          });
          failure = new ProviderError("internal", false, "Erro inesperado na geração.");
        }
      }
    }

    const usage: Usage = failure.usage ?? ZERO_USAGE;
    const fail = await supabase.rpc("fail_generation_job", {
      p_job: jobId,
      p_error_code: failure.code,
      p_retryable: failure.retryable,
      p_usage: usage,
    });
    const fields = {
      ...base,
      attempt,
      duration_ms: Date.now() - started,
      error_code: failure.code,
      retryable: failure.retryable,
      ...usageFields(usage),
    };
    if (fail.error) {
      log("error", "ai.job.fail_rpc_failed", { ...fields, code: fail.error.code });
      return { status: "skipped", reason: isInvalidTransition(fail.error) ? "lost_ownership" : "fail_rpc_failed" };
    }
    if (fail.data === "queued") {
      const delay = RETRY_BACKOFF_MS[Math.min(attempt - 1, RETRY_BACKOFF_MS.length - 1)] ?? 4_000;
      log("warn", "ai.job.retry_scheduled", { ...fields, backoff_ms: delay });
      await sleep(delay);
      continue;
    }
    log("error", "ai.job.failed", fields);
    return { status: "failed", error_code: failure.code, attempts: attempt };
  }

  log("error", "ai.job.loop_limit", base);
  return { status: "skipped", reason: "fail_rpc_failed" };
}

/**
 * Encerra um job que está na fila mas não pode rodar (ex.: IA desligada): inicia e falha sem
 * nova tentativa, para a UI não ficar esperando para sempre.
 */
export async function abortQueuedJob(input: {
  supabase: RpcClient;
  jobId: string;
  code: JobErrorCode;
  correlationId: string;
}): Promise<void> {
  const base = { correlation_id: input.correlationId, job_id: input.jobId, error_code: input.code };
  const start = await input.supabase.rpc("start_generation_job", { p_job: input.jobId });
  if (start.error) {
    if (!isInvalidTransition(start.error))
      log("error", "ai.job.abort_start_failed", { ...base, code: start.error.code });
    return;
  }
  const fail = await input.supabase.rpc("fail_generation_job", {
    p_job: input.jobId,
    p_error_code: input.code,
    p_retryable: false,
    p_usage: ZERO_USAGE,
  });
  if (fail.error) log("error", "ai.job.abort_fail_failed", { ...base, code: fail.error.code });
  else log("warn", "ai.job.aborted", base);
}

export type JobRecovery = "mark_stale" | "reschedule" | "none";

/**
 * Recuperação ao consultar o status: "running" há mais de 5 min é travado; "queued" parado há
 * mais de 30 s (desde a criação ou do último início) é reagendado. A transição de início no
 * banco impede execução duplicada.
 */
export function decideJobRecovery(
  job: Pick<GenerationJob, "status" | "created_at" | "started_at">,
  nowMs: number,
): JobRecovery {
  const created = Date.parse(job.created_at);
  const started = job.started_at ? Date.parse(job.started_at) : NaN;
  if (job.status === "running") {
    return Number.isFinite(started) && nowMs - started > STALE_RUNNING_MS ? "mark_stale" : "none";
  }
  if (job.status === "queued") {
    const lastActivity = Math.max(Number.isFinite(created) ? created : 0, Number.isFinite(started) ? started : 0);
    return lastActivity > 0 && nowMs - lastActivity > REQUEUE_AFTER_MS ? "reschedule" : "none";
  }
  return "none";
}

/** Campos de uso/custo para os logs estruturados. */
function usageFields(usage: Usage) {
  return {
    input_tokens: usage.input_tokens,
    output_tokens: usage.output_tokens,
    cost_micro_usd: usage.cost_micro_usd,
  };
}
