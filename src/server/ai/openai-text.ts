import { z } from "zod";
import { strategyPlanSchema } from "@/contracts/creatives";
import { buildStrategyUserMessage, STRATEGY_SYSTEM_PROMPT } from "./prompt";
import type { TextProvider } from "./types";

export type ProviderErrorCode = "external_unavailable" | "invalid_output";

/** Erro do provedor sem detalhes sensíveis (nunca inclui chave nem corpo da requisição). */
export class ProviderError extends Error {
  constructor(
    readonly code: ProviderErrorCode,
    message: string,
  ) {
    super(message);
  }
}

type Options = {
  apiKey: string;
  model: string;
  fetchFn?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  baseUrl?: string;
  timeoutMs?: number;
};

/** Remove palavras-chave que o modo estrito pode recusar; os limites seguem validados pelo Zod. */
function strictSchema(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(strictSchema);
  if (!node || typeof node !== "object") return node;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(node)) {
    if (k === "$schema" || k === "minLength" || k === "maxLength") continue;
    out[k] = strictSchema(v);
  }
  return out;
}

const STRATEGY_JSON_SCHEMA = strictSchema(z.toJSONSchema(strategyPlanSchema, { io: "output" }));

type ResponsesBody = {
  id?: string;
  status?: string;
  output?: Array<{ type: string; content?: Array<{ type: string; text?: string }> }>;
  usage?: { input_tokens?: number; output_tokens?: number };
};

/** OpenAI Responses API com saída estruturada (JSON Schema estrito). Sem SDK: só `fetch`. */
export function openaiText(opts: Options): TextProvider {
  const fetchFn = opts.fetchFn ?? fetch;
  const sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  const url = `${opts.baseUrl ?? "https://api.openai.com/v1"}/responses`;

  async function call(body: string): Promise<Response> {
    for (let attempt = 0; ; attempt++) {
      let res: Response;
      try {
        res = await fetchFn(url, {
          method: "POST",
          headers: { authorization: `Bearer ${opts.apiKey}`, "content-type": "application/json" },
          body,
          signal: AbortSignal.timeout(opts.timeoutMs ?? 60_000),
        });
      } catch {
        if (attempt === 0) {
          await sleep(1500);
          continue;
        }
        throw new ProviderError("external_unavailable", "OpenAI não respondeu");
      }
      const retryable = res.status === 429 || res.status >= 500;
      if (res.ok || !retryable || attempt > 0) return res;
      await sleep(1500);
    }
  }

  return {
    name: "openai",
    model: opts.model,
    async generateStrategy(input) {
      const res = await call(
        JSON.stringify({
          model: opts.model,
          input: [
            { role: "system", content: STRATEGY_SYSTEM_PROMPT },
            { role: "user", content: buildStrategyUserMessage(input) },
          ],
          text: { format: { type: "json_schema", name: "strategy_plan", strict: true, schema: STRATEGY_JSON_SCHEMA } },
        }),
      );
      if (!res.ok) throw new ProviderError("external_unavailable", `OpenAI respondeu ${res.status}`);

      const body = (await res.json()) as ResponsesBody;
      const content = body.output?.find((o) => o.type === "message")?.content ?? [];
      const text = content.find((c) => c.type === "output_text")?.text;
      if (body.status !== "completed" || !text) throw new ProviderError("invalid_output", "Resposta sem texto final");

      let data: unknown;
      try {
        data = JSON.parse(text);
      } catch {
        throw new ProviderError("invalid_output", "Resposta não é JSON");
      }
      return {
        data,
        usage: { input_tokens: body.usage?.input_tokens ?? 0, output_tokens: body.usage?.output_tokens ?? 0 },
        request_id: body.id,
      };
    },
  };
}
