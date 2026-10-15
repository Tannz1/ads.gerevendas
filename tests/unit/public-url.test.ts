import { afterEach, describe, expect, it, vi } from "vitest";

async function load(env: Record<string, string>) {
  vi.resetModules();
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
  return import("@/lib/public-env");
}

afterEach(() => vi.unstubAllEnvs());

describe("publicUrl", () => {
  it("usa a origem pública configurada e o subcaminho (atrás de proxy)", async () => {
    const { publicUrl } = await load({
      NEXT_PUBLIC_APP_URL: "https://gerevendas.com.br",
      NEXT_PUBLIC_BASE_PATH: "/ads",
    });
    expect(publicUrl("/entrar?erro=link", "http://0.0.0.0:3000").toString()).toBe(
      "https://gerevendas.com.br/ads/entrar?erro=link",
    );
  });

  it("sem configuração, usa a origem da requisição e a raiz", async () => {
    const { publicUrl } = await load({ NEXT_PUBLIC_APP_URL: "", NEXT_PUBLIC_BASE_PATH: "" });
    expect(publicUrl("/app", "http://localhost:3000").toString()).toBe("http://localhost:3000/app");
  });
});
