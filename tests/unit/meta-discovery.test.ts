import { describe, expect, it } from "vitest";
import type { DiscoveredMetaAssets } from "@/lib/meta-oauth";
import { readDiscovery, saveDiscovery } from "@/server/meta-discovery";

const assets: DiscoveredMetaAssets = {
  simulated: false,
  ad_accounts: Array.from({ length: 25 }, (_, i) => ({
    id: `act_${1000 + i}`,
    name: `Conta ${i}`,
    account_status: 1,
    currency: "BRL",
    has_funding_source: true,
  })),
  pages: [{ id: "1", name: "Página" }],
};

describe("descoberta de ativos Meta", () => {
  it("devolve a lista completa pela chave curta da mesma organização", () => {
    const key = saveDiscovery("org-a", assets);
    expect(key.length).toBeLessThan(40);
    expect(readDiscovery(key, "org-a")?.ad_accounts).toHaveLength(25);
  });

  it("não entrega para outra organização, chave ausente ou desconhecida", () => {
    const key = saveDiscovery("org-a", assets);
    expect(readDiscovery(key, "org-b")).toBeNull();
    expect(readDiscovery(undefined, "org-a")).toBeNull();
    expect(readDiscovery("outra", "org-a")).toBeNull();
  });

  it("expira em 10 minutos", () => {
    const now = Date.now();
    const key = saveDiscovery("org-a", assets, now);
    expect(readDiscovery(key, "org-a", now + 9 * 60_000)).not.toBeNull();
    expect(readDiscovery(key, "org-a", now + 10 * 60_000)).toBeNull();
  });
});
