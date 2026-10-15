import { describe, expect, it } from "vitest";
import type { BriefFacts, Concept, GeneratedStrategy } from "@/contracts/strategy";
import {
  checkGeneratedAgainstFacts,
  checkTextAgainstFacts,
  conceptIndexOfPath,
  createFactChecker,
  normalizeForFacts,
  numberValues,
} from "@/server/ai/fact-guard";

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

const issuesOf = (text: string, f: BriefFacts = facts()) => checkTextAgainstFacts(text, f);
const ok = (text: string, f?: BriefFacts) => expect(issuesOf(text, f)).toEqual([]);
const flagged = (text: string, f?: BriefFacts) => expect(issuesOf(text, f).length).toBeGreaterThan(0);

describe("fact-guard: normalização", () => {
  it("remove acentos e caixa", () => {
    expect(normalizeForFacts("GRÁTIS Promoção Única")).toBe("gratis promocao unica");
  });

  it("interpreta números no formato brasileiro", () => {
    expect(numberValues("24,90")).toEqual([24.9]);
    expect(numberValues("1.200")).toEqual([1200]);
    expect(numberValues("1.200,50")).toEqual([1200.5]);
    expect(numberValues("6")).toEqual([6]);
  });
});

describe("fact-guard (a): números", () => {
  it("aceita números presentes nos fatos (texto, idades, raio, preço)", () => {
    ok("Pão saindo do forno às 6h");
    ok("Para quem tem de 25 a 55 anos");
    ok("Atendimento num raio de até 3 km");
    ok("Café completo por 24,90");
    ok("Café completo por 24");
  });

  it("recusa números que não estão nos fatos", () => {
    expect(issuesOf("Mais de 500 clientes atendidos")).toEqual([
      { path: "texto", message: 'Número "500" não aparece nas informações confirmadas.' },
    ]);
    flagged("Há 10 anos no bairro");
    flagged("Aberto 7 dias por semana");
    flagged("Desde 2015");
  });

  it("compara pelo valor, não pela grafia", () => {
    const f = facts({ differentiators: ["Mais de 1.200 pães por dia"] });
    ok("1200 pães por dia", f);
    ok("Forno às 06h");
  });

  it("aceita formatos de peça só fora do texto do anúncio", () => {
    const checker = createFactChecker(facts());
    expect(checker.check("concepts[0].visual_direction", "Peça vertical 9:16 com foto real")).toEqual([]);
    expect(checker.check("concepts[0].headline", "Peça 9:16", { adFacing: true }).length).toBeGreaterThan(0);
  });
});

describe("fact-guard (b): preço", () => {
  it("recusa R$ quando não há preço confirmado", () => {
    const f = facts({ price_cents: null });
    const issues = issuesOf("Só R$ 19,90 o café", f);
    expect(issues.some((i) => i.message.includes("não confirmou preço"))).toBe(true);
    flagged("Por apenas 20 reais", f);
  });

  it("aceita o preço confirmado e recusa outro valor", () => {
    ok("Café completo por R$ 24,90");
    ok("Café completo por R$24,90");
    const issues = issuesOf("Café completo por R$ 19,90");
    expect(issues).toEqual([{ path: "texto", message: "Valor R$ 19,90 diferente do preço confirmado (R$ 24,90)." }]);
  });

  it("formata milhares na mensagem", () => {
    const issues = issuesOf("Pacote por R$ 999", facts({ price_cents: 123456 }));
    expect(issues[0]?.message).toContain("R$ 1.234,56");
  });
});

describe("fact-guard (c): promoções e descontos", () => {
  it.each([
    "Ganhe 10% de desconto",
    "Entrega GRÁTIS",
    "Entrega gratis",
    "Primeira aula gratuita",
    "Promoção de inauguração",
    "PROMOCAO imperdível",
    "Liquidação total",
    "Frete grátis para o bairro",
    "Use o cupom da casa",
    "Leve dois e pague um",
  ])("recusa sem estar nos fatos: %s", (text) => flagged(text));

  it("aceita quando a palavra está nos fatos (com ou sem acento)", () => {
    const f = facts({ differentiators: ["Entrega grátis no bairro", "Promoção de terça"] });
    ok("Entrega gratis no bairro", f);
    ok("Entrega GRÁTIS", f);
    ok("Promoção toda terça", f);
    ok("Café gratuito para crianças", facts({ offer_description: "Café grátis para crianças, todos os dias." }));
  });

  it("percentual só se houver percentual nos fatos", () => {
    flagged("Desconto de 10%");
    ok("10% de desconto à vista", facts({ differentiators: ["10% de desconto à vista"] }));
  });
});

describe("fact-guard (d): garantias, superlativos e rankings", () => {
  it.each([
    "Garantia de satisfação",
    "Resultado garantido",
    "O melhor café da cidade",
    "A melhor padaria",
    "Melhor do bairro",
    "Melhor da região",
    "Melhor de Campinas",
    "Padaria nº 1",
    "Número 1 em pães",
    "Líder em vendas",
    "100% natural",
    "Eficácia comprovada",
    "Aprovado por especialistas",
    "Recomendado por médicos",
    "O mais vendido",
    "A única padaria artesanal",
    "Preço imbatível",
  ])("recusa sem estar nos fatos: %s", (text) => flagged(text));

  it("aceita quando o cliente confirmou o termo", () => {
    const f = facts({ differentiators: ["Eleita a melhor padaria do bairro em 2023", "Ingredientes 100% naturais"] });
    ok("A melhor padaria do bairro", f);
    ok("Ingredientes 100% naturais", f);
    ok("Garantia de 7 dias", facts({ offer_description: "Conserto com garantia de 7 dias." }));
  });

  it("não confunde palavras parecidas", () => {
    ok("Melhore sua manhã com pão quentinho");
    ok("Uma manhã melhor começa aqui");
  });
});

describe("fact-guard (e): depoimentos e avaliações", () => {
  it.each([
    "Veja o depoimento da Maria",
    "Mais avaliações positivas",
    "Avaliação máxima",
    "Cinco estrelas no Google",
    "★★★★★",
    "Nota máxima no bairro",
    "Segundo nossos clientes, é o pão mais gostoso",
    "Clientes aprovam o café",
  ])("recusa: %s", (text) => flagged(text));

  it("recusa fala entre aspas atribuída a clientes", () => {
    flagged('"Melhor pão que já comi" — Ana, cliente');
    flagged("“O café é maravilhoso”, diz uma cliente");
    flagged('"Atendimento nota dez" - Joana');
  });

  it("aceita aspas comuns sem atribuição", () => {
    ok('Peça o nosso "pão de fermentação natural"');
  });

  it("aceita avaliação quando é o serviço confirmado (ex.: consultório)", () => {
    const f = facts({ offer_name: "Avaliação odontológica", segment: "Odontologia" });
    ok("Agende sua avaliação odontológica", f);
  });
});

describe("fact-guard (f): urgência falsa", () => {
  it.each([
    "Só hoje!",
    "SO HOJE",
    "Últimas unidades",
    "Ultimas vagas",
    "Por tempo limitado",
    "Acaba hoje",
    "Corra para garantir o seu",
    "Estoque limitado",
  ])("recusa sem estar nos fatos: %s", (text) => flagged(text));

  it("aceita quando está nos fatos", () => {
    ok("Só hoje: pão em dobro", facts({ differentiators: ["Só hoje: pão em dobro"] }));
  });

  it("não confunde 'corrida' com 'corra'", () => {
    ok("Para quem tem a manhã corrida");
  });
});

function concept(overrides: Partial<Concept> = {}): Concept {
  return {
    angle: "oferta_direta",
    title: "Oferta direta",
    rationale: "Mostra a oferta de forma clara.",
    headline: "Café da manhã completo",
    body: "Pão na chapa, café e suco natural.",
    primary_text: "Café da manhã completo na Padaria Exemplo.",
    cta: "Chamar no WhatsApp",
    show_price: false,
    template_key: "oferta",
    visual_direction: "Foto real do café da manhã.",
    ...overrides,
  };
}

function generated(overrides: { concepts?: Concept[]; summary?: string } = {}): GeneratedStrategy {
  return {
    strategy: {
      summary: overrides.summary ?? "Divulgar o café da manhã completo para moradores do bairro em Campinas.",
      positioning: "Café da manhã completo em Campinas.",
      audience_insights: ["Público de 25 a 55 anos.", "Moradores e trabalhadores do bairro."],
      key_messages: ["Café da manhã completo", "Pão saindo do forno às 6h", "Fale com a gente"],
      recommended_formats: ["feed_4x5"],
      channel_note: "Feed e Stories com botão para o WhatsApp.",
      // Avisos não são conferidos: podem citar o que não pode aparecer.
      cautions: ["Não prometa desconto nem 100% de satisfação."],
    },
    concepts: overrides.concepts ?? [concept(), concept({ angle: "diferencial" }), concept({ angle: "convite_local" })],
  };
}

describe("checkGeneratedAgainstFacts", () => {
  it("saída limpa não tem problemas", () => {
    expect(checkGeneratedAgainstFacts(generated(), facts())).toEqual([]);
  });

  it("aponta o caminho exato de cada problema", () => {
    const gen = generated({
      summary: "Divulgar o melhor café da manhã de Campinas para moradores do bairro.",
      concepts: [
        concept(),
        concept({ headline: "Só hoje!" }),
        concept({ primary_text: "Mais de 300 clientes felizes" }),
      ],
    });
    const paths = checkGeneratedAgainstFacts(gen, facts()).map((i) => i.path);
    expect(paths).toContain("strategy.summary");
    expect(paths).toContain("concepts[1].headline");
    expect(paths).toContain("concepts[2].primary_text");
    expect(paths.every((p) => !p.includes("cautions"))).toBe(true);
  });

  it("show_price sem preço confirmado é problema", () => {
    const gen = generated({ concepts: [concept({ show_price: true }), concept(), concept()] });
    expect(checkGeneratedAgainstFacts(gen, facts({ price_cents: null }))).toEqual([
      { path: "concepts[0].show_price", message: "show_price só pode ser true quando há preço confirmado." },
    ]);
    expect(checkGeneratedAgainstFacts(gen, facts())).toEqual([]);
  });

  it("confere todos os campos de texto da estratégia e dos conceitos", () => {
    const bad = "Garantia total";
    const gen = generated();
    gen.strategy.positioning = bad;
    gen.strategy.audience_insights[1] = bad;
    gen.strategy.key_messages[2] = bad;
    gen.strategy.channel_note = bad;
    gen.concepts[0] = concept({ title: bad, rationale: bad, body: bad, visual_direction: bad });
    const paths = checkGeneratedAgainstFacts(gen, facts()).map((i) => i.path);
    expect(paths).toEqual([
      "strategy.positioning",
      "strategy.audience_insights[1]",
      "strategy.key_messages[2]",
      "strategy.channel_note",
      "concepts[0].title",
      "concepts[0].rationale",
      "concepts[0].body",
      "concepts[0].visual_direction",
    ]);
  });

  it("mensagens citam o trecho original (com acento)", () => {
    const [issue] = issuesOf("Entrega grátis");
    expect(issue?.message).toContain('"grátis"');
  });

  it("conceptIndexOfPath separa estratégia de conceitos", () => {
    expect(conceptIndexOfPath("concepts[3].headline")).toBe(3);
    expect(conceptIndexOfPath("strategy.summary")).toBeNull();
  });
});
