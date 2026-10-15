import type { z } from "zod";
import {
  CTA_BY_OBJECTIVE,
  generatedStrategySchema,
  type BriefFacts,
  type GeneratedStrategy,
  type Usage,
} from "@/contracts/strategy";
import { log } from "@/lib/logger";
import { checkGeneratedAgainstFacts, conceptIndexOfPath, type FactIssue } from "./fact-guard";
import { ProviderError, type AiTextProvider } from "./types";

/**
 * Pipeline de geração validada (ADR 0003, item 5):
 * tentativa 1 → Zod → coerções determinísticas → fact-guard; com problema, tentativa 2 com os
 * problemas como feedback. Depois da 2ª: saída inválida ou problema na estratégia = falha;
 * conceitos com problema são descartados (mínimo de 3).
 */

export const MIN_CONCEPTS = 3;
const MAX_ATTEMPTS = 2;

export type PipelineResult = {
  generated: GeneratedStrategy;
  usage: Usage;
  dropped_concepts: number;
  /** Chamadas ao provider (1 ou 2). */
  attempts: number;
};

export const ZERO_USAGE: Usage = { input_tokens: 0, output_tokens: 0, cost_micro_usd: 0 };

export function addUsage(a: Usage, b: Usage | undefined): Usage {
  if (!b) return { ...a };
  return {
    input_tokens: a.input_tokens + b.input_tokens,
    output_tokens: a.output_tokens + b.output_tokens,
    cost_micro_usd: a.cost_micro_usd + b.cost_micro_usd,
  };
}

/**
 * Correções determinísticas que não mudam o sentido: sem preço confirmado, nenhum conceito
 * mostra preço; CTA fora do objetivo vira o primeiro CTA permitido.
 */
export function coerceGenerated(gen: GeneratedStrategy, facts: BriefFacts): GeneratedStrategy {
  const allowed = CTA_BY_OBJECTIVE[facts.objective];
  return {
    strategy: gen.strategy,
    concepts: gen.concepts.map((c) => ({
      ...c,
      show_price: facts.price_cents === null ? false : c.show_price,
      cta: allowed.includes(c.cta) ? c.cta : allowed[0],
    })),
  };
}

/** Problemas do Zod em linhas curtas para a nova tentativa. */
export function zodFeedback(error: z.ZodError): string[] {
  return error.issues.map((issue) => `${formatPath(issue.path) || "(raiz)"}: ${issue.message}`);
}

export function issuesFeedback(issues: readonly FactIssue[]): string[] {
  return issues.map((i) => `${i.path}: ${i.message}`);
}

function formatPath(path: readonly PropertyKey[]): string {
  return path.reduce<string>((acc, key) => {
    if (typeof key === "number") return `${acc}[${key}]`;
    return acc ? `${acc}.${String(key)}` : String(key);
  }, "");
}

type Evaluation =
  | { kind: "invalid"; feedback: string[]; issueCount: number }
  | { kind: "parsed"; generated: GeneratedStrategy; issues: FactIssue[] };

function evaluate(output: unknown, facts: BriefFacts): Evaluation {
  const parsed = generatedStrategySchema.safeParse(output);
  if (!parsed.success) {
    return { kind: "invalid", feedback: zodFeedback(parsed.error), issueCount: parsed.error.issues.length };
  }
  const generated = coerceGenerated(parsed.data, facts);
  return { kind: "parsed", generated, issues: checkGeneratedAgainstFacts(generated, facts) };
}

export async function generateValidatedStrategy(
  provider: AiTextProvider,
  facts: BriefFacts,
  options: { signal: AbortSignal; correlationId?: string },
): Promise<PipelineResult> {
  const { signal, correlationId } = options;
  let usage: Usage = { ...ZERO_USAGE };
  let feedback: string[] | undefined;
  let evaluation: Evaluation | null = null;
  let attempts = 0;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    if (signal.aborted) {
      throw new ProviderError("provider_timeout", true, "Tempo esgotado antes de nova tentativa.", usage);
    }
    attempts = attempt;
    let result: { output: unknown; usage: Usage };
    try {
      result = await provider.generateStrategy(facts, { signal, feedback, correlationId });
    } catch (error) {
      if (error instanceof ProviderError) {
        throw new ProviderError(error.code, error.retryable, error.message, addUsage(usage, error.usage));
      }
      throw error;
    }
    usage = addUsage(usage, result.usage);
    evaluation = evaluate(result.output, facts);

    if (evaluation.kind === "parsed" && evaluation.issues.length === 0) {
      return { generated: evaluation.generated, usage, dropped_concepts: 0, attempts };
    }
    if (attempt < MAX_ATTEMPTS) {
      feedback = evaluation.kind === "invalid" ? evaluation.feedback : issuesFeedback(evaluation.issues);
      log("info", "ai.pipeline.retry_with_feedback", {
        correlation_id: correlationId,
        provider: provider.name,
        reason: evaluation.kind === "invalid" ? "invalid_output" : "fact_check",
        // Só caminhos e contagens: nunca o conteúdo gerado.
        issue_count: evaluation.kind === "invalid" ? evaluation.issueCount : evaluation.issues.length,
        issue_paths:
          evaluation.kind === "parsed" ? [...new Set(evaluation.issues.map((i) => i.path))].slice(0, 20) : [],
      });
    }
  }

  if (!evaluation || evaluation.kind === "invalid") {
    throw new ProviderError("invalid_output", false, "A saída do provider não seguiu o contrato.", usage);
  }

  const strategyIssues = evaluation.issues.filter((i) => conceptIndexOfPath(i.path) === null);
  if (strategyIssues.length > 0) {
    log("warn", "ai.pipeline.fact_check_failed", {
      correlation_id: correlationId,
      provider: provider.name,
      scope: "strategy",
      issue_paths: strategyIssues.map((i) => i.path).slice(0, 20),
    });
    throw new ProviderError("fact_check_failed", false, "A estratégia citou informações não confirmadas.", usage);
  }

  const badConcepts = new Set(evaluation.issues.map((i) => conceptIndexOfPath(i.path)));
  const concepts = evaluation.generated.concepts.filter((_, index) => !badConcepts.has(index));
  const dropped = evaluation.generated.concepts.length - concepts.length;
  log("warn", "ai.pipeline.dropped_concepts", {
    correlation_id: correlationId,
    provider: provider.name,
    dropped_concepts: dropped,
    remaining_concepts: concepts.length,
  });
  if (concepts.length < MIN_CONCEPTS) {
    throw new ProviderError("fact_check_failed", false, "Poucos conceitos passaram na checagem de veracidade.", usage);
  }
  return {
    generated: { strategy: evaluation.generated.strategy, concepts },
    usage,
    dropped_concepts: dropped,
    attempts,
  };
}
