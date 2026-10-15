import { describe, expect, it, vi } from "vitest";

// `server-only` só pode ser importado no servidor; no teste, neutraliza o guarda.
vi.mock("server-only", () => ({}));

describe("loadRenderFonts", () => {
  it("carrega as quatro fontes WOFF uma única vez", async () => {
    const { loadRenderFonts, RENDER_FONT_FAMILIES } = await import("@/lib/creative/fonts");
    const first = loadRenderFonts();
    const fonts = await first;
    expect(loadRenderFonts()).toBe(first);
    expect(fonts.map((f) => `${f.name} ${f.weight}`)).toEqual([
      "Inter 400",
      "Inter 600",
      "Plus Jakarta Sans 700",
      "Plus Jakarta Sans 800",
    ]);
    for (const font of fonts) {
      expect(font.data).toBeInstanceOf(ArrayBuffer);
      // Assinatura WOFF ("wOFF").
      expect(new TextDecoder().decode(new Uint8Array(font.data, 0, 4))).toBe("wOFF");
      expect(font.style).toBe("normal");
    }
    expect(RENDER_FONT_FAMILIES).toEqual({ display: "Plus Jakarta Sans", body: "Inter" });
  });
});
