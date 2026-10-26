import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), context: vi.fn(), from: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/server/context", () => ({ getAppContext: mocks.context }));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: () => ({ rpc: mocks.rpc }) }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: async () => ({ from: mocks.from }) }));
vi.mock("@/server/creative-png", () => ({ renderCreativePng: vi.fn() }));
vi.mock("@/server/creatives-data", () => ({ loadCreative: vi.fn() }));
import { loadRealCampaign, withCampaignExecution } from "@/server/meta/campaign-real";

describe("execução privilegiada e organização atual", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rpc.mockResolvedValue({ data: true, error: null });
  });
  it("trava ocupada impede toda chamada externa", async () => {
    mocks.rpc.mockResolvedValue({ data: false, error: null });
    const run = vi.fn();
    await expect(withCampaignExecution("camp", run)).rejects.toThrow("campaign_execution_busy");
    expect(run).not.toHaveBeenCalled();
  });
  it("falha recuperável libera com o mesmo token adquirido", async () => {
    await expect(
      withCampaignExecution("camp", async () => {
        throw new Error("publication_reconciliation_required");
      }),
    ).rejects.toThrow("publication_reconciliation_required");
    const token = mocks.rpc.mock.calls[0][1].p_token;
    expect(mocks.rpc).toHaveBeenLastCalledWith("meta_release_execution", { p_campaign: "camp", p_token: token });
  });
  it("falha sem pausa confirmada mantém trava para recuperação", async () => {
    await expect(
      withCampaignExecution("camp", async () => {
        throw new Error("activation_recovery_required");
      }),
    ).rejects.toThrow("activation_recovery_required");
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });
  it("sem organização não carrega campanha", async () => {
    mocks.context.mockResolvedValue({ mode: "supabase", organization: null });
    expect(await loadRealCampaign("camp")).toBeNull();
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it("restringe campanha e peças à organização da sessão além do RLS", async () => {
    mocks.context.mockResolvedValue({ mode: "supabase", organization: { id: "current-org" } });
    const query = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      then: (resolve: (value: { data: null; error: null }) => unknown) =>
        Promise.resolve({ data: null, error: null }).then(resolve),
    };
    mocks.from.mockReturnValue(query);
    expect(await loadRealCampaign("foreign-campaign")).toBeNull();
    expect(
      query.eq.mock.calls.filter(([key, value]) => key === "organization_id" && value === "current-org"),
    ).toHaveLength(2);
  });
});
