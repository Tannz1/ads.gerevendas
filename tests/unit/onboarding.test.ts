import { describe, expect, it } from "vitest";
import {
  emptyForm,
  firstStepWithError,
  hydrateForm,
  toPayload,
  validateAll,
  validateStep,
  type FormState,
} from "@/components/onboarding/form-state";
import { onboardingSchema } from "@/contracts/onboarding";

function filled(): FormState {
  const f = emptyForm();
  f.business = {
    name: "Padaria Exemplo",
    segment: "Alimentação",
    city: "Campinas",
    state: "SP",
    instagram_handle: "@padaria.exemplo",
    whatsapp: "(19) 99999-0000",
    website_url: "",
    competitors: ["Padaria Central (@padariacentral)", "", ""],
  };
  f.offer = {
    name: "Café da manhã completo",
    description: "Pão na chapa, café e suco natural.",
    show_price: true,
    price: "24,90",
    price_confirmed_by_client: true,
    differentiators: ["Pão às 6h", "", ""],
  };
  f.audience = {
    description: "Moradores e trabalhadores do bairro",
    age_min: "25",
    age_max: "55",
    service_radius_km: "3",
  };
  f.goal = { objective: "mensagens_whatsapp" };
  f.identity = { brand_primary_color: "#C2410C", tone_of_voice: "acolhedor" };
  f.review = { facts_confirmed: true };
  return f;
}

describe("onboarding: conversão para o contrato", () => {
  it("gera payload canônico válido", () => {
    const payload = toPayload(filled());
    const parsed = onboardingSchema.parse(payload);
    expect(parsed.business.whatsapp_e164).toBe("+5519999990000");
    expect(parsed.business.instagram_handle).toBe("padaria.exemplo");
    expect(parsed.offer.price_cents).toBe(2490);
    expect(parsed.offer.differentiators).toEqual(["Pão às 6h"]);
    expect(parsed.audience.service_radius_km).toBe(3);
    expect(parsed.business.competitors).toEqual(["Padaria Central (@padariacentral)"]);
  });

  it("formulário completo não tem erros", () => {
    expect(validateAll(filled())).toEqual({});
  });

  it("sem preço não exige confirmação e envia null", () => {
    const f = filled();
    f.offer.show_price = false;
    f.offer.price_confirmed_by_client = false;
    expect(toPayload(f).offer.price_cents).toBeNull();
    expect(validateStep("offer", f)).toEqual({});
  });
});

describe("onboarding: guardrails de veracidade", () => {
  it("preço exige confirmação do cliente", () => {
    const f = filled();
    f.offer.price_confirmed_by_client = false;
    expect(validateStep("offer", f)).toHaveProperty("offer.price_confirmed_by_client");
  });

  it("preço ilegível vira erro no campo de preço", () => {
    const f = filled();
    f.offer.price = "vinte reais";
    expect(validateStep("offer", f)).toHaveProperty("offer.price");
  });

  it("concluir exige confirmação de fatos", () => {
    const f = filled();
    f.review.facts_confirmed = false;
    expect(validateAll(f)).toHaveProperty("review.facts_confirmed");
  });

  it("objetivo WhatsApp exige WhatsApp e aponta a etapa 1", () => {
    const f = filled();
    f.business.whatsapp = "";
    const errors = validateAll(f);
    expect(errors).toHaveProperty("business.whatsapp");
    expect(firstStepWithError(errors)).toBe(1);
  });

  it("idade mínima não pode passar da máxima", () => {
    const f = filled();
    f.audience.age_min = "60";
    f.audience.age_max = "30";
    expect(validateStep("audience", f)).toHaveProperty("audience.age_max");
  });

  it("mensagens de erro em português", () => {
    const errors = validateStep("business", emptyForm());
    expect(errors["business.state"]).toBe("Escolha o estado");
    expect(errors["business.name"]).toMatch(/Nome do negócio/);
  });
});

describe("onboarding: rascunho", () => {
  it("hidrata rascunho parcial ou corrompido com padrões", () => {
    expect(hydrateForm(null)).toEqual(emptyForm());
    const f = hydrateForm({ business: { name: "X", state: 42 }, offer: { differentiators: ["a"] }, lixo: true });
    expect(f.business.name).toBe("X");
    expect(f.business.state).toBe("");
    expect(f.offer.differentiators).toEqual(["a", "", ""]);
    expect(f).not.toHaveProperty("lixo");
  });
});
