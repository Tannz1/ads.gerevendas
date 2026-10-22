import { describe, expect, it } from "vitest";
import { buildMetaAuthorizeUrl, createOAuthState, verifyOAuthState } from "@/lib/meta-oauth";

const secret = "test-secret";

describe("OAuth state da Meta", () => {
  it("aceita state assinado para a mesma organização", () => {
    const state = createOAuthState("org-a", secret);
    expect(verifyOAuthState(state, "org-a", secret)).toBe(true);
  });

  it("rejeita outra organização, outro segredo e assinatura adulterada", () => {
    const state = createOAuthState("org-a", secret);
    expect(verifyOAuthState(state, "org-b", secret)).toBe(false);
    expect(verifyOAuthState(state, "org-a", "outro")).toBe(false);
    expect(verifyOAuthState(`${state.slice(0, -1)}0`, "org-a", secret)).toBe(state.endsWith("0"));
    expect(verifyOAuthState("org-a.x", "org-a", secret)).toBe(false);
  });

  it("monta URL de autorização com versão fixada e escopos", () => {
    const url = new URL(buildMetaAuthorizeUrl({ appId: "1", redirectUri: "https://x/cb", state: "s" }));
    expect(url.pathname).toBe("/v21.0/dialog/oauth");
    expect(url.searchParams.get("scope")).toContain("ads_management");
  });
});
