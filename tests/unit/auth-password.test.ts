import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ reset: vi.fn(), update: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ host: "app.test", "x-forwarded-proto": "https" }),
}));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/server/context", () => ({ getCorrelationId: async () => "test-correlation" }));
vi.mock("@/lib/env", () => ({ serverEnv: () => ({ NEXT_PUBLIC_APP_URL: "https://app.test" }) }));
vi.mock("@/lib/public-env", () => ({
  isSupabaseConfigured: () => true,
  publicUrl: (path: string, origin: string) => new URL(path, origin),
}));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: { resetPasswordForEmail: mocks.reset, updateUser: mocks.update },
  }),
}));
import { requestPasswordReset, setPassword } from "@/server/auth";

const form = (fields: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
};

describe("senha", () => {
  beforeEach(() => {
    mocks.reset.mockReset().mockResolvedValue({ error: null });
    mocks.update.mockReset().mockResolvedValue({ error: null });
  });

  it("pedido de nova senha volta para /app/senha e não revela se o e-mail existe", async () => {
    mocks.reset.mockResolvedValue({ error: { status: 400 } });
    const res = await requestPasswordReset({ status: "idle" }, form({ email: "dono@empresa.com.br" }));
    expect(res).toEqual({ status: "sent", email: "dono@empresa.com.br" });
    const redirectTo = new URL(mocks.reset.mock.calls[0][1].redirectTo);
    expect(redirectTo.pathname).toBe("/auth/callback");
    expect(redirectTo.searchParams.get("next")).toBe("/app/senha");
  });

  it("recusa senha curta e confirmação diferente sem chamar o Auth", async () => {
    expect((await setPassword({ status: "idle" }, form({ password: "curta", confirm: "curta" }))).status).toBe("error");
    expect(
      (await setPassword({ status: "idle" }, form({ password: "senhaforte1", confirm: "senhaforte2" }))).message,
    ).toBe("As senhas não são iguais");
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("salva a senha válida", async () => {
    const res = await setPassword({ status: "idle" }, form({ password: "senhaforte1", confirm: "senhaforte1" }));
    expect(res).toEqual({ status: "saved" });
    expect(mocks.update).toHaveBeenCalledWith({ password: "senhaforte1" });
  });
});
