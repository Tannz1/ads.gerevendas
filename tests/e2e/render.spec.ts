import { expect, test, type APIRequestContext, type TestInfo } from "@playwright/test";
import { p } from "./paths";

/**
 * Exportação PNG (POST /api/render) contra o servidor standalone (`npm run start`): passar aqui
 * prova que as fontes de `public/fonts` são encontradas no build de produção.
 */

// Espelho de FORMAT_SPECS (src/contracts/creative.ts): o teste confere o PNG contra estes valores.
const SIZES = { feed_4x5: { width: 1080, height: 1350 }, stories_9x16: { width: 1080, height: 1920 } } as const;
const TEMPLATES = ["destaque", "oferta", "minimal", "faixa"] as const;

const design = {
  format: "feed_4x5",
  template_key: "destaque",
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

/** Chave de rate limit própria por teste (a rota limita 30/min por primeiro salto do X-Forwarded-For). */
const clientKey = (info: TestInfo) => `e2e-${info.workerIndex}-${info.testId.slice(-12)}-${Date.now() % 1e9}`;

function pngSize(buffer: Buffer) {
  expect([...buffer.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  expect(buffer.subarray(12, 16).toString("ascii")).toBe("IHDR");
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

async function post(request: APIRequestContext, key: string, data: unknown, headers: Record<string, string> = {}) {
  return request.post(p("/api/render"), {
    headers: { "content-type": "application/json", "x-forwarded-for": key, ...headers },
    data: typeof data === "string" ? data : JSON.stringify(data),
  });
}

async function expectApiError(response: Awaited<ReturnType<typeof post>>, status: number, code: string) {
  expect(response.status()).toBe(status);
  expect(response.headers()["content-type"]).toContain("application/json");
  const body = await response.json();
  expect(body).toMatchObject({ ok: false, error: { code, message: expect.any(String) } });
  expect(body.error.correlation_id).toMatch(/^[A-Za-z0-9-]{8,64}$/);
  return body;
}

test.describe("exportação PNG", () => {
  test.beforeEach(({}, info) => test.skip(info.project.name !== "desktop", "API: roda uma vez, no projeto desktop"));

  for (const format of Object.keys(SIZES) as (keyof typeof SIZES)[]) {
    test(`${format}: todos os modelos geram PNG no tamanho final`, async ({ request }, info) => {
      test.setTimeout(60_000);
      const key = clientKey(info);
      for (const [i, template_key] of TEMPLATES.entries()) {
        const background = (["gradiente", "solido", "claro"] as const)[i % 3];
        const show_price = i % 2 === 0;
        const response = await post(request, key, {
          design: { ...design, format, template_key, background, show_price, price_cents: show_price ? 2490 : null },
        });
        expect(response.status(), `${template_key}`).toBe(200);
        const headers = response.headers();
        expect(headers["content-type"]).toBe("image/png");
        expect(headers["cache-control"]).toBe("no-store");
        expect(headers["content-disposition"]).toBe(`attachment; filename="gerevendas-${format}-${template_key}.png"`);
        expect(pngSize(await response.body())).toEqual(SIZES[format]);
      }
    });
  }

  test("peça inválida: 400 com erros por campo", async ({ request }, info) => {
    const response = await post(request, clientKey(info), {
      design: { ...design, headline: "x".repeat(41), brand_color: "laranja" },
    });
    const body = await expectApiError(response, 400, "validation_failed");
    expect(body.error.field_errors.headline).toEqual(["Título: máximo de 40 caracteres"]);
    expect(body.error.field_errors.brand_color).toEqual(["Cor em hexadecimal, ex.: #C2410C"]);
  });

  test("sem o campo design: 400", async ({ request }, info) => {
    const body = await expectApiError(await post(request, clientKey(info), { foo: 1 }), 400, "validation_failed");
    expect(body.error.field_errors.design).toBeDefined();
  });

  test("corpo que não é JSON: 400", async ({ request }, info) => {
    const key = clientKey(info);
    await expectApiError(await post(request, key, "{design:"), 400, "validation_failed");
    await expectApiError(
      await post(request, key, JSON.stringify({ design }), { "content-type": "text/plain" }),
      400,
      "validation_failed",
    );
  });

  test("corpo acima de 16 KB: 413", async ({ request }, info) => {
    const big = JSON.stringify({ design: { ...design, body: "x".repeat(17 * 1024) } });
    await expectApiError(await post(request, clientKey(info), big), 413, "validation_failed");
  });

  test("limite de 30 exportações por minuto por cliente: 429", async ({ request }, info) => {
    const key = clientKey(info);
    for (let i = 0; i < 30; i++) {
      // Corpos inválidos são baratos e também contam para o limite.
      expect((await post(request, key, {})).status()).toBe(400);
    }
    const limited = await post(request, key, { design });
    await expectApiError(limited, 429, "quota_exceeded");
    expect(Number(limited.headers()["retry-after"])).toBeGreaterThan(0);
    // Outro cliente segue livre.
    expect((await post(request, `${key}-outro`, { design })).status()).toBe(200);
  });
});
