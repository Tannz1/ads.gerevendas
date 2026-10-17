import { describe, expect, it } from "vitest";
import { creativeContentSchema } from "@/contracts/creatives";
import { contrastRatio, initialContents, readableOn } from "@/lib/creatives";
import { validPlan } from "./fixtures";

describe("readableOn", () => {
  it("usa texto claro em fundo escuro e escuro em fundo claro", () => {
    expect(readableOn("#1F2937")).toBe("#FFFFFF");
    expect(readableOn("#FDE68A")).toBe("#111827");
  });

  it("garante contraste mínimo de 4,5:1", () => {
    for (const bg of ["#C2410C", "#2A45E8", "#16A34A", "#F59E0B", "#7C3AED", "#000000", "#FFFFFF"]) {
      expect(contrastRatio(bg, readableOn(bg))).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe("initialContents", () => {
  it("gera 5 conteúdos válidos, um por ângulo", () => {
    const out = initialContents(validPlan, "#C2410C", 2490);
    expect(out.map((c) => c.angle_key)).toEqual(validPlan.angles.map((a) => a.key));
    for (const c of out) expect(creativeContentSchema.safeParse(c.content).success).toBe(true);
  });

  it("mostra preço só na peça de oferta e só se houver preço confirmado", () => {
    expect(
      initialContents(validPlan, "#C2410C", 2490)
        .filter((c) => c.content.show_price)
        .map((c) => c.angle_key),
    ).toEqual(["oferta"]);
    expect(initialContents(validPlan, "#C2410C", null).some((c) => c.content.show_price)).toBe(false);
  });

  it("usa cor neutra quando não há cor da marca", () => {
    expect(initialContents(validPlan, null, null)[0].content.colors.background).toMatch(/^#[0-9A-F]{6}$/i);
  });
});
