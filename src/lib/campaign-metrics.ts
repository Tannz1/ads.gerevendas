export type CampaignMetrics = {
  spend_cents: number;
  impressions: number;
  clicks: number;
  conversations: number;
};

/** Alcance não é somado: uma mesma pessoa pode aparecer em várias campanhas. */
export function summarizeMetrics(rows: CampaignMetrics[]) {
  if (!rows.length) return null;
  const totals = rows.reduce<CampaignMetrics>(
    (sum, row) => ({
      spend_cents: sum.spend_cents + Number(row.spend_cents),
      impressions: sum.impressions + Number(row.impressions),
      clicks: sum.clicks + Number(row.clicks),
      conversations: sum.conversations + Number(row.conversations),
    }),
    { spend_cents: 0, impressions: 0, clicks: 0, conversations: 0 },
  );
  return {
    ...totals,
    ctr: totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : null,
    cpc_cents: totals.clicks > 0 ? Math.round(totals.spend_cents / totals.clicks) : null,
  };
}
