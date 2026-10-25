import { describe, expect, it, vi } from "vitest";
import { appSecretProof, META_GRAPH_VERSION } from "@/server/meta/graph";
import { RealMetaBusinessClient } from "@/server/meta/real-client";

type Call = { url: URL; init: RequestInit };

function fakeFetch(responses: Array<{ status: number; body: unknown } | Error>) {
  const calls: Call[] = [];
  const impl = vi.fn(async (input: URL | RequestInfo, init?: RequestInit) => {
    calls.push({ url: new URL(String(input)), init: init ?? {} });
    const next = responses.shift();
    if (!next) throw new Error("resposta não configurada");
    if (next instanceof Error) throw next;
    return new Response(JSON.stringify(next.body), { status: next.status });
  });
  return { impl: impl as unknown as typeof fetch, calls };
}

const cfg = { businessId: "111", accessToken: "tok", appSecret: "sec", retryDelayMs: 0 };

describe("RealMetaBusinessClient", () => {
  it("lê contas da BM com versão fixada, token no cabeçalho e appsecret_proof", async () => {
    const f = fakeFetch([{ status: 200, body: { data: [{ id: "act_1", name: "A", account_status: 1, currency: "BRL" }] } }]);
    const client = new RealMetaBusinessClient({ ...cfg, fetchImpl: f.impl });
    expect(await client.listBusinessAdAccounts()).toEqual([{ id: "act_1", name: "A", account_status: 1, currency: "BRL" }]);
    const { url, init } = f.calls[0];
    expect(url.pathname).toBe(`/${META_GRAPH_VERSION}/111/owned_ad_accounts`);
    expect(url.searchParams.get("appsecret_proof")).toBe(appSecretProof("tok", "sec"));
    expect(url.searchParams.get("access_token")).toBeNull();
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok");
  });

  it("segue a paginação para achar a Página compartilhada", async () => {
    const f = fakeFetch([
      { status: 200, body: { data: [{ id: "1", name: "Outra" }], paging: { cursors: { after: "c1" }, next: "x" } } },
      { status: 200, body: { data: [{ id: "123456789012", name: "Padaria", username: "padariadojoao" }] } },
    ]);
    const client = new RealMetaBusinessClient({ ...cfg, fetchImpl: f.impl });
    const page = await client.findClientPage({ kind: "username", username: "padariadojoao" });
    expect(page?.id).toBe("123456789012");
    expect(f.calls[1].url.searchParams.get("after")).toBe("c1");
    expect(f.calls[0].url.pathname).toBe(`/${META_GRAPH_VERSION}/111/client_pages`);
  });

  it("devolve null quando a Página não foi compartilhada", async () => {
    const f = fakeFetch([{ status: 200, body: { data: [] } }]);
    const client = new RealMetaBusinessClient({ ...cfg, fetchImpl: f.impl });
    expect(await client.findClientPage({ kind: "id", id: "999999" })).toBeNull();
  });

  it("tenta de novo uma leitura que falhou com 5xx", async () => {
    const f = fakeFetch([
      { status: 500, body: null },
      { status: 200, body: { funding_source: "123", account_status: 1 } },
    ]);
    const client = new RealMetaBusinessClient({ ...cfg, fetchImpl: f.impl });
    expect(await client.getFunding("act_1")).toEqual({ has_funding_source: true, account_status: 1 });
    expect(f.calls).toHaveLength(2);
  });

  it("não repete escritas e converte erro da Meta", async () => {
    const f = fakeFetch([{ status: 400, body: { error: { code: 190 } } }]);
    const client = new RealMetaBusinessClient({ ...cfg, fetchImpl: f.impl });
    await expect(client.inviteBusinessUser("a@b.com")).rejects.toMatchObject({ code: "token_expired" });
    expect(f.calls).toHaveLength(1);
    expect(f.calls[0].init.method).toBe("POST");
    const body = new URLSearchParams(String(f.calls[0].init.body));
    expect(body.get("email")).toBe("a@b.com");
    expect(body.get("role")).toBe("EMPLOYEE");
  });

  it("falha de rede vira meta_unavailable", async () => {
    const f = fakeFetch([new TypeError("fetch failed"), new TypeError("fetch failed")]);
    const client = new RealMetaBusinessClient({ ...cfg, fetchImpl: f.impl });
    await expect(client.listBusinessAdAccounts()).rejects.toMatchObject({ code: "meta_unavailable" });
  });

  it("convite aceito devolve o ID do usuário da BM", async () => {
    const f = fakeFetch([{ status: 200, body: { data: [{ id: "bsu_9", email: "Dono@Padaria.com" }] } }]);
    const client = new RealMetaBusinessClient({ ...cfg, fetchImpl: f.impl });
    expect(await client.getBusinessUserInvite("dono@padaria.com")).toEqual({ status: "accepted", business_user_id: "bsu_9" });
  });

  it("convite ainda pendente", async () => {
    const f = fakeFetch([
      { status: 200, body: { data: [] } },
      { status: 200, body: { data: [{ id: "req_1", email: "dono@padaria.com", status: "PENDING" }] } },
    ]);
    const client = new RealMetaBusinessClient({ ...cfg, fetchImpl: f.impl });
    expect(await client.getBusinessUserInvite("dono@padaria.com")).toEqual({ status: "pending", business_user_id: null });
    expect(f.calls[1].url.pathname).toBe(`/${META_GRAPH_VERSION}/111/pending_users`);
  });

  it("criar conta sem fuso configurado é erro de configuração", async () => {
    const client = new RealMetaBusinessClient({ ...cfg, fetchImpl: fakeFetch([]).impl });
    await expect(client.createAdAccount({ name: "Estoque" })).rejects.toMatchObject({ code: "config_missing" });
  });
});
