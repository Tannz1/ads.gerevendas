import { describe, expect, it, vi } from "vitest";
import { parseServerEnv } from "@/lib/env";
import { detectImage } from "@/lib/image-bytes";
import { buildImagePrompt } from "@/server/ai/image-prompt";
import { openaiImage } from "@/server/ai/openai-image";
import { selectImageProvider } from "@/server/ai/provider";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16]);

describe("detectImage", () => {
  it("reconhece PNG e JPEG pelos bytes", () => {
    expect(detectImage(PNG)).toEqual({ mime: "image/png", ext: "png" });
    expect(detectImage(JPEG)).toEqual({ mime: "image/jpeg", ext: "jpg" });
  });

  it("recusa outros formatos mesmo com nome de imagem", () => {
    expect(detectImage(new TextEncoder().encode("%PDF-1.7"))).toBeNull();
    expect(detectImage(new TextEncoder().encode("<html>"))).toBeNull();
    expect(detectImage(new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]))).toBeNull(); // WebP
    expect(detectImage(new Uint8Array())).toBeNull();
  });
});

describe("buildImagePrompt", () => {
  const facts = { segment: "Padaria", offer_name: "Café da manhã completo", city: "Campinas" };

  it("pede imagem sem texto, preço ou logotipo", () => {
    const p = buildImagePrompt(facts, "oferta");
    expect(p).toMatch(/sem nenhum texto/i);
    expect(p).toMatch(/logotipo/i);
    expect(p).toContain("Café da manhã completo");
  });

  it("varia a cena por ângulo", () => {
    expect(buildImagePrompt(facts, "oferta")).not.toEqual(buildImagePrompt(facts, "conveniencia"));
  });

  it("limita o tamanho do texto do cliente no prompt", () => {
    const p = buildImagePrompt({ ...facts, offer_name: "x".repeat(500) }, "oferta");
    expect(p).not.toContain("x".repeat(121));
  });

  it("usa a oferta e o texto da peça como contexto da cena", () => {
    const p = buildImagePrompt(
      {
        segment: "Pet shop",
        offer_name: "Vacinas para pets",
        offer_description: "Vacinação de cães e gatos",
        city: "Itajaí",
        headline: "Vacinas de prevenção para pets",
        body: "Fale com a gente para saber mais.",
      },
      "oferta",
    );
    expect(p).toContain("Vacinação de cães e gatos");
    expect(p).toContain("Vacinas de prevenção para pets");
    expect(p).toMatch(/sem escrever nenhuma palavra/i);
  });

  it("tira preço e números do texto antes de mandar para a imagem", () => {
    const p = buildImagePrompt(
      {
        ...facts,
        offer_description: "Combo por R$ 24,90",
        headline: "Café por R$ 24,90",
        body: "Até 10h, 20% off",
        visual_concept: "Balcão com 3 bolos e placa de R$ 15",
      },
      "oferta",
    );
    expect(p).not.toMatch(/R\$|24,90|10h|20%|\b3\b|15/);
  });

  it("usa o briefing de foto da estratégia no lugar da cena padrão", () => {
    const concept = "Close de mãos passando manteiga no pão, vista de cima";
    const p = buildImagePrompt({ ...facts, visual_concept: concept }, "oferta");
    expect(p).toContain(concept);
    expect(p).not.toContain("fundo liso");
  });

  it("deixa livre a área de texto do layout da peça", () => {
    expect(buildImagePrompt({ ...facts, layout: "conveniencia" }, "oferta")).toMatch(/terço superior simples/);
    expect(buildImagePrompt(facts, "oferta")).toMatch(/terço inferior simples/);
  });

  it("limita o tamanho do texto da peça no prompt", () => {
    const p = buildImagePrompt({ ...facts, headline: "y".repeat(500) }, "oferta");
    expect(p).not.toContain("y".repeat(221));
  });
});

// Contrato conferido na documentação oficial da OpenAI (Image API) em 17/10/2026.
const b64 = Buffer.from(JPEG).toString("base64");
const ok = () => new Response(JSON.stringify({ created: 1, data: [{ b64_json: b64 }] }), { status: 200 });

describe("openaiImage", () => {
  it("envia o corpo documentado e devolve os bytes", async () => {
    const fetchFn = vi.fn(async () => ok());
    const provider = openaiImage({
      apiKey: "sk-x",
      model: "gpt-image-2.5-flare",
      quality: "medium",
      fetchFn,
      sleep: async () => {},
    });
    const out = await provider.generate("cena", "org-hash");
    expect(Array.from(out.bytes)).toEqual(Array.from(JPEG));
    expect(out.mime).toBe("image/jpeg");

    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.openai.com/v1/images/generations");
    expect(JSON.parse(String(init.body))).toEqual({
      model: "gpt-image-2.5-flare",
      prompt: "cena",
      size: "1024x1536",
      quality: "medium",
      output_format: "jpeg",
      output_compression: 85,
      n: 1,
      safety_identifier: "org-hash",
    });
  });

  it("tenta de novo uma vez em 5xx e falha como indisponível na segunda", async () => {
    const fetchFn = vi.fn(async () => new Response("{}", { status: 502 }));
    const provider = openaiImage({ apiKey: "k", model: "m", quality: "low", fetchFn, sleep: async () => {} });
    await expect(provider.generate("p", "s")).rejects.toMatchObject({ code: "external_unavailable" });
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("recusa resposta que não é imagem", async () => {
    const bad = Buffer.from("<html>").toString("base64");
    const fetchFn = async () => new Response(JSON.stringify({ data: [{ b64_json: bad }] }), { status: 200 });
    const provider = openaiImage({ apiKey: "k", model: "m", quality: "low", fetchFn, sleep: async () => {} });
    await expect(provider.generate("p", "s")).rejects.toMatchObject({ code: "invalid_output" });
  });

  it("400 (ex.: moderação) vira saída inválida sem nova tentativa", async () => {
    const fetchFn = vi.fn(
      async () => new Response(JSON.stringify({ error: { code: "moderation_blocked" } }), { status: 400 }),
    );
    const provider = openaiImage({ apiKey: "k", model: "m", quality: "low", fetchFn, sleep: async () => {} });
    await expect(provider.generate("p", "s")).rejects.toMatchObject({ code: "invalid_output" });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
});

describe("selectImageProvider", () => {
  it("sem chave ou modelo não há provedor de imagem", () => {
    expect(selectImageProvider(parseServerEnv({}))).toBeNull();
    expect(selectImageProvider(parseServerEnv({ OPENAI_API_KEY: "k" }))).toBeNull();
  });

  it("com chave e modelo usa a OpenAI; kill switch desliga", () => {
    expect(selectImageProvider(parseServerEnv({ OPENAI_API_KEY: "k", OPENAI_IMAGE_MODEL: "m" }))?.model).toBe("m");
    expect(
      selectImageProvider(
        parseServerEnv({ OPENAI_API_KEY: "k", OPENAI_IMAGE_MODEL: "m", FEATURE_FLAG_KILL_SWITCH: "1" }),
      ),
    ).toBeNull();
  });
});
