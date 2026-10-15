import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CreativeDesign } from "@/contracts/creative";

const design: CreativeDesign = {
  format: "stories_9x16",
  template_key: "faixa",
  business_name: "Padaria Exemplo",
  headline: "Café da manhã completo",
  body: "",
  cta: "Pedir no WhatsApp",
  show_price: false,
  price_cents: null,
  currency: "BRL",
  brand_color: "#C2410C",
  background: "claro",
};

const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);

async function loadClient(basePath = "") {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_BASE_PATH", basePath);
  return import("@/lib/creative/render-client");
}

describe("renderCreativePng", () => {
  const fetchMock = vi.fn<typeof fetch>();
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("envia o design e devolve o PNG", async () => {
    fetchMock.mockResolvedValue(new Response(png, { status: 200, headers: { "Content-Type": "image/png" } }));
    const { renderCreativePng } = await loadClient();
    const blob = await renderCreativePng(design);
    expect(new Uint8Array(await blob.arrayBuffer())).toEqual(png);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/render");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({ design });
    expect(new Headers(init?.headers).get("content-type")).toBe("application/json");
  });

  it("respeita o subcaminho público (ex.: /ads)", async () => {
    fetchMock.mockResolvedValue(new Response(png, { status: 200, headers: { "Content-Type": "image/png" } }));
    const { renderCreativePng } = await loadClient("/ads");
    await renderCreativePng(design);
    expect(fetchMock.mock.calls[0][0]).toBe("/ads/api/render");
  });

  it("lança a mensagem do ApiError", async () => {
    fetchMock.mockResolvedValue(
      Response.json(
        {
          ok: false,
          error: { code: "quota_exceeded", message: "Muitas exportações seguidas.", correlation_id: "abc12345" },
        },
        { status: 429 },
      ),
    );
    const { renderCreativePng, RenderError } = await loadClient();
    const error = await renderCreativePng(design).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(RenderError);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe("Muitas exportações seguidas.");
    expect(error).toMatchObject({ status: 429, code: "quota_exceeded", correlationId: "abc12345" });
  });

  it("resposta inesperada vira mensagem padrão", async () => {
    fetchMock.mockResolvedValue(new Response("<html>502</html>", { status: 502 }));
    const { renderCreativePng, RENDER_FALLBACK_MESSAGE } = await loadClient();
    await expect(renderCreativePng(design)).rejects.toThrow(RENDER_FALLBACK_MESSAGE);
  });

  it("200 sem PNG não é tratado como sucesso", async () => {
    fetchMock.mockResolvedValue(Response.json({ ok: true }));
    const { renderCreativePng, RENDER_FALLBACK_MESSAGE } = await loadClient();
    await expect(renderCreativePng(design)).rejects.toThrow(RENDER_FALLBACK_MESSAGE);
  });

  it("falha de rede vira mensagem amigável", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    const { renderCreativePng } = await loadClient();
    await expect(renderCreativePng(design)).rejects.toThrow(/Sem conexão/);
  });

  it("cancelamento é repassado", async () => {
    fetchMock.mockRejectedValue(new DOMException("aborted", "AbortError"));
    const { renderCreativePng } = await loadClient();
    await expect(renderCreativePng(design, { signal: AbortSignal.abort() })).rejects.toMatchObject({
      name: "AbortError",
    });
  });

  it("nome do arquivo igual ao da rota", async () => {
    const { creativeFilename } = await loadClient();
    expect(creativeFilename(design)).toBe("gerevendas-stories_9x16-faixa.png");
  });
});
