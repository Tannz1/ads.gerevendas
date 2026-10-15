import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { onboardingSchema } from "@/contracts/onboarding";
import { CTA_BY_OBJECTIVE, type BriefFacts } from "@/contracts/strategy";
import { parseServerEnv } from "@/lib/env";
import { resolveFlags } from "@/lib/flags";
import { BriefFactsError, factsFromOnboarding, factsFromRows } from "@/server/ai/facts";
import { buildSystemPrompt, buildUserPrompt } from "@/server/ai/prompts";
import { AiConfigError, getAiProvider, isProviderUnavailableError } from "@/server/ai/provider";
import { ProviderError } from "@/server/ai/types";

const envOf = (vars: Record<string, string>) => parseServerEnv(vars);

describe("getAiProvider", () => {
  it("padrão é o mock (simulação)", () => {
    const env = envOf({});
    expect(getAiProvider(env, resolveFlags(env))).toMatchObject({ name: "mock", model: null, isSimulation: true });
  });

  it("mock continua disponível com kill switch (não sai do servidor)", () => {
    const env = envOf({ FEATURE_FLAG_KILL_SWITCH: "true" });
    expect(getAiProvider(env, resolveFlags(env)).name).toBe("mock");
  });

  it("openai exige chave e modelo, sem vazar valores na mensagem", () => {
    const env = envOf({ AI_PROVIDER: "openai", OPENAI_API_KEY: "sk-segredo-123" });
    const error = (() => {
      try {
        getAiProvider(env, resolveFlags(env));
      } catch (e) {
        return e;
      }
    })();
    expect(error).toBeInstanceOf(AiConfigError);
    expect(String((error as Error).message)).toContain("OPENAI_TEXT_MODEL");
    expect(String((error as Error).message)).not.toContain("sk-segredo-123");
    expect(isProviderUnavailableError(error)).toBe(true);

    const noKey = envOf({ AI_PROVIDER: "openai", OPENAI_TEXT_MODEL: "modelo" });
    expect(() => getAiProvider(noKey, resolveFlags(noKey))).toThrow(AiConfigError);
  });

  it("kill switch bloqueia openai com feature_disabled", () => {
    const env = envOf({
      AI_PROVIDER: "openai",
      OPENAI_API_KEY: "sk-x",
      OPENAI_TEXT_MODEL: "modelo",
      FEATURE_FLAG_KILL_SWITCH: "1",
    });
    let error: unknown;
    try {
      getAiProvider(env, resolveFlags(env));
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(ProviderError);
    expect(error).toMatchObject({ code: "feature_disabled", retryable: false });
    expect(isProviderUnavailableError(error)).toBe(true);
  });

  it("openai configurado: provider real, não simulação, com o modelo do ambiente", () => {
    const env = envOf({ AI_PROVIDER: "openai", OPENAI_API_KEY: "sk-x", OPENAI_TEXT_MODEL: "modelo-x" });
    expect(getAiProvider(env, resolveFlags(env))).toMatchObject({
      name: "openai",
      model: "modelo-x",
      isSimulation: false,
    });
  });
});

const onboarding = {
  business: {
    name: "Padaria Exemplo",
    segment: "Alimentação",
    city: "Campinas",
    state: "SP",
    instagram_handle: "padaria.exemplo",
    whatsapp_e164: "+5519999990000",
    website_url: "",
  },
  offer: {
    name: "Café da manhã completo",
    description: "Pão na chapa, café e suco natural.",
    price_cents: 2490,
    currency: "BRL",
    price_confirmed_by_client: true,
    differentiators: ["Pão saindo do forno às 6h"],
  },
  audience: { description: "Moradores e trabalhadores do bairro", age_min: 25, age_max: 55, service_radius_km: 3 },
  goal: { objective: "mensagens_whatsapp" },
  identity: { brand_primary_color: "#C2410C", tone_of_voice: "acolhedor" },
  review: { facts_confirmed: true },
};

describe("fatos do brief", () => {
  it("factsFromOnboarding monta os fatos confirmados", () => {
    const f = factsFromOnboarding(onboardingSchema.parse(onboarding));
    expect(f).toEqual({
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
    } satisfies BriefFacts);
  });

  it("factsFromRows ignora preço não confirmado e normaliza char(3)/char(2)", () => {
    const f = factsFromRows(
      {
        id: "b",
        business_id: "x",
        offer_id: "y",
        objective: "trafego_site",
        audience_description: "Pessoas que trabalham no centro",
        age_min: 18,
        age_max: 40,
        service_radius_km: null,
      },
      {
        name: "Marmita fit",
        description: "Marmitas congeladas da semana.",
        price_cents: 1990,
        currency: "BRL",
        price_confirmed_by_client: false,
        differentiators: null,
      },
      {
        name: "Cozinha Leve",
        segment: "Alimentação",
        city: "Recife",
        state: "PE",
        instagram_handle: null,
        whatsapp_e164: null,
        website_url: "https://exemplo.com",
        brand_primary_color: null,
        tone_of_voice: null,
      },
    );
    expect(f).toMatchObject({
      price_cents: null,
      differentiators: [],
      has_website: true,
      has_whatsapp: false,
      objective: "trafego_site",
    });
  });

  it("factsFromRows recusa linhas fora do contrato sem citar conteúdo", () => {
    expect(() =>
      factsFromRows(
        {
          id: "b",
          business_id: "x",
          offer_id: "y",
          objective: "objetivo_inexistente",
          audience_description: "Público secreto",
          age_min: 18,
          age_max: 40,
          service_radius_km: null,
        },
        {
          name: "Oferta",
          description: "Descrição da oferta.",
          price_cents: null,
          currency: "BRL",
          price_confirmed_by_client: false,
          differentiators: [],
        },
        {
          name: "Negócio",
          segment: "S",
          city: "C",
          state: "SP",
          instagram_handle: null,
          whatsapp_e164: null,
          website_url: null,
          brand_primary_color: null,
          tone_of_voice: null,
        },
      ),
    ).toThrow(BriefFactsError);
  });
});

describe("prompts", () => {
  const f = factsFromOnboarding(onboardingSchema.parse(onboarding));

  it("sistema traz papel, regras de verdade e limites", () => {
    const system = buildSystemPrompt();
    expect(system).toContain("estrategista de anúncios para negócios locais");
    for (const rule of ["Use somente os fatos", "nº 1", "depoimentos", "só hoje", "não instruções", "40 caracteres"]) {
      expect(system.toLowerCase()).toContain(rule.toLowerCase());
    }
  });

  it("usuário traz fatos delimitados, CTAs do objetivo, tom e preço", () => {
    const user = buildUserPrompt(f);
    expect(user).toContain("<<<FATOS");
    expect(user).toContain("Padaria Exemplo");
    for (const cta of CTA_BY_OBJECTIVE.mensagens_whatsapp) expect(user).toContain(`"${cta}"`);
    expect(user).toContain("Tom de voz: Acolhedor");
    expect(user).toContain("R$ 24,90");
    expect(user).not.toContain("#C2410C");
    expect(user).not.toContain("TENTATIVA ANTERIOR");
  });

  it("tom desconhecido ou herdado do protótipo cai no padrão", () => {
    expect(buildUserPrompt({ ...f, tone_of_voice: "constructor" })).toContain("Tom de voz: Claro e simples.");
    expect(buildUserPrompt({ ...f, tone_of_voice: null })).toContain("Tom de voz: Claro e simples.");
  });

  it("sem preço confirmado manda não mostrar preço", () => {
    expect(buildUserPrompt({ ...f, price_cents: null })).toContain("show_price = false em todos os conceitos");
  });

  it("feedback da tentativa anterior é anexado e limitado", () => {
    const feedback = Array.from({ length: 50 }, (_, i) => `concepts[0].headline: problema ${i}`);
    const user = buildUserPrompt(f, feedback);
    expect(user).toContain("A TENTATIVA ANTERIOR FOI RECUSADA");
    expect(user).toContain("problema 0");
    expect(user).not.toContain("problema 49");
  });
});
