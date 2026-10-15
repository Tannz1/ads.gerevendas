import { describe, expect, it } from "vitest";
import {
  AA_BODY,
  AA_LARGE,
  BLACK,
  INK,
  WHITE,
  adjustForContrast,
  contrastRatio,
  ensureContrast,
  hexToRgb,
  isLight,
  minContrast,
  mix,
  readableTextColor,
  relativeLuminance,
  rgbToHex,
  saturation,
  shade,
  tint,
  withAlpha,
} from "@/lib/creative/color";

const BRANDS = ["#FFFF00", "#111111", "#2A45E8", "#C2410C", "#FFFFFF", "#000000", "#22C55E", "#E11D48", "#7F7F7F"];

describe("conversões", () => {
  it("hex <-> rgb", () => {
    expect(hexToRgb("#2A45E8")).toEqual({ r: 42, g: 69, b: 232 });
    expect(hexToRgb("fff")).toEqual({ r: 255, g: 255, b: 255 });
    expect(rgbToHex({ r: 42, g: 69, b: 232 })).toBe("#2A45E8");
    expect(rgbToHex({ r: 300, g: -4, b: 12.6 })).toBe("#FF000D");
    expect(() => hexToRgb("azul")).toThrow();
  });

  it("rgba com alfa limitado", () => {
    expect(withAlpha("#2A45E8", 0.5)).toBe("rgba(42, 69, 232, 0.5)");
    expect(withAlpha("#000000", 2)).toBe("rgba(0, 0, 0, 1)");
  });
});

describe("luminância e contraste (WCAG)", () => {
  it("extremos", () => {
    expect(relativeLuminance(WHITE)).toBeCloseTo(1, 5);
    expect(relativeLuminance(BLACK)).toBe(0);
    expect(contrastRatio(WHITE, BLACK)).toBeCloseTo(21, 5);
    expect(contrastRatio("#2A45E8", "#2A45E8")).toBe(1);
  });

  it("valores de referência", () => {
    // Amarelo puro: luminância ~0,93 (claro); azul da marca provisória: ~0,106.
    expect(relativeLuminance("#FFFF00")).toBeCloseTo(0.9278, 3);
    expect(contrastRatio("#2A45E8", WHITE)).toBeCloseTo(6.74, 1);
    expect(contrastRatio("#C2410C", WHITE)).toBeCloseTo(5.18, 1);
    expect(contrastRatio("#777777", WHITE)).toBeCloseTo(4.48, 1);
  });

  it("é simétrico e o mínimo considera todas as paradas", () => {
    expect(contrastRatio("#C2410C", "#111111")).toBeCloseTo(contrastRatio("#111111", "#C2410C"), 10);
    expect(minContrast(WHITE, ["#000000", "#777777"])).toBeCloseTo(contrastRatio(WHITE, "#777777"), 10);
  });

  it("claro x escuro", () => {
    expect(isLight("#FFFF00")).toBe(true);
    expect(isLight("#111111")).toBe(false);
    expect(isLight("#2A45E8")).toBe(false);
    expect(isLight("#C2410C")).toBe(false);
  });
});

describe("tint, shade e mix", () => {
  it("extremos e meio", () => {
    expect(tint("#2A45E8", 1)).toBe(WHITE);
    expect(shade("#2A45E8", 1)).toBe(BLACK);
    expect(tint("#2A45E8", 0)).toBe("#2A45E8");
    expect(mix("#000000", "#FFFFFF", 0.5)).toBe("#808080");
  });

  it("clarear aumenta e escurecer diminui a luminância", () => {
    for (const c of ["#2A45E8", "#C2410C", "#22C55E"]) {
      expect(relativeLuminance(tint(c, 0.3))).toBeGreaterThan(relativeLuminance(c));
      expect(relativeLuminance(shade(c, 0.3))).toBeLessThan(relativeLuminance(c));
    }
  });

  it("saturação", () => {
    expect(saturation("#FFFF00")).toBe(1);
    expect(saturation("#777777")).toBe(0);
    expect(saturation("#000000")).toBe(0);
  });
});

describe("cor de texto legível", () => {
  it.each(BRANDS)("texto comum sobre %s atinge AA (4,5:1)", (bg) => {
    const fg = readableTextColor(bg);
    expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(AA_BODY);
  });

  it("escolhe a tinta escura no amarelo e branco no azul/laranja/preto", () => {
    expect(readableTextColor("#FFFF00")).toBe(INK);
    expect(readableTextColor("#2A45E8")).toBe(WHITE);
    expect(readableTextColor("#C2410C")).toBe(WHITE);
    expect(readableTextColor("#111111")).toBe(WHITE);
  });

  it("vale para todas as paradas de um gradiente", () => {
    const stops = ["#2A45E8", "#0B1020"];
    expect(minContrast(readableTextColor(stops), stops)).toBeGreaterThanOrEqual(AA_BODY);
  });

  it("cai para branco/preto puros quando as preferidas não bastam", () => {
    // Cinza médio: a tinta escura padrão quase passa; preto puro garante.
    const fg = readableTextColor("#767676", { light: "#EEEEEE", dark: "#333333" });
    expect(contrastRatio(fg, "#767676")).toBeGreaterThanOrEqual(AA_BODY);
  });

  it("título grande aceita 3:1", () => {
    for (const bg of BRANDS) {
      expect(contrastRatio(readableTextColor(bg, { minContrast: AA_LARGE }), bg)).toBeGreaterThanOrEqual(AA_LARGE);
    }
  });
});

describe("ajuste de contraste da cor da marca", () => {
  it.each(BRANDS)("ensureContrast deixa %s legível sobre branco e sobre preto", (brand) => {
    expect(contrastRatio(ensureContrast(brand, WHITE), WHITE)).toBeGreaterThanOrEqual(AA_BODY);
    expect(contrastRatio(ensureContrast(brand, INK), INK)).toBeGreaterThanOrEqual(AA_BODY);
  });

  it("mantém a cor quando já passa", () => {
    expect(ensureContrast("#2A45E8", WHITE)).toBe("#2A45E8");
  });

  it("desiste (null) quando precisaria deslocar demais a cor", () => {
    // Amarelo sobre papel claro só passa se virar oliva: melhor usar outra cor.
    expect(adjustForContrast("#FFFF00", "#F7F5F0", AA_LARGE, 0.3)).toBeNull();
    // Laranja sobre branco passa sem ajuste.
    expect(adjustForContrast("#C2410C", WHITE, AA_BODY, 0.3)).toBe("#C2410C");
  });
});
