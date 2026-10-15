import { describe, expect, it } from "vitest";
import type { CreativeDesign } from "@/contracts/creative";
import { issuesToFieldErrors, validateDesign } from "@/lib/creative/validate";

const valid: CreativeDesign = {
  format: "feed_4x5",
  template_key: "oferta",
  business_name: "Padaria Exemplo",
  headline: "Café da manhã completo",
  body: "Pão na chapa, café e suco natural.",
  cta: "Pedir no WhatsApp",
  show_price: true,
  price_cents: 2490,
  currency: "BRL",
  brand_color: "#C2410C",
  background: "gradiente",
};
const confirmed = { price_cents: 2490, price_confirmed_by_client: true, currency: "BRL" };

describe("validateDesign", () => {
  it("aceita uma peça válida", () => {
    const { design, issues } = validateDesign(valid, confirmed);
    expect(issues).toEqual([]);
    expect(design).toEqual(valid);
  });

  it("sem oferta, não checa preço", () => {
    expect(validateDesign({ ...valid, price_cents: 1 }, null).issues).toEqual([]);
  });

  it("mapeia erros do schema por campo, em português", () => {
    const { design, issues } = validateDesign(
      {
        ...valid,
        headline: "Um título muito, muito comprido demais para a peça",
        body: "x".repeat(91),
        cta: "Ok mas este botão tem texto demais",
        brand_color: "azul",
        business_name: "",
        format: "quadrado",
        template_key: "outro",
        background: "neon",
        currency: "real",
      },
      null,
    );
    expect(design).toBeNull();
    const byField = issuesToFieldErrors(issues);
    expect(byField.headline).toEqual(["Título: máximo de 40 caracteres"]);
    expect(byField.body).toEqual(["Texto: máximo de 90 caracteres"]);
    expect(byField.cta).toEqual(["Botão: máximo de 24 caracteres"]);
    expect(byField.brand_color).toEqual(["Cor em hexadecimal, ex.: #C2410C"]);
    expect(byField.business_name).toEqual(["Informe o nome do negócio."]);
    expect(byField.format?.[0]).toMatch(/formato/i);
    expect(byField.template_key?.[0]).toMatch(/modelo/i);
    expect(byField.background?.[0]).toMatch(/fundo/i);
    expect(byField.currency?.[0]).toMatch(/moeda/i);
    // Nenhuma mensagem em inglês (padrão do Zod).
    for (const issue of issues) expect(issue.message).not.toMatch(/Invalid|Too (big|small)|expected/);
  });

  it("título curto e campos ausentes", () => {
    const { issues } = validateDesign({ ...valid, headline: "Oi", cta: undefined }, null);
    const byField = issuesToFieldErrors(issues);
    expect(byField.headline).toEqual(["Título muito curto"]);
    expect(byField.cta).toEqual(["Informe o texto do botão."]);
  });

  it("show_price sem preço", () => {
    const { design, issues } = validateDesign({ ...valid, price_cents: null }, null);
    expect(design).toBeNull();
    expect(issues).toEqual([{ field: "price_cents", message: "Preço ausente" }]);
  });

  it("entrada que não é objeto", () => {
    const { design, issues } = validateDesign("peça", null);
    expect(design).toBeNull();
    expect(issues).toEqual([{ field: "layout", message: "Peça inválida." }]);
  });

  it("preço sem confirmação do cliente", () => {
    const { design, issues } = validateDesign(valid, { ...confirmed, price_confirmed_by_client: false });
    expect(design).not.toBeNull();
    expect(issues).toEqual([
      { field: "show_price", message: "A oferta não tem preço confirmado; a peça não pode mostrar preço." },
    ]);
  });

  it("preço diferente do confirmado", () => {
    const { issues } = validateDesign({ ...valid, price_cents: 1990 }, confirmed);
    expect(issues).toEqual([
      { field: "price_cents", message: "O preço da peça precisa ser igual ao preço confirmado da oferta." },
    ]);
  });

  it("moeda diferente da oferta", () => {
    const { issues } = validateDesign({ ...valid, currency: "USD" }, confirmed);
    expect(issues.map((i) => i.field)).toEqual(["price_cents"]);
  });

  it("sem preço na peça, a oferta não importa", () => {
    const design = { ...valid, show_price: false, price_cents: null };
    expect(
      validateDesign(design, { price_cents: null, price_confirmed_by_client: false, currency: "BRL" }).issues,
    ).toEqual([]);
  });

  it("regra de preço também com outros erros de schema", () => {
    const { design, issues } = validateDesign({ ...valid, headline: "Oi", price_cents: 1990 }, confirmed);
    expect(design).toBeNull();
    expect(issues.map((i) => i.field).sort()).toEqual(["headline", "price_cents"]);
  });

  it("avisa sobre emojis e símbolos que não aparecem na peça", () => {
    const { design, issues } = validateDesign({ ...valid, headline: "Café quentinho ☕", cta: "Peça já 👉" }, null);
    expect(design).not.toBeNull();
    expect(issues).toEqual([
      { field: "headline", message: "O título tem caracteres que não aparecem na peça (como emojis). Remova-os." },
      { field: "cta", message: "O botão tem caracteres que não aparecem na peça (como emojis). Remova-os." },
    ]);
  });
});
