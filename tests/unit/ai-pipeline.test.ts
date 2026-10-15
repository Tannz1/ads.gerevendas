import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { BriefFacts, GeneratedStrategy, Usage } from "@/contracts/strategy";
import { buildMockStrategy } from "@/server/ai/mock";
import { coerceGenerated, generateValidatedStrategy } from "@/server/ai/pipeline";
import { ProviderError, type AiTextProvider } from "@/server/ai/types";

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

const USAGE: Usage = { input_tokens: 100, output_tokens: 50, cost_micro_usd: 7 };

type Step = unknown | ((feedback: string[] | undefined) => unknown);

/** Provider falso que devolve uma saída por chamada e registra o feedback recebido. */
function fakeProvider(steps: Step[]) {
  const feedbacks: Array<string[] | undefined> = [];
  const provider: AiTextProvider = {
    name: "openai",
    model: "modelo-teste",
    isSimulation: false,
    async generateStrategy(_facts, { feedback }) {
      feedbacks.push(feedback);
      const step = steps[feedbacks.length - 1];
      if (step instanceof Error) throw step;
      const output = typeof step === "function" ? step(feedback) : step;
      return { output, usage: USAGE };
    },
  };
  return { provider, feedbacks };
}

const good = () => buildMockStrategy(facts());
const withConceptText = (index: number, headline: string): GeneratedStrategy => {
  const gen = good();
  gen.concepts[index] = { ...gen.concepts[index]!, headline };
  return gen;
};
const run = (provider: AiTextProvider, f: BriefFacts = facts()) =>
  generateValidatedStrategy(provider, f, { signal: new AbortController().signal, correlationId: "corr-12345678" });

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("pipeline", () => {
  it("saída boa na 1ª tentativa: uma chamada, sem descarte", async () => {
    const { provider, feedbacks } = fakeProvider([good()]);
    const result = await run(provider);
    expect(feedbacks).toEqual([undefined]);
    expect(result).toMatchObject({ dropped_concepts: 0, attempts: 1, usage: USAGE });
    expect(result.generated.concepts).toHaveLength(5);
  });

  it("problema de veracidade → 2ª tentativa com feedback; corrigido, sem descarte", async () => {
    const { provider, feedbacks } = fakeProvider([withConceptText(1, "O melhor café de Campinas"), good()]);
    const result = await run(provider);
    expect(feedbacks).toHaveLength(2);
    expect(feedbacks[1]?.some((f) => f.startsWith("concepts[1].headline"))).toBe(true);
    expect(result).toMatchObject({ dropped_concepts: 0, attempts: 2 });
    expect(result.usage).toEqual({ input_tokens: 200, output_tokens: 100, cost_micro_usd: 14 });
  });

  it("saída fora do contrato → 2ª tentativa com os erros do Zod", async () => {
    const { provider, feedbacks } = fakeProvider([{ strategy: {}, concepts: [] }, good()]);
    const result = await run(provider);
    expect(feedbacks[1]?.length).toBeGreaterThan(0);
    expect(feedbacks[1]?.some((f) => f.startsWith("strategy.summary"))).toBe(true);
    expect(result.attempts).toBe(2);
  });

  it("Zod ainda falhando na 2ª → invalid_output não retentável com uso somado", async () => {
    const { provider } = fakeProvider([{ nada: true }, { nada: true }]);
    await expect(run(provider)).rejects.toMatchObject({
      code: "invalid_output",
      retryable: false,
      usage: { input_tokens: 200, output_tokens: 100, cost_micro_usd: 14 },
    });
  });

  it("problema na estratégia depois da 2ª → fact_check_failed", async () => {
    const bad = good();
    bad.strategy.summary = "Divulgar o café da manhã com 30% de desconto para moradores do bairro.";
    const { provider } = fakeProvider([bad, bad]);
    await expect(run(provider)).rejects.toMatchObject({ code: "fact_check_failed", retryable: false });
  });

  it("conceitos com problema depois da 2ª são descartados (sobram 3+)", async () => {
    const bad = withConceptText(1, "Só hoje!");
    bad.concepts[3] = { ...bad.concepts[3]!, primary_text: "Mais de 500 clientes atendidos no bairro." };
    const { provider } = fakeProvider([bad, bad]);
    const result = await run(provider);
    expect(result.dropped_concepts).toBe(2);
    expect(result.generated.concepts.map((c) => c.angle)).toEqual(["oferta_direta", "diferencial", "convite_local"]);
  });

  it("menos de 3 conceitos limpos → fact_check_failed", async () => {
    const bad = good();
    for (const i of [0, 1, 2]) bad.concepts[i] = { ...bad.concepts[i]!, body: "Garantia de satisfação" };
    const { provider } = fakeProvider([bad, bad]);
    await expect(run(provider)).rejects.toMatchObject({ code: "fact_check_failed", retryable: false });
  });

  it("coerções: sem preço confirmado não mostra preço; CTA fora do objetivo vira o 1º permitido", async () => {
    const f = facts({ price_cents: null, objective: "trafego_site" });
    const gen = buildMockStrategy(facts());
    gen.concepts[0] = { ...gen.concepts[0]!, show_price: true, cta: "Chamar no WhatsApp" };
    const coerced = coerceGenerated(gen, f);
    expect(coerced.concepts[0]).toMatchObject({ show_price: false, cta: "Saiba mais" });

    const { provider, feedbacks } = fakeProvider([gen]);
    const result = await run(provider, f);
    expect(feedbacks).toHaveLength(1);
    expect(result.generated.concepts.every((c) => !c.show_price)).toBe(true);
    expect(result.generated.concepts.every((c) => ["Saiba mais", "Ver no site", "Comprar agora"].includes(c.cta))).toBe(
      true,
    );
  });

  it("erro do provider é repassado com o uso acumulado", async () => {
    const { provider } = fakeProvider([
      withConceptText(0, "Só hoje!"),
      new ProviderError("provider_rate_limited", true, "429", { input_tokens: 0, output_tokens: 0, cost_micro_usd: 0 }),
    ]);
    await expect(run(provider)).rejects.toMatchObject({
      code: "provider_rate_limited",
      retryable: true,
      usage: USAGE,
    });
  });

  it("sinal cancelado antes da 2ª tentativa → provider_timeout", async () => {
    const controller = new AbortController();
    const { provider, feedbacks } = fakeProvider([
      () => {
        controller.abort();
        return withConceptText(0, "Só hoje!");
      },
      good(),
    ]);
    await expect(generateValidatedStrategy(provider, facts(), { signal: controller.signal })).rejects.toMatchObject({
      code: "provider_timeout",
      retryable: true,
      usage: USAGE,
    });
    expect(feedbacks).toHaveLength(1);
  });

  it("não loga conteúdo gerado nem fatos", async () => {
    const lines: string[] = [];
    vi.spyOn(console, "log").mockImplementation((l: unknown) => void lines.push(String(l)));
    vi.spyOn(console, "warn").mockImplementation((l: unknown) => void lines.push(String(l)));
    const { provider } = fakeProvider([withConceptText(2, "Só hoje!"), withConceptText(2, "Só hoje!")]);
    await run(provider);
    const all = lines.join("\n");
    expect(all).not.toContain("Só hoje");
    expect(all).not.toContain("Padaria Exemplo");
  });
});
