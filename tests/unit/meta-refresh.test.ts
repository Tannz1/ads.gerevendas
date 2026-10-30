import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MetaOnboardingView } from "@/server/meta/steps";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  sessionRpc: vi.fn(),
  load: vi.fn(),
  funding: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/server/context", () => ({
  getCorrelationId: async () => "test-correlation",
  getAppContext: async () => ({
    mode: "supabase",
    user: { id: "owner" },
    organization: { id: "org", name: "Empresa", role: "owner" },
  }),
}));
vi.mock("@/lib/env", () => ({ serverEnv: () => ({ META_MODE: "mock" }) }));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: () => ({ rpc: mocks.rpc }) }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: async () => ({ rpc: mocks.sessionRpc }) }));
vi.mock("@/server/meta/data", () => ({ loadMetaOnboarding: mocks.load }));
vi.mock("@/server/meta/index", () => ({ metaBusinessClient: () => ({ getFunding: mocks.funding }) }));
import { refreshMetaStatus } from "@/server/meta/actions";

const row: MetaOnboardingView = {
  status: "connected",
  simulated: true,
  ad_account_id: "act_123",
  ad_account_name: "Conta",
  ad_account_status: "done",
  pool_requested_at: null,
  page_id: "page",
  page_name: "Página",
  page_access_status: "done",
  instagram_actor_id: null,
  instagram_status: "pending",
  client_invite_status: "accepted",
  client_invite_email: null,
  billing_status: "verified",
  shared_account: false,
};

describe("verificação da conta atribuída", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rpc.mockResolvedValue({ data: true, error: null });
    mocks.load.mockResolvedValue(row);
  });
  it("detecta conta desativada mesmo com pagamento já verificado", async () => {
    mocks.funding.mockResolvedValue({ account_status: 2, has_funding_source: true });
    expect((await refreshMetaStatus()).ok).toBe(true);
    expect(mocks.rpc).toHaveBeenCalledWith(
      "meta_set_ad_account_status",
      expect.objectContaining({ p_status: "error", p_org: "org" }),
    );
  });
  it("restaura conta recuperada sem pedir uma nova ao estoque", async () => {
    mocks.load.mockResolvedValue({ ...row, ad_account_status: "error" });
    mocks.funding.mockResolvedValue({ account_status: 1, has_funding_source: true });
    await refreshMetaStatus();
    expect(mocks.sessionRpc).not.toHaveBeenCalled();
    expect(mocks.rpc).toHaveBeenCalledWith("meta_set_ad_account_status", expect.objectContaining({ p_status: "done" }));
  });
  it("revoga verificação quando o pagamento deixa de existir", async () => {
    mocks.funding.mockResolvedValue({ account_status: 1, has_funding_source: false });
    await refreshMetaStatus();
    expect(mocks.rpc).toHaveBeenCalledWith("meta_set_billing", expect.objectContaining({ p_verified: false }));
  });
  it("respeita o intervalo antes de consultar a Meta", async () => {
    mocks.rpc.mockResolvedValue({ data: false, error: null });
    await refreshMetaStatus();
    expect(mocks.funding).not.toHaveBeenCalled();
  });
});
