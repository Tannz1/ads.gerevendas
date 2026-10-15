import "server-only";
import type { AiProviderName, BriefFacts, JobErrorCode, Usage } from "@/contracts/strategy";

/**
 * Contrato de um provider de texto. `output` é desconhecido de propósito: quem chama valida
 * com `generatedStrategySchema` e passa pelo fact-guard antes de persistir.
 */
export interface AiTextProvider {
  readonly name: AiProviderName;
  readonly model: string | null;
  /** true para o mock: a UI precisa rotular o resultado como Simulação. */
  readonly isSimulation: boolean;
  generateStrategy(
    facts: BriefFacts,
    options: {
      signal: AbortSignal;
      /** Problemas da tentativa anterior (fact-guard/validação) para a IA corrigir. */
      feedback?: string[];
      correlationId?: string;
    },
  ): Promise<{ output: unknown; usage: Usage }>;
}

/** Erro tipado de provider; `retryable` decide se o job volta para a fila. */
export class ProviderError extends Error {
  constructor(
    readonly code: JobErrorCode,
    readonly retryable: boolean,
    message: string,
    readonly usage?: Usage,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}
