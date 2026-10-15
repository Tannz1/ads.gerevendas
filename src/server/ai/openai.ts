import "server-only";
import type { BriefFacts, Usage } from "@/contracts/strategy";
import { log } from "@/lib/logger";
import { generatedStrategyJsonSchemaFor } from "./json-schema";
import { buildSystemPrompt, buildUserPrompt, PROMPT_VERSION } from "./prompts";
import { ProviderError, type AiTextProvider } from "./types";

/**
 * Provider OpenAI (Responses API com saída estruturada estrita). A chave vem do ambiente do
 * servidor e nunca é logada. Erros viram `ProviderError` com `retryable` para o job decidir.
 */

export const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
export const STRATEGY_SCHEMA_NAME = "gerevendas_strategy";
const DEFAULT_MAX_OUTPUT_TOKENS = 8_000;

export type OpenAiProviderConfig = {
  apiKey: string;
  model: string;
  /** Tempo máximo de cada chamada HTTP. */
  timeoutMs: number;
  /** USD por 1 milhão de tokens (= micro-USD por token). Sem valor, o custo fica 0. */
  inputUsdPerMTok?: number;
  outputUsdPerMTok?: number;
  maxOutputTokens?: number;
  /** Injetável em testes; padrão: `fetch` global. */
  fetchImpl?: typeof fetch;
};

type TokenCounts = { input_tokens: number; output_tokens: number };

/** Custo estimado em micro-USD; null quando o preço por token não está configurado. */
export function estimateCostMicroUsd(
  tokens: TokenCounts,
  prices: Pick<OpenAiProviderConfig, "inputUsdPerMTok" | "outputUsdPerMTok">,
): number | null {
  if (prices.inputUsdPerMTok === undefined || prices.outputUsdPerMTok === undefined) return null;
  return Math.round(tokens.input_tokens * prices.inputUsdPerMTok + tokens.output_tokens * prices.outputUsdPerMTok);
}

/** Corpo da requisição para `POST /v1/responses`. */
export function buildOpenAiRequestBody(
  model: string,
  facts: BriefFacts,
  feedback: readonly string[] | undefined,
  maxOutputTokens = DEFAULT_MAX_OUTPUT_TOKENS,
) {
  return {
    model,
    instructions: buildSystemPrompt(),
    input: buildUserPrompt(facts, feedback),
    text: {
      format: {
        type: "json_schema",
        name: STRATEGY_SCHEMA_NAME,
        strict: true,
        schema: generatedStrategyJsonSchemaFor(facts.objective),
      },
    },
    max_output_tokens: maxOutputTokens,
    // Não guardar o conteúdo (dados do cliente) na OpenAI além do necessário.
    store: false,
  };
}

const count = (value: unknown) => (typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : 0);

type ResponsesBody = {
  status?: unknown;
  incomplete_details?: { reason?: unknown } | null;
  output?: unknown;
  usage?: { input_tokens?: unknown; output_tokens?: unknown } | null;
};

/** Lê tokens da resposta (campos ausentes contam 0). */
export function tokensFromResponse(body: unknown): TokenCounts {
  const usage = (body as ResponsesBody | null)?.usage;
  return { input_tokens: count(usage?.input_tokens), output_tokens: count(usage?.output_tokens) };
}

/**
 * Extrai o JSON gerado de uma resposta da Responses API. Recusa → `invalid_output` não
 * retentável; resposta incompleta ou sem texto → `invalid_output` retentável.
 */
export function parseResponsesOutput(body: unknown, usage: Usage): unknown {
  const response = (body ?? {}) as ResponsesBody;
  if (response.status === "incomplete") {
    const reason = typeof response.incomplete_details?.reason === "string" ? response.incomplete_details.reason : "?";
    throw new ProviderError("invalid_output", true, `Resposta incompleta do modelo (${reason}).`, usage);
  }
  if (response.status === "failed") {
    throw new ProviderError("provider_unavailable", true, "O provider informou falha ao gerar a resposta.", usage);
  }

  let text: string | null = null;
  const items = Array.isArray(response.output) ? response.output : [];
  for (const item of items) {
    const content = (item as { content?: unknown } | null)?.content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      const type = (part as { type?: unknown } | null)?.type;
      if (type === "refusal") {
        throw new ProviderError("invalid_output", false, "O modelo recusou gerar a estratégia.", usage);
      }
      if (type === "output_text" && text === null) {
        const value = (part as { text?: unknown }).text;
        if (typeof value === "string") text = value;
      }
    }
  }
  if (text === null) throw new ProviderError("invalid_output", true, "Resposta sem texto de saída.", usage);

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderError("invalid_output", true, "Resposta com JSON inválido.", usage);
  }
}

/** Mapeia status HTTP de erro para o erro do job. */
export function errorFromHttpStatus(status: number, usage?: Usage): ProviderError {
  if (status === 429)
    return new ProviderError("provider_rate_limited", true, "Limite de requisições do provider.", usage);
  if (status === 408) return new ProviderError("provider_timeout", true, "Tempo esgotado no provider.", usage);
  if (status >= 500)
    return new ProviderError("provider_unavailable", true, `Provider indisponível (${status}).`, usage);
  return new ProviderError("internal", false, `Requisição recusada pelo provider (${status}).`, usage);
}

/** Erros de rede/abort do fetch. */
export function errorFromFetchFailure(error: unknown): ProviderError {
  const name = (error as { name?: unknown } | null)?.name;
  if (name === "AbortError" || name === "TimeoutError") {
    return new ProviderError("provider_timeout", true, "Tempo esgotado ao chamar o provider.");
  }
  return new ProviderError("provider_unavailable", true, "Falha de rede ao chamar o provider.");
}

async function readErrorInfo(res: Response): Promise<{ error_type?: string; error_code?: string }> {
  try {
    const body = (await res.json()) as { error?: { type?: unknown; code?: unknown } };
    return {
      error_type: typeof body.error?.type === "string" ? body.error.type.slice(0, 80) : undefined,
      error_code: typeof body.error?.code === "string" ? body.error.code.slice(0, 80) : undefined,
    };
  } catch {
    return {};
  }
}

export function createOpenAiProvider(config: OpenAiProviderConfig): AiTextProvider {
  return {
    name: "openai",
    model: config.model,
    isSimulation: false,
    async generateStrategy(facts, { signal, feedback, correlationId }) {
      if (signal.aborted) throw errorFromFetchFailure(signal.reason ?? { name: "AbortError" });
      const started = Date.now();
      const body = buildOpenAiRequestBody(config.model, facts, feedback, config.maxOutputTokens);
      const fetchImpl = config.fetchImpl ?? fetch;

      let res: Response;
      try {
        res = await fetchImpl(OPENAI_RESPONSES_URL, {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${config.apiKey}` },
          body: JSON.stringify(body),
          signal: AbortSignal.any([signal, AbortSignal.timeout(config.timeoutMs)]),
        });
      } catch (error) {
        const mapped = errorFromFetchFailure(error);
        log("warn", "ai.openai.request_failed", {
          correlation_id: correlationId,
          model: config.model,
          error_code: mapped.code,
          duration_ms: Date.now() - started,
        });
        throw mapped;
      }

      if (!res.ok) {
        const info = await readErrorInfo(res);
        const mapped = errorFromHttpStatus(res.status);
        log("warn", "ai.openai.http_error", {
          correlation_id: correlationId,
          model: config.model,
          http_status: res.status,
          ...info,
          error_code: mapped.code,
          duration_ms: Date.now() - started,
        });
        throw mapped;
      }

      let json: unknown;
      try {
        json = await res.json();
      } catch (error) {
        // Abort durante a leitura do corpo conta como timeout; corpo ilegível, como saída inválida.
        const mapped = errorFromFetchFailure(error);
        throw mapped.code === "provider_timeout"
          ? mapped
          : new ProviderError("invalid_output", true, "Resposta do provider ilegível.");
      }

      const tokens = tokensFromResponse(json);
      const cost = estimateCostMicroUsd(tokens, config);
      if (cost === null) {
        log("warn", "ai.cost_unknown", { correlation_id: correlationId, model: config.model });
      }
      const usage: Usage = { ...tokens, cost_micro_usd: cost ?? 0 };
      log("info", "ai.openai.response", {
        correlation_id: correlationId,
        model: config.model,
        prompt_version: PROMPT_VERSION,
        status: typeof (json as ResponsesBody | null)?.status === "string" ? (json as ResponsesBody).status : null,
        duration_ms: Date.now() - started,
        input_tokens: usage.input_tokens,
        output_tokens: usage.output_tokens,
        cost_micro_usd: usage.cost_micro_usd,
      });

      return { output: parseResponsesOutput(json, usage), usage };
    },
  };
}
