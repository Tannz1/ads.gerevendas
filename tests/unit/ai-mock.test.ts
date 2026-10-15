import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { OBJECTIVES, TONES } from "@/contracts/onboarding";
import {
  CONCEPT_ANGLES,
  COPY_LIMITS,
  CTA_BY_OBJECTIVE,
  generatedStrategySchema,
  TEMPLATE_KEYS,
  type BriefFacts,
} from "@/contracts/strategy";
import { checkGeneratedAgainstFacts, normalizeForFacts } from "@/server/ai/fact-guard";
import { buildMockStrategy, createMockProvider, fitWords } from "@/server/ai/mock";
import { getDemoProvider } from "@/server/ai/provider";

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

const LONG = "Atendimento cuidadoso com produtos selecionados ".repeat(14).trim();

const FACT_SETS: Array<[string, BriefFacts]> = [
  ["completo com preço", facts()],
  ["sem preço", facts({ price_cents: null })],
  ["sem diferenciais e sem raio", facts({ differentiators: [], service_radius_km: null })],
  [
    "diferenciais com números",
    facts({ differentiators: ["Mais de 1.200 clientes desde 2015", "Entrega em até 40 minutos", "Aberto 7 dias"] }),
  ],
  [
    "avaliação e citação confirmadas pelo cliente",
    facts({
      price_cents: null,
      differentiators: ["Avaliação 5 estrelas no Google ★★★★★", "Segundo nossos clientes, o melhor pão"],
      offer_description: 'Pão artesanal. "O melhor pão que já comi" — Ana, cliente.',
    }),
  ],
  [
    "descrição com valor sem preço confirmado",
    facts({ price_cents: null, offer_description: "Combo por R$ 30 com café e pão de queijo." }),
  ],
  ["textos longos", facts({ offer_description: LONG, audience_description: LONG, business_name: "B".repeat(2) })],
  [
    "nome e oferta longos",
    facts({
      business_name: "Estúdio de Beleza e Bem-Estar Integrado da Vila Nova Conceição",
      offer_name: "Pacote completo de limpeza de pele profunda com hidratação e massagem relaxante",
    }),
  ],
  ["palavra gigante", facts({ offer_name: "X".repeat(70), business_name: "Y".repeat(70) })],
  ["sem tom de voz", facts({ tone_of_voice: null })],
  ["tom desconhecido", facts({ tone_of_voice: "sarcástico" })],
  ["tom com nome de propriedade herdada", facts({ tone_of_voice: "constructor" })],
  ...OBJECTIVES.map((objective): [string, BriefFacts] => [`objetivo ${objective}`, facts({ objective })]),
  ...TONES.map((tone): [string, BriefFacts] => [`tom ${tone}`, facts({ tone_of_voice: tone, price_cents: null })]),
];

describe("mock: saída válida e verdadeira", () => {
  it.each(FACT_SETS)("%s: passa no Zod e no fact-guard", (_name, f) => {
    const gen = buildMockStrategy(f);
    expect(generatedStrategySchema.safeParse(gen).success).toBe(true);
    expect(checkGeneratedAgainstFacts(gen, f)).toEqual([]);
  });

  it.each(FACT_SETS)("%s: não inventa números (todos os dígitos vêm dos fatos)", (_name, f) => {
    const gen = buildMockStrategy(f);
    const factNumbers = new Set(
      [
        f.business_name,
        f.segment,
        f.city,
        f.offer_name,
        f.offer_description,
        ...f.differentiators,
        f.audience_description,
        String(f.age_min),
        String(f.age_max),
        String(f.service_radius_km ?? ""),
      ]
        .join(" ")
        .match(/\d+/g) ?? [],
    );
    // Formatos ("feed_4x5") e avisos ficam de fora: não são texto de anúncio.
    const generatedText = JSON.stringify({
      ...gen,
      strategy: { ...gen.strategy, cautions: [], recommended_formats: [] },
    });
    for (const n of generatedText.match(/\d+/g) ?? []) expect(factNumbers.has(n)).toBe(true);
  });

  it.each(FACT_SETS)("%s: sem R$, desconto, garantia ou urgência fora dos fatos", (_name, f) => {
    const gen = buildMockStrategy(f);
    const text = normalizeForFacts(JSON.stringify(gen.concepts.map((c) => [c.headline, c.body, c.primary_text])));
    expect(text).not.toMatch(/r\$/);
    expect(text).not.toMatch(/\bdesconto|\bgarant|\bso hoje|\bcorra\b|\bpromoc/);
  });
});

describe("mock: regras de estrutura", () => {
  it("5 conceitos, um por ângulo, na ordem do contrato", () => {
    const gen = buildMockStrategy(facts());
    expect(gen.concepts.map((c) => c.angle)).toEqual([...CONCEPT_ANGLES]);
  });

  it.each(OBJECTIVES)("CTAs vêm do objetivo %s", (objective) => {
    const gen = buildMockStrategy(facts({ objective }));
    for (const c of gen.concepts) expect(CTA_BY_OBJECTIVE[objective]).toContain(c.cta);
  });

  it("templates alternam entre todos os modelos", () => {
    const keys = buildMockStrategy(facts()).concepts.map((c) => c.template_key);
    expect(new Set(keys)).toEqual(new Set(TEMPLATE_KEYS));
    expect(keys[0]).toBe("oferta");
  });

  it("preço só no conceito de oferta direta e só com preço confirmado", () => {
    const withPrice = buildMockStrategy(facts()).concepts;
    expect(withPrice.filter((c) => c.show_price).map((c) => c.angle)).toEqual(["oferta_direta"]);
    const noPrice = buildMockStrategy(facts({ price_cents: null })).concepts;
    expect(noPrice.some((c) => c.show_price)).toBe(false);
  });

  it("respeita limites de título e texto sem cortar palavras", () => {
    const f = facts({
      offer_name: "Pacote completo de limpeza de pele profunda com hidratação e massagem relaxante",
      offer_description: LONG,
    });
    const gen = buildMockStrategy(f);
    const source = normalizeForFacts(
      [f.offer_name, f.offer_description, f.business_name, f.city, ...f.differentiators].join(" "),
    );
    for (const c of gen.concepts) {
      expect(c.headline.length).toBeLessThanOrEqual(COPY_LIMITS.headline);
      expect(c.body.length).toBeLessThanOrEqual(COPY_LIMITS.body);
      expect(c.primary_text.length).toBeLessThanOrEqual(COPY_LIMITS.primary_text);
      // Toda palavra do título existe inteira na fonte ou é palavra fixa do mock.
      for (const word of normalizeForFacts(c.headline)
        .split(/[^a-z0-9]+/)
        .filter(Boolean)) {
        expect(source.includes(word) || ["que", "tal", "te", "espera", "em", "conheca"].includes(word)).toBe(true);
      }
    }
  });

  it("avisos honestos: sem preço, sem diferenciais e simulação", () => {
    const gen = buildMockStrategy(facts({ price_cents: null, differentiators: [] }));
    expect(gen.strategy.cautions).toContain("As peças não mostram preço porque ele não foi confirmado.");
    expect(gen.strategy.cautions.some((c) => c.includes("Sem diferenciais"))).toBe(true);
    expect(gen.strategy.cautions.some((c) => c.toLowerCase().includes("simulação"))).toBe(true);
    expect(gen.strategy.cautions.length).toBeLessThanOrEqual(4);
  });

  it("diferenciais que não passam no fact-guard não entram nos textos", () => {
    // Valor em R$ sem preço confirmado nunca é aceito, mesmo vindo do cliente.
    const f = facts({ price_cents: null, differentiators: ["Combo família por R$ 30", "Forno a lenha"] });
    const gen = buildMockStrategy(f);
    expect(JSON.stringify(gen)).not.toContain("R$");
    expect(gen.concepts.find((c) => c.angle === "diferencial")?.headline).toBe("Forno a lenha");
    expect(gen.strategy.cautions.some((c) => c.includes("diferenciais não foram usados"))).toBe(true);
  });

  it("usa o tom de voz pedido", () => {
    const divertido = buildMockStrategy(facts({ tone_of_voice: "divertido" }));
    const direto = buildMockStrategy(facts({ tone_of_voice: "direto" }));
    expect(divertido.concepts[0]?.primary_text).toContain("Bora?");
    expect(direto.concepts[0]?.primary_text).not.toContain("Bora?");
    expect(direto.strategy.positioning).toContain("direta");
  });

  it("é determinístico", () => {
    expect(buildMockStrategy(facts())).toEqual(buildMockStrategy(facts()));
    expect(JSON.stringify(buildMockStrategy(facts({ price_cents: null })))).toBe(
      JSON.stringify(buildMockStrategy(facts({ price_cents: null }))),
    );
  });
});

describe("mock: provider", () => {
  it("é rotulado como simulação, sem modelo e sem custo", async () => {
    const provider = createMockProvider();
    expect(provider).toMatchObject({ name: "mock", model: null, isSimulation: true });
    const result = await provider.generateStrategy(facts(), { signal: new AbortController().signal });
    expect(result.usage).toEqual({ input_tokens: 0, output_tokens: 0, cost_micro_usd: 0 });
    expect(result.output).toEqual(buildMockStrategy(facts()));
  });

  it("respeita o sinal de cancelamento", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(createMockProvider().generateStrategy(facts(), { signal: controller.signal })).rejects.toMatchObject({
      code: "provider_timeout",
      retryable: true,
    });
  });

  it("getDemoProvider é sempre o mock", () => {
    expect(getDemoProvider()).toMatchObject({ name: "mock", isSimulation: true });
  });
});

describe("fitWords", () => {
  it("não corta no meio da palavra nem termina em conectivo", () => {
    expect(fitWords("Pão na chapa com manteiga de garrafa", 20)).toBe("Pão na chapa");
    expect(fitWords("Curto", 40)).toBe("Curto");
    expect(fitWords("Palavragrandedemais", 5)).toBe("");
    expect(fitWords("Café, pão e suco natural", 12)).toBe("Café, pão");
  });
});
