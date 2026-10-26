import { describe, expect, it } from "vitest";
import { summarizeMetrics } from "@/lib/campaign-metrics";

describe("totais do painel", () => {
  it("não apresenta zeros fictícios quando não há dados", () => {
    expect(summarizeMetrics([])).toBeNull();
  });
  it("pondera CTR e CPC pelos totais, sem somar alcance", () => {
    expect(
      summarizeMetrics([
        { spend_cents: 1000, impressions: 100, clicks: 10, conversations: 2 },
        { spend_cents: 2000, impressions: 900, clicks: 20, conversations: 3 },
      ]),
    ).toEqual({ spend_cents: 3000, impressions: 1000, clicks: 30, conversations: 5, ctr: 3, cpc_cents: 100 });
  });
  it("preserva zero real e evita divisão por zero", () => {
    expect(summarizeMetrics([{ spend_cents: 0, impressions: 0, clicks: 0, conversations: 0 }])).toMatchObject({
      spend_cents: 0,
      ctr: null,
      cpc_cents: null,
    });
  });
});
