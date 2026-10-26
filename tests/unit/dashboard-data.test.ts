import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ from: mocks.from, rpc: async () => ({ data: [], error: null }) }),
}));
import { loadDashboard } from "@/server/dashboard-data";

const insight = {
  spend_cents: 1200,
  impressions: 400,
  reach: 250,
  clicks: 8,
  conversations: 1,
  fetched_at: "2026-10-26T12:00:00Z",
};
function setup(rows: unknown[], failed = false) {
  const accounts = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
  };
  const campaigns = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockResolvedValue({ data: rows, error: failed ? { code: "network" } : null }),
  };
  mocks.from.mockImplementation((table: string) => (table === "campaigns" ? campaigns : accounts));
  return { accounts, campaigns };
}
describe("dados do painel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  it("filtra conta e campanhas pela mesma organização", async () => {
    const { accounts, campaigns } = setup([]);
    await loadDashboard("org-a");
    expect(accounts.eq).toHaveBeenCalledWith("organization_id", "org-a");
    expect(campaigns.eq).toHaveBeenCalledWith("organization_id", "org-a");
  });
  it("normaliza relações compostas em array ou objeto e preserva ausência", async () => {
    setup([
      { id: "one", campaign_insights: [insight] },
      { id: "two", campaign_insights: insight },
      { id: "three", campaign_insights: [] },
    ]);
    const result = await loadDashboard("org-a");
    expect(result.campaigns.map((c) => c.campaign_insights)).toEqual([insight, insight, null]);
  });
  it("erro de leitura não é apresentado como lista vazia", async () => {
    setup([], true);
    await expect(loadDashboard("org-a")).rejects.toThrow("dashboard_load_failed");
  });
});
