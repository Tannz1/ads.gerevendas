import { describe, expect, it, vi } from "vitest";
import { marketResearchSchema, storedStrategyPlanSchema, strategyPlanSchema } from "@/contracts/creatives";
import { mockResearch } from "@/server/ai/mock-text";
import { extractSources, openaiText, stripMarkdownLinks } from "@/server/ai/openai-text";
import { buildStrategyUserMessage, confirmedFacts } from "@/server/ai/prompt";
import type { ResearchInput, StrategyInput } from "@/server/ai/types";
import { validPlan } from "./fixtures";

const researchInput: ResearchInput = {
  business: {
    name: "TESTE V4",
    segment: "Pet Shop",
    city: "Itajaí",
    state: "SC",
    instagram_handle: "testev4",
    website_url: null,
  },
  offer: { name: "Vacinas para pets", description: "Vacinação de cães e gatos." },
  competitors_listed: ["Pet Amigo (@petamigo)"],
};

const research = {
  business_context: "Não encontrado.",
  local_market: "Itajaí tem várias clínicas veterinárias no Centro ([dotopet.com.br](https://dotopet.com.br/)).",
  competitors: [
    {
      name: "Dotôpet",
      source_url: "https://dotopet.com.br/veterinaria-itajai/",
      positioning: "Clínica no Centro com vacinação canina.",
      client_listed: false,
    },
  ],
  opportunities: ["Lembrete de reforço anual pelo WhatsApp."],
  audience_insights: ["Tutores procuram vacina antes das férias."],
};

// Formato conferido numa chamada real em 23/10/2026 (gpt-6-sol + web_search + json_schema estrito).
const searchResponse = () => ({
  id: "resp_research",
  status: "completed",
  output: [
    { type: "reasoning" },
    {
      type: "web_search_call",
      action: { sources: [{ url: "https://dotopet.com.br/veterinaria-itajai/" }, { url: "https://exemplo.com/a" }] },
    },
    {
      type: "message",
      content: [
        {
          type: "output_text",
          text: JSON.stringify(research),
          annotations: [{ type: "url_citation", url: "https://dotopet.com.br/veterinaria-itajai/", title: "Dotôpet" }],
        },
      ],
    },
  ],
  usage: { input_tokens: 19399, output_tokens: 383 },
});

describe("pesquisa de mercado na OpenAI", () => {
  it("pede busca na web localizada, com fontes e saída estruturada", async () => {
    const fetchFn = vi.fn<typeof fetch>(async () => Response.json(searchResponse()));
    const provider = openaiText({ apiKey: "k", model: "gpt-6-sol", fetchFn });
    const r = await provider.research(researchInput);

    const body = JSON.parse(String(fetchFn.mock.calls[0][1]?.body));
    expect(body.tools[0]).toMatchObject({
      type: "web_search",
      user_location: { type: "approximate", country: "BR", city: "Itajaí", region: "SC" },
    });
    expect(body.include).toEqual(["web_search_call.action.sources"]);
    expect(body.text.format).toMatchObject({ type: "json_schema", name: "market_research", strict: true });

    const parsed = marketResearchSchema.parse(r.data);
    expect(parsed.local_market).toBe("Itajaí tem várias clínicas veterinárias no Centro.");
    expect(parsed.competitors[0].source_url).toBe("https://dotopet.com.br/veterinaria-itajai/");
    expect(r.sources[0]).toEqual({ url: "https://dotopet.com.br/veterinaria-itajai/", title: "Dotôpet" });
    expect(r.usage.input_tokens).toBe(19399);
  });

  it("junta citações e URLs consultadas sem repetir e só com http(s)", () => {
    const body = searchResponse();
    body.output[1] = {
      type: "web_search_call",
      action: { sources: [{ url: "https://dotopet.com.br/veterinaria-itajai/" }, { url: "javascript:alert(1)" }] },
    };
    expect(extractSources(body).map((s) => s.url)).toEqual(["https://dotopet.com.br/veterinaria-itajai/"]);
  });

  it("tira links em markdown dos textos, mas não mexe em source_url", () => {
    expect(stripMarkdownLinks("Veja [o site](https://a.com) agora")).toBe("Veja o site agora");
    expect(stripMarkdownLinks({ source_url: "https://a.com/x", note: "Ok ([a.com](https://a.com))" })).toEqual({
      source_url: "https://a.com/x",
      note: "Ok",
    });
  });

  it("simulação usa só os concorrentes que o cliente informou", () => {
    const r = mockResearch(researchInput);
    expect(marketResearchSchema.safeParse(r).success).toBe(true);
    expect(r.competitors).toEqual([expect.objectContaining({ name: "Pet Amigo (@petamigo)", client_listed: true })]);
  });
});

describe("pesquisa na estratégia", () => {
  const input: StrategyInput = {
    business: { name: "TESTE V4", segment: "Pet Shop", city: "Itajaí", state: "SC", tone_of_voice: null },
    offer: {
      name: "Vacinas para pets",
      description: "Vacinação de cães e gatos.",
      price_cents: null,
      differentiators: [],
    },
    audience: { description: "Tutores de cães e gatos", age_min: 25, age_max: 55, service_radius_km: 5 },
    objective: "mensagens_whatsapp",
    research: marketResearchSchema.parse({ ...research, local_market: "Mercado local." }),
  };

  it("vai separada dos fatos e nunca conta como fato confirmado", () => {
    const msg = JSON.parse(buildStrategyUserMessage(input));
    expect(msg.pesquisa_de_mercado.competitors[0].name).toBe("Dotôpet");
    expect(msg.research).toBeUndefined();
    expect(confirmedFacts(input).confirmed_text).not.toContain("Dotôpet");
  });

  it("o plano gravado guarda a pesquisa com as fontes; o schema do modelo não", () => {
    const stored = { ...validPlan, research: { ...research, sources: [{ url: "https://a.com", title: null }] } };
    expect(storedStrategyPlanSchema.parse(stored).research?.sources).toHaveLength(1);
    expect(storedStrategyPlanSchema.parse(validPlan).research).toBeUndefined();
    expect("research" in strategyPlanSchema.parse(stored)).toBe(false);
  });

  it("manda as versões anteriores separadas, para a nova versão não repetir conceito", () => {
    const previous = [{ key: "oferta", headline: "Banho e tosa em Itajaí", layout: "oferta" }];
    expect(JSON.parse(buildStrategyUserMessage({ ...input, previous })).versoes_anteriores).toEqual(previous);
    expect(JSON.parse(buildStrategyUserMessage(input)).versoes_anteriores).toBeNull();
    expect(confirmedFacts({ ...input, previous }).confirmed_text).not.toContain("Banho e tosa em Itajaí");
  });

  it("lê planos gravados antes do strategy.v3, sem os campos de tráfego e direção de arte", () => {
    const legacy = {
      ...validPlan,
      test_plan: undefined,
      angles: validPlan.angles.map(({ key, label, rationale, headline, body, cta }) => ({
        key,
        label,
        rationale,
        headline,
        body,
        cta,
      })),
    };
    expect(storedStrategyPlanSchema.safeParse(legacy).success).toBe(true);
    expect(strategyPlanSchema.safeParse(legacy).success).toBe(false);
  });
});
