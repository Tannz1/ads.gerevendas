import { describe, expect, it } from "vitest";
import { checkFacts } from "@/server/ai/facts";
import { validPlan } from "./fixtures";

const withBody = (body: string) => ({
  ...validPlan,
  angles: validPlan.angles.map((a, i) => (i === 0 ? { ...a, body } : a)),
});

const facts = (price_cents: number | null, confirmed_text = "") => ({ price_cents, confirmed_text });

describe("checkFacts", () => {
  it("aceita plano sem valores nem promessas", () => {
    expect(checkFacts(validPlan, facts(null))).toEqual([]);
  });

  it("aceita o preço confirmado", () => {
    expect(checkFacts(withBody("Por R$ 24,90 no balcão."), facts(2490))).toEqual([]);
  });

  it("aceita preço confirmado no fim da frase e com milhar", () => {
    expect(checkFacts(withBody("Só R$24,90."), facts(2490))).toEqual([]);
    expect(checkFacts(withBody("Pacote por R$ 1.250,00."), facts(125000))).toEqual([]);
  });

  it("recusa preço diferente do confirmado", () => {
    expect(checkFacts(withBody("Por R$ 19,90 hoje."), facts(2490))).not.toEqual([]);
  });

  it("recusa qualquer preço quando nenhum foi confirmado", () => {
    expect(checkFacts(withBody("A partir de R$10."), facts(null))).not.toEqual([]);
  });

  it.each([
    "20% off",
    "Desconto especial",
    "Entrega grátis",
    "Garantia total",
    "Promoção relâmpago",
    "Últimas unidades",
  ])("recusa promessa não confirmada: %s", (body) => {
    expect(checkFacts(withBody(body), facts(null))).not.toEqual([]);
  });

  it("aceita termo que o próprio cliente confirmou", () => {
    expect(checkFacts(withBody("Garantia de 90 dias"), facts(null, "Garantia de 90 dias em todo serviço"))).toEqual([]);
  });

  it("checa também resumo e CTA", () => {
    const plan = { ...validPlan, business_summary: "Melhor preço com desconto" };
    expect(checkFacts(plan, facts(null))).not.toEqual([]);
  });
});
