import { describe, expect, it } from "vitest";
import { creativeContentSchema, strategyPlanSchema } from "@/contracts/creatives";
import { angle, validPlan } from "./fixtures";

describe("strategyPlanSchema", () => {
  it("aceita um plano com os 5 ângulos", () => {
    expect(strategyPlanSchema.safeParse(validPlan).success).toBe(true);
  });

  it("recusa 4 ângulos", () => {
    expect(strategyPlanSchema.safeParse({ ...validPlan, angles: validPlan.angles.slice(0, 4) }).success).toBe(false);
  });

  it("recusa ângulo repetido", () => {
    const angles = [...validPlan.angles.slice(0, 4), angle("oferta")];
    expect(strategyPlanSchema.safeParse({ ...validPlan, angles }).success).toBe(false);
  });

  it("recusa título acima de 60 caracteres", () => {
    const angles = validPlan.angles.map((a, i) => (i === 0 ? { ...a, headline: "x".repeat(61) } : a));
    expect(strategyPlanSchema.safeParse({ ...validPlan, angles }).success).toBe(false);
  });
});

describe("creativeContentSchema", () => {
  const content = {
    template: "oferta",
    headline: "Café da manhã completo",
    body: "Pão na chapa, café e suco natural.",
    cta: "Chamar no WhatsApp",
    show_price: false,
    colors: { background: "#C2410C", accent: "#FFFFFF", text: "#FFFFFF" },
  };

  it("aceita conteúdo válido", () => {
    expect(creativeContentSchema.safeParse(content).success).toBe(true);
  });

  it("recusa cor fora do formato hexadecimal", () => {
    expect(creativeContentSchema.safeParse({ ...content, colors: { ...content.colors, text: "branco" } }).success).toBe(
      false,
    );
  });

  it("recusa título vazio", () => {
    expect(creativeContentSchema.safeParse({ ...content, headline: "  " }).success).toBe(false);
  });
});
