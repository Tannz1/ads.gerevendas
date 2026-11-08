import { describe, expect, it } from "vitest";
import {
  productDescription,
  productInputSchema,
  REACH_OPTIONS,
  reachFromRadius,
  recordSaleSchema,
} from "@/contracts/products";
import { checkFacts } from "@/server/ai/facts";
import { validPlan } from "./fixtures";

const valid = {
  name: "Kit de botas femininas",
  price_cents: 29990,
  highlights: [{ kind: "parcelamento", text: "Até 3x sem juros" }],
  photo_asset_id: "4f7c1a2e-3b5d-4c6e-8f90-1a2b3c4d5e6f",
  facts_confirmed: true,
  request_key: "prod_12345678",
};

describe("productInputSchema", () => {
  it("aceita produto com preço, destaque e foto", () => {
    const p = productInputSchema.parse(valid);
    expect(p.details).toBe("");
    expect(p.highlights).toHaveLength(1);
  });

  it("exige confirmação dos fatos", () => {
    expect(productInputSchema.safeParse({ ...valid, facts_confirmed: false }).success).toBe(false);
  });

  it("recusa preço zero e destaque repetido", () => {
    expect(productInputSchema.safeParse({ ...valid, price_cents: 0 }).success).toBe(false);
    const twice = [
      { kind: "entrega", text: "Entrega no mesmo dia" },
      { kind: "entrega", text: "Entrega grátis" },
    ];
    expect(productInputSchema.safeParse({ ...valid, highlights: twice }).success).toBe(false);
  });

  it("aceita produto sem preço", () => {
    expect(productInputSchema.safeParse({ ...valid, price_cents: null }).success).toBe(true);
  });
});

describe("productDescription", () => {
  it("usa só o texto do dono e respeita o mínimo do banco", () => {
    const d = productDescription({ name: "Bolo", details: "", highlights: [] });
    expect(d.length).toBeGreaterThanOrEqual(10);
    expect(d.startsWith("Bolo")).toBe(true);
  });

  it("junta detalhes e destaques sem ponto duplicado", () => {
    const d = productDescription({
      name: "Kit",
      details: "Couro legítimo.",
      highlights: [{ kind: "parcelamento", text: "Até 3x sem juros" }],
    });
    expect(d).toBe("Couro legítimo. Até 3x sem juros");
  });
});

describe("destaques confirmados liberam a checagem de fatos", () => {
  it("desconto escrito pelo dono pode aparecer na peça", () => {
    const plan = structuredClone(validPlan);
    plan.angles[0].headline = "10% de desconto no Pix";
    const highlight = "10% de desconto no Pix";
    expect(checkFacts(plan, { price_cents: null, confirmed_text: "Kit de botas" }).length).toBeGreaterThan(0);
    expect(checkFacts(plan, { price_cents: null, confirmed_text: `Kit de botas\n${highlight}` })).toEqual([]);
  });
});

describe("alcance", () => {
  it("mapeia o raio salvo para a opção da tela", () => {
    expect(reachFromRadius(null)).toBe("cidade");
    expect(reachFromRadius(REACH_OPTIONS.cidade.radius_km)).toBe("cidade");
    expect(reachFromRadius(REACH_OPTIONS.regiao.radius_km)).toBe("regiao");
  });

  it("fica dentro do raio que a Meta aceita no payload (17 a 80 km)", () => {
    for (const o of Object.values(REACH_OPTIONS)) {
      expect(o.radius_km).toBeGreaterThanOrEqual(17);
      expect(o.radius_km).toBeLessThanOrEqual(80);
    }
  });
});

describe("recordSaleSchema", () => {
  it("exige ao menos 1 venda e valor em centavos inteiros", () => {
    const id = valid.photo_asset_id;
    expect(recordSaleSchema.safeParse({ campaign_id: id, quantity: 0, amount_cents: null }).success).toBe(false);
    expect(recordSaleSchema.safeParse({ campaign_id: id, quantity: 2, amount_cents: 59.9 }).success).toBe(false);
    expect(recordSaleSchema.safeParse({ campaign_id: id, quantity: 2, amount_cents: 59980 }).success).toBe(true);
  });
});
