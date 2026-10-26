import { describe, expect, it } from "vitest";
import { computeSteps, isAdAccountUsable, type MetaOnboardingView } from "@/server/meta/steps";

const base: MetaOnboardingView = {
  status: "disconnected",
  simulated: true,
  ad_account_id: null,
  ad_account_name: null,
  ad_account_status: "pending",
  pool_requested_at: null,
  page_id: null,
  page_name: null,
  page_access_status: "pending",
  instagram_actor_id: null,
  instagram_status: "pending",
  client_invite_status: "not_sent",
  client_invite_email: null,
  billing_status: "unverified",
};

const states = (row: MetaOnboardingView | null) => computeSteps(row).map((s) => s.state);

describe("computeSteps", () => {
  it("sem conexão: só o primeiro passo está liberado", () => {
    expect(states(null)).toEqual(["todo", "locked", "locked", "locked"]);
  });

  it("estoque vazio deixa o primeiro passo aguardando", () => {
    expect(states({ ...base, ad_account_status: "awaiting_meta", pool_requested_at: "2026-10-25T10:00:00Z" })).toEqual([
      "waiting",
      "locked",
      "locked",
      "locked",
    ]);
  });

  const withAccount = { ...base, ad_account_id: "act_1", ad_account_status: "done" as const };
  const withPage = { ...withAccount, page_id: "p1", page_access_status: "done" as const };

  it("libera um passo por vez", () => {
    expect(states(withAccount)).toEqual(["done", "todo", "locked", "locked"]);
    expect(states(withPage)).toEqual(["done", "done", "todo", "locked"]);
    expect(states({ ...withPage, client_invite_status: "pending" })).toEqual(["done", "done", "waiting", "locked"]);
    expect(states({ ...withPage, client_invite_status: "expired" })).toEqual(["done", "done", "error", "locked"]);
    expect(states({ ...withPage, client_invite_status: "accepted" })).toEqual(["done", "done", "done", "todo"]);
  });

  it("tudo concluído", () => {
    expect(states({ ...withPage, client_invite_status: "accepted", billing_status: "verified" })).toEqual([
      "done",
      "done",
      "done",
      "done",
    ]);
  });
});

describe("conta de anúncios com problema na Meta", () => {
  it("passo 1 fica em atenção e os seguintes travam", () => {
    expect(
      computeSteps({
        ...base,
        ad_account_id: "act_1",
        ad_account_status: "error",
        page_id: "p1",
        page_access_status: "done",
        client_invite_status: "accepted",
        billing_status: "verified",
      }).map((s) => s.state),
    ).toEqual(["error", "locked", "locked", "locked"]);
  });
});

describe("isAdAccountUsable", () => {
  it("só conta ativa ou em período de carência pode veicular", () => {
    expect(isAdAccountUsable(1)).toBe(true);
    expect(isAdAccountUsable(9)).toBe(true);
    for (const status of [2, 3, 7, 8, 100, 101, 0]) expect(isAdAccountUsable(status)).toBe(false);
  });
});
