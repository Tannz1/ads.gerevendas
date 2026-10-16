"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { newUuid } from "@/components/demo/demo-store";
import type { ApiError } from "@/contracts/api";
import type { GenerationJob } from "@/contracts/strategy";
import { getGenerationJob, requestStrategyGeneration } from "@/server/generation";

/** Consulta o status a cada 2 s, por até 5 min (depois disso o job é tratado como travado). */
export const POLL_INTERVAL_MS = 2_000;
export const POLL_MAX_MS = 5 * 60_000;
const MAX_NETWORK_FAILURES = 3;

export type JobSnapshot = Pick<GenerationJob, "id" | "status"> &
  Partial<Pick<GenerationJob, "attempts" | "max_attempts" | "error_code">>;
export type ErrorInfo = ApiError["error"];

export type GenerationState =
  | { phase: "idle" }
  | { phase: "requesting" }
  | { phase: "request_failed"; error: ErrorInfo }
  | { phase: "tracking"; job: JobSnapshot }
  | { phase: "succeeded"; job: JobSnapshot }
  | { phase: "failed"; job: JobSnapshot }
  | { phase: "timeout"; job: JobSnapshot }
  | { phase: "poll_failed"; job: JobSnapshot; error: ErrorInfo | null };

export const OFFLINE_ERROR: ErrorInfo = {
  code: "internal",
  message: "Sem conexão com o servidor. Verifique a internet e tente de novo.",
  correlation_id: "",
};

/**
 * Pede a geração (nova chave de idempotência por clique) e acompanha o job até terminar.
 * Quando dá certo, recarrega os dados da página (`router.refresh`).
 */
export function useStrategyGeneration(initialJob: GenerationJob | null) {
  const router = useRouter();
  const [state, setState] = useState<GenerationState>(
    initialJob ? { phase: "tracking", job: initialJob } : { phase: "idle" },
  );
  const startedAt = useRef(0);
  const failures = useRef(0);

  useEffect(() => {
    if (state.phase !== "tracking") return;
    if (!startedAt.current) startedAt.current = Date.now();
    const current = state.job;
    let cancelled = false;
    const timer = setTimeout(async () => {
      if (Date.now() - startedAt.current > POLL_MAX_MS) {
        setState({ phase: "timeout", job: current });
        return;
      }
      try {
        const res = await getGenerationJob(current.id);
        if (cancelled) return;
        if (!res.ok) {
          setState({ phase: "poll_failed", job: current, error: res.error });
          return;
        }
        failures.current = 0;
        const job = res.data;
        if (job.status === "succeeded") {
          setState({ phase: "succeeded", job });
          router.refresh();
        } else if (job.status === "failed") {
          setState({ phase: "failed", job });
        } else {
          setState({ phase: "tracking", job });
        }
      } catch {
        if (cancelled) return;
        failures.current += 1;
        setState(
          failures.current >= MAX_NETWORK_FAILURES
            ? { phase: "poll_failed", job: current, error: OFFLINE_ERROR }
            : { phase: "tracking", job: { ...current } },
        );
      }
    }, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [state, router]);

  async function start() {
    if (state.phase === "requesting" || state.phase === "tracking") return;
    setState({ phase: "requesting" });
    try {
      const res = await requestStrategyGeneration({ idempotency_key: newUuid() });
      if (!res.ok) {
        setState({ phase: "request_failed", error: res.error });
        return;
      }
      startedAt.current = Date.now();
      failures.current = 0;
      const job: JobSnapshot = { id: res.data.job_id, status: res.data.status };
      if (job.status === "succeeded") {
        setState({ phase: "succeeded", job });
        router.refresh();
      } else {
        // "failed" também segue para a consulta, que traz o código do erro.
        setState({ phase: "tracking", job });
      }
    } catch {
      setState({ phase: "request_failed", error: OFFLINE_ERROR });
    }
  }

  function checkAgain() {
    if (state.phase !== "timeout" && state.phase !== "poll_failed") return;
    startedAt.current = Date.now();
    failures.current = 0;
    setState({ phase: "tracking", job: state.job });
  }

  const busy = state.phase === "requesting" || state.phase === "tracking" || state.phase === "succeeded";
  return { state, start, checkAgain, busy };
}
