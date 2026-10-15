import "server-only";
import type { ServerEnv } from "@/lib/env";
import type { FeatureFlags } from "@/lib/flags";
import { createMockProvider } from "./mock";
import { createOpenAiProvider } from "./openai";
import { ProviderError, type AiTextProvider } from "./types";

/** Configuração da IA incompleta. A mensagem cita só nomes de variáveis, nunca valores. */
export class AiConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiConfigError";
  }
}

/**
 * Provider de texto conforme o ambiente. `mock` é determinístico e rotulado Simulação.
 * `openai` exige chave e modelo e é bloqueado pelo kill switch.
 */
export function getAiProvider(env: ServerEnv, flags: FeatureFlags): AiTextProvider {
  if (env.AI_PROVIDER === "mock") return createMockProvider();

  if (flags.killSwitch) {
    throw new ProviderError("feature_disabled", false, "Geração com IA desligada pelo kill switch.");
  }
  if (!env.OPENAI_API_KEY || !env.OPENAI_TEXT_MODEL) {
    throw new AiConfigError("AI_PROVIDER=openai exige OPENAI_API_KEY e OPENAI_TEXT_MODEL configurados no servidor.");
  }
  return createOpenAiProvider({
    apiKey: env.OPENAI_API_KEY,
    model: env.OPENAI_TEXT_MODEL,
    timeoutMs: env.OPENAI_TIMEOUT_MS,
    inputUsdPerMTok: env.OPENAI_TEXT_INPUT_USD_PER_MTOK,
    outputUsdPerMTok: env.OPENAI_TEXT_OUTPUT_USD_PER_MTOK,
  });
}

/** Modo demonstração: sempre o mock (nada sai do servidor, nada é persistido). */
export function getDemoProvider(): AiTextProvider {
  return createMockProvider();
}

/** Erro de configuração/kill switch ao escolher o provider (para mapear em `feature_disabled`). */
export function isProviderUnavailableError(error: unknown): error is AiConfigError | ProviderError {
  return error instanceof AiConfigError || (error instanceof ProviderError && error.code === "feature_disabled");
}
