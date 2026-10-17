import { describe, expect, it, vi } from "vitest";
import { strategyPlanSchema } from "@/contracts/creatives";
import { parseServerEnv } from "@/lib/env";
import { checkFacts } from "@/server/ai/facts";
import { mockStrategy } from "@/server/ai/mock-text";
import { openaiText, ProviderError } from "@/server/ai/openai-text";
import { confirmedFacts } from "@/server/ai/prompt";
import { selectTextProvider } from "@/server/ai/provider";
import type { StrategyInput } from "@/server/ai/types";
import { validPlan } from "./fixtures";

const input: StrategyInput = {
  business: {
    name: "Padaria Exemplo",
    segment: "Alimentação",
    city: "Campinas",
    state: "SP",
    tone_of_voice: "acolhedor",
  },
  offer: {
    name: "Café da manhã completo",
    description: "Pão na chapa, café e suco natural.",
    price_cents: 2490,
    differentiators: ["Pão saindo do forno às 6h"],
  },
  audience: { description: "Moradores e trabalhadores do bairro", age_min: 25, age_max: 55, service_radius_km: 3 },
  objective: "mensagens_whatsapp",
};

describe("mockStrategy", () => {
  it("é determinístico, válido e passa na checagem de fatos", () => {
    const a = mockStrategy(input);
    expect(mockStrategy(input)).toEqual(a);
    expect(strategyPlanSchema.safeParse(a).success).toBe(true);
    expect(checkFacts(a, confirmedFacts(input))).toEqual([]);
  });

  it("não cita preço quando a oferta não tem preço confirmado", () => {
    const plan = mockStrategy({ ...input, offer: { ...input.offer, price_cents: null } });
    expect(JSON.stringify(plan)).not.toMatch(/R\$/);
    expect(plan.fields_requiring_confirmation.length).toBeGreaterThan(0);
  });

  it("respeita os limites mesmo com textos longos do cliente", () => {
    const long = "palavra ".repeat(100).trim();
    const plan = mockStrategy({
      ...input,
      offer: { ...input.offer, name: long.slice(0, 120), description: long.slice(0, 600) },
      audience: { ...input.audience, description: long.slice(0, 600) },
    });
    expect(strategyPlanSchema.safeParse(plan).success).toBe(true);
  });
});

// Formato de resposta da Responses API conforme a documentação pública da OpenAI.
// FIXTURE BASEADA NA DOCUMENTAÇÃO: confirmar com uma chamada real quando houver chave.
const okResponse = (text: string) => ({
  id: "resp_123",
  status: "completed",
  output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text }] }],
  usage: { input_tokens: 812, output_tokens: 640 },
});

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("openaiText", () => {
  it("envia schema estrito e lê texto, uso e id", async () => {
    const fetchFn = vi.fn(async () => json(200, okResponse(JSON.stringify(validPlan))));
    const provider = openaiText({ apiKey: "sk-test", model: "modelo-x", fetchFn, sleep: async () => {} });
    const out = await provider.generateStrategy(input);

    expect(out.data).toEqual(validPlan);
    expect(out.usage).toEqual({ input_tokens: 812, output_tokens: 640 });
    expect(out.request_id).toBe("resp_123");

    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.openai.com/v1/responses");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer sk-test");
    const body = JSON.parse(String(init.body));
    expect(body.model).toBe("modelo-x");
    expect(body.text.format).toMatchObject({ type: "json_schema", name: "strategy_plan", strict: true });
    expect(JSON.stringify(body.text.format.schema)).not.toMatch(/maxLength|minLength|\$schema/);
    expect(body.text.format.schema.additionalProperties).toBe(false);
  });

  it("tenta de novo uma vez em 429", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(json(429, { error: { message: "rate" } }))
      .mockResolvedValueOnce(json(200, okResponse(JSON.stringify(validPlan))));
    const provider = openaiText({ apiKey: "k", model: "m", fetchFn, sleep: async () => {} });
    await expect(provider.generateStrategy(input)).resolves.toMatchObject({ data: validPlan });
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("falha como indisponível após duas respostas 5xx", async () => {
    const fetchFn = vi.fn(async () => json(503, {}));
    const provider = openaiText({ apiKey: "k", model: "m", fetchFn, sleep: async () => {} });
    await expect(provider.generateStrategy(input)).rejects.toMatchObject({ code: "external_unavailable" });
  });

  it("não tenta de novo em 400 e não expõe a chave no erro", async () => {
    const fetchFn = vi.fn(async () => json(400, { error: { message: "bad" } }));
    const provider = openaiText({ apiKey: "sk-secreta", model: "m", fetchFn, sleep: async () => {} });
    const err = await provider.generateStrategy(input).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ProviderError);
    expect(String((err as Error).message)).not.toContain("sk-secreta");
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("trata recusa e JSON inválido como saída inválida", async () => {
    const refusal = {
      ...okResponse(""),
      output: [{ type: "message", content: [{ type: "refusal", refusal: "não" }] }],
    };
    const p1 = openaiText({ apiKey: "k", model: "m", fetchFn: async () => json(200, refusal), sleep: async () => {} });
    await expect(p1.generateStrategy(input)).rejects.toMatchObject({ code: "invalid_output" });
    const p2 = openaiText({
      apiKey: "k",
      model: "m",
      fetchFn: async () => json(200, okResponse("{nao é json")),
      sleep: async () => {},
    });
    await expect(p2.generateStrategy(input)).rejects.toMatchObject({ code: "invalid_output" });
  });
});

describe("selectTextProvider", () => {
  const env = (extra: Record<string, string>) => parseServerEnv(extra);

  it("usa o simulado sem chave", () => {
    expect(selectTextProvider(env({})).name).toBe("mock");
  });

  it("usa a OpenAI com chave e modelo", () => {
    expect(selectTextProvider(env({ OPENAI_API_KEY: "k", OPENAI_TEXT_MODEL: "m" })).name).toBe("openai");
  });

  it("kill switch força o simulado", () => {
    const e = env({ OPENAI_API_KEY: "k", OPENAI_TEXT_MODEL: "m", FEATURE_FLAG_KILL_SWITCH: "true" });
    expect(selectTextProvider(e).name).toBe("mock");
  });
});
