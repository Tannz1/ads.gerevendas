import { z } from "zod";
import { marketResearchSchema, strategyPlanSchema, type ResearchSource } from "@/contracts/creatives";
import {
  buildResearchUserMessage,
  buildStrategyUserMessage,
  RESEARCH_SYSTEM_PROMPT,
  STRATEGY_SYSTEM_PROMPT,
} from "./prompt";
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
const RESEARCH_JSON_SCHEMA = strictSchema(z.toJSONSchema(marketResearchSchema, { io: "output" }));

type ResponsesBody = {
  id?: string;
  status?: string;
  output?: Array<{
    type: string;
    content?: Array<{
      type: string;
      text?: string;
      annotations?: Array<{ type: string; url?: string; title?: string }>;
    }>;
    action?: { sources?: Array<{ url?: string }> };
  }>;
  usage?: { input_tokens?: number; output_tokens?: number };
};

/** Texto final da resposta já como JSON (ainda não validado). */
function outputJson(body: ResponsesBody): unknown {
  const content = body.output?.find((o) => o.type === "message")?.content ?? [];
  const text = content.find((c) => c.type === "output_text")?.text;
  if (body.status !== "completed" || !text) throw new ProviderError("invalid_output", "Resposta sem texto final");
  try {
    return JSON.parse(text);
  } catch {
    throw new ProviderError("invalid_output", "Resposta não é JSON");
  }
}

/** Fontes da busca: citações (com título) primeiro, depois as demais URLs consultadas. Sem repetir. */
export function extractSources(body: ResponsesBody, max = 12): ResearchSource[] {
  const seen = new Map<string, ResearchSource>();
  const add = (url: string | undefined, title: string | null) => {
    if (!url || !/^https?:\/\//.test(url) || seen.has(url) || seen.size >= max) return;
    seen.set(url, { url: url.slice(0, 600), title: title ? title.slice(0, 200) : null });
  };
  for (const item of body.output ?? []) {
    for (const c of item.content ?? [])
      for (const a of c.annotations ?? []) if (a.type === "url_citation") add(a.url, a.title ?? null);
  }
  for (const item of body.output ?? [])
    if (item.type === "web_search_call") for (const src of item.action?.sources ?? []) add(src.url, null);
  return [...seen.values()];
}

/** Tira links em markdown que o modelo às vezes coloca dentro dos textos: "([site](url))" e "[texto](url)". */
export function stripMarkdownLinks(value: unknown): unknown {
  if (typeof value === "string") {
    return value
      .replace(/\s*\(\[[^\]]*\]\([^)]*\)\)/g, "")
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .trim();
  }
  if (Array.isArray(value)) return value.map(stripMarkdownLinks);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, k === "source_url" ? v : stripMarkdownLinks(v)]),
    );
  }
  return value;
}

const usageOf = (body: ResponsesBody) => ({
  input_tokens: body.usage?.input_tokens ?? 0,
  output_tokens: body.usage?.output_tokens ?? 0,
});

/** OpenAI Responses API com saída estruturada (JSON Schema estrito). Sem SDK: só `fetch`. */
export function openaiText(opts: Options): TextProvider {
  const fetchFn = opts.fetchFn ?? fetch;
  const sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  const url = `${opts.baseUrl ?? "https://api.openai.com/v1"}/responses`;

  async function call(body: string, timeoutMs = opts.timeoutMs ?? 60_000): Promise<Response> {
    for (let attempt = 0; ; attempt++) {
      let res: Response;
      try {
        res = await fetchFn(url, {
          method: "POST",
          headers: { authorization: `Bearer ${opts.apiKey}`, "content-type": "application/json" },
          body,
          signal: AbortSignal.timeout(timeoutMs),
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
    async research(input) {
      const res = await call(
        JSON.stringify({
          model: opts.model,
          tools: [
            {
              type: "web_search",
              search_context_size: "medium",
              user_location: {
                type: "approximate",
                country: "BR",
                city: input.business.city,
                region: input.business.state,
                timezone: "America/Sao_Paulo",
              },
            },
          ],
          include: ["web_search_call.action.sources"],
          input: [
            { role: "system", content: RESEARCH_SYSTEM_PROMPT },
            { role: "user", content: buildResearchUserMessage(input) },
          ],
          text: {
            format: { type: "json_schema", name: "market_research", strict: true, schema: RESEARCH_JSON_SCHEMA },
          },
        }),
        opts.timeoutMs ?? 120_000,
      );
      if (!res.ok) throw new ProviderError("external_unavailable", `OpenAI respondeu ${res.status}`);
      const body = (await res.json()) as ResponsesBody;
      return {
        data: stripMarkdownLinks(outputJson(body)),
        sources: extractSources(body),
        usage: usageOf(body),
        request_id: body.id,
      };
    },
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
      return { data: outputJson(body), usage: usageOf(body), request_id: body.id };
    },
  };
}
