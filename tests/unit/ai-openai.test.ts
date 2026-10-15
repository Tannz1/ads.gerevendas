import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { BriefFacts } from "@/contracts/strategy";
import { buildMockStrategy } from "@/server/ai/mock";
import {
  createOpenAiProvider,
  estimateCostMicroUsd,
  OPENAI_RESPONSES_URL,
  STRATEGY_SCHEMA_NAME,
} from "@/server/ai/openai";
import { ProviderError } from "@/server/ai/types";

const API_KEY = "sk-test-NAO-E-UMA-CHAVE-REAL-123";

function facts(overrides: Partial<BriefFacts> = {}): BriefFacts {
  return {
    business_name: "Padaria Exemplo",
    segment: "Alimentação",
    city: "Campinas",
    state: "SP",
    offer_name: "Café da manhã completo",
    offer_description: "Pão na chapa, café e suco natural.",
    price_cents: 2490,
    currency: "BRL",
    differentiators: ["Pão saindo do forno às 6h"],
    audience_description: "Moradores e trabalhadores do bairro",
    age_min: 25,
    age_max: 55,
    service_radius_km: 3,
    objective: "mensagens_whatsapp",
    tone_of_voice: "acolhedor",
    brand_primary_color: "#C2410C",
    has_whatsapp: true,
    has_instagram: true,
    has_website: false,
    ...overrides,
  };
}

function okBody(output: unknown, usage = { input_tokens: 1200, output_tokens: 800 }) {
  return {
    id: "resp_1",
    status: "completed",
    output: [
      { type: "reasoning", summary: [] },
      { type: "message", role: "assistant", content: [{ type: "output_text", text: JSON.stringify(output) }] },
    ],
    usage,
  };
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const provider = (overrides: Partial<Parameters<typeof createOpenAiProvider>[0]> = {}) =>
  createOpenAiProvider({ apiKey: API_KEY, model: "modelo-teste", timeoutMs: 5_000, ...overrides });

const signal = () => new AbortController().signal;

let fetchMock: ReturnType<typeof vi.fn>;
let logs: string[];

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  logs = [];
  for (const method of ["log", "warn", "error"] as const) {
    vi.spyOn(console, method).mockImplementation((line: unknown) => {
      logs.push(String(line));
    });
  }
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("openai: requisição", () => {
  it("envia o corpo da Responses API com saída estruturada estrita e a chave só no header", async () => {
    fetchMock.mockResolvedValue(json(200, okBody(buildMockStrategy(facts()))));
    await provider().generateStrategy(facts(), { signal: signal(), correlationId: "corr-12345678" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(OPENAI_RESPONSES_URL);
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).authorization).toBe(`Bearer ${API_KEY}`);
    expect(init.signal).toBeInstanceOf(AbortSignal);

    const body = JSON.parse(String(init.body));
    expect(Object.keys(body).sort()).toEqual(
      ["input", "instructions", "max_output_tokens", "model", "store", "text"].sort(),
    );
    expect(body.model).toBe("modelo-teste");
    expect(body.store).toBe(false);
    expect(body.text.format).toMatchObject({ type: "json_schema", name: STRATEGY_SCHEMA_NAME, strict: true });
    expect(body.text.format.schema.type).toBe("object");
    expect(body.instructions).toContain("estrategista de anúncios para negócios locais");
    expect(body.input).toContain("Padaria Exemplo");
    expect(String(init.body)).not.toContain(API_KEY);
    expect(logs.join("\n")).not.toContain(API_KEY);
  });

  it("repassa o feedback da tentativa anterior no prompt", async () => {
    fetchMock.mockResolvedValue(json(200, okBody(buildMockStrategy(facts()))));
    await provider().generateStrategy(facts(), {
      signal: signal(),
      feedback: ['concepts[1].headline: "Só hoje": urgência que não está nas informações confirmadas.'],
    });
    const body = JSON.parse(String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body));
    expect(body.input).toContain("A TENTATIVA ANTERIOR FOI RECUSADA");
    expect(body.input).toContain("concepts[1].headline");
  });

  it("devolve a saída JSON e o uso", async () => {
    const output = buildMockStrategy(facts());
    fetchMock.mockResolvedValue(json(200, okBody(output, { input_tokens: 1000, output_tokens: 500 })));
    const result = await provider({ inputUsdPerMTok: 2, outputUsdPerMTok: 8 }).generateStrategy(facts(), {
      signal: signal(),
    });
    expect(result.output).toEqual(output);
    // 1000 × 2 + 500 × 8 = 6000 micro-USD
    expect(result.usage).toEqual({ input_tokens: 1000, output_tokens: 500, cost_micro_usd: 6000 });
  });

  it("sem preço por token, custo 0 e log ai.cost_unknown", async () => {
    fetchMock.mockResolvedValue(json(200, okBody(buildMockStrategy(facts()))));
    const result = await provider().generateStrategy(facts(), { signal: signal() });
    expect(result.usage.cost_micro_usd).toBe(0);
    expect(logs.some((l) => l.includes('"event":"ai.cost_unknown"'))).toBe(true);
  });
});

describe("openai: custo", () => {
  it("arredonda para micro-USD inteiros", () => {
    expect(
      estimateCostMicroUsd({ input_tokens: 3, output_tokens: 7 }, { inputUsdPerMTok: 0.15, outputUsdPerMTok: 0.6 }),
    ).toBe(5);
    expect(estimateCostMicroUsd({ input_tokens: 10, output_tokens: 10 }, { inputUsdPerMTok: 1 })).toBeNull();
  });
});

describe("openai: erros", () => {
  const expectError = async (code: string, retryable: boolean) => {
    const error = await provider()
      .generateStrategy(facts(), { signal: signal() })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ProviderError);
    expect(error).toMatchObject({ code, retryable });
    return error as ProviderError;
  };

  it("429 → provider_rate_limited (retentável)", async () => {
    fetchMock.mockResolvedValue(json(429, { error: { type: "rate_limit", code: "rate_limit_exceeded" } }));
    await expectError("provider_rate_limited", true);
  });

  it.each([500, 502, 503])("%i → provider_unavailable (retentável)", async (status) => {
    fetchMock.mockResolvedValue(json(status, { error: { type: "server_error" } }));
    await expectError("provider_unavailable", true);
  });

  it.each([400, 401, 403, 404])("%i → internal (não retentável)", async (status) => {
    fetchMock.mockResolvedValue(json(status, { error: { type: "invalid_request_error", message: "segredo?" } }));
    await expectError("internal", false);
    expect(logs.join("\n")).not.toContain(API_KEY);
  });

  it("falha de rede → provider_unavailable (retentável)", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    await expectError("provider_unavailable", true);
  });

  it("AbortError/TimeoutError → provider_timeout (retentável)", async () => {
    fetchMock.mockRejectedValue(new DOMException("aborted", "AbortError"));
    await expectError("provider_timeout", true);
    fetchMock.mockRejectedValue(new DOMException("timeout", "TimeoutError"));
    await expectError("provider_timeout", true);
  });

  it("timeout real do sinal → provider_timeout", async () => {
    fetchMock.mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => reject(init.signal?.reason));
        }),
    );
    const error = await provider({ timeoutMs: 20 })
      .generateStrategy(facts(), { signal: signal() })
      .catch((e: unknown) => e);
    expect(error).toMatchObject({ code: "provider_timeout", retryable: true });
  });

  it("sinal já cancelado não chama a API", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(provider().generateStrategy(facts(), { signal: controller.signal })).rejects.toMatchObject({
      code: "provider_timeout",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("recusa do modelo → invalid_output não retentável, com uso", async () => {
    fetchMock.mockResolvedValue(
      json(200, {
        status: "completed",
        output: [{ type: "message", content: [{ type: "refusal", refusal: "Não posso ajudar." }] }],
        usage: { input_tokens: 100, output_tokens: 5 },
      }),
    );
    const error = await expectError("invalid_output", false);
    expect(error.usage).toMatchObject({ input_tokens: 100, output_tokens: 5 });
  });

  it("resposta incompleta → invalid_output retentável", async () => {
    fetchMock.mockResolvedValue(
      json(200, {
        status: "incomplete",
        incomplete_details: { reason: "max_output_tokens" },
        output: [{ type: "message", content: [{ type: "output_text", text: '{"strategy":' }] }],
        usage: { input_tokens: 100, output_tokens: 8000 },
      }),
    );
    const error = await expectError("invalid_output", true);
    expect(error.usage?.output_tokens).toBe(8000);
  });

  it("sem output_text ou com JSON quebrado → invalid_output retentável", async () => {
    fetchMock.mockResolvedValue(json(200, { status: "completed", output: [], usage: {} }));
    await expectError("invalid_output", true);
    fetchMock.mockResolvedValue(
      json(200, { status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: "{x" }] }] }),
    );
    await expectError("invalid_output", true);
  });
});
