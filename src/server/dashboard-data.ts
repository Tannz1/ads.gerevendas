import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { CampaignListItem, CampaignDetailView } from "./campaigns-data";
import { loadCreative, type CreativeView } from "./creatives-data";

export type DashboardCampaign = CampaignListItem & {
  campaign_insights: CampaignDetailView["insights"];
  execution_started_at: string | null;
  /** Primeira peça da campanha, para a miniatura no painel. */
  creative: CreativeView | null;
};

// ponytail: miniatura só das 12 campanhas mais recentes; paginar se o painel crescer.
const THUMBNAILS = 12;

/** Organização vem exclusivamente da sessão no chamador; RLS também limita a leitura. */
export async function loadDashboard(organizationId: string) {
  const db = await createSupabaseServerClient();
  const [account, campaigns, executions] = await Promise.all([
    db
      .from("meta_ad_account_pool")
      .select("ad_account_id, name, currency, assigned_at, simulated")
      .eq("organization_id", organizationId)
      .eq("status", "assigned")
      .maybeSingle(),
    db
      .from("campaigns")
      .select(
        "id, name, objective, status, meta_review_status, simulated, daily_budget_cents, currency, duration_days, external_campaign_id, created_at, activated_at, campaign_insights(spend_cents, impressions, reach, clicks, conversations, fetched_at), campaign_creatives(creative_id)",
      )
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false }),
    db.rpc("meta_execution_overview", { p_org: organizationId }),
  ]);
  if (account.error || campaigns.error || executions.error) throw new Error("dashboard_load_failed");
  const executionDates = new Map(
    ((executions.data ?? []) as Array<{ campaign_id: string; started_at: string }>).map((e) => [
      e.campaign_id,
      e.started_at,
    ]),
  );
  const rows = (campaigns.data ?? []) as unknown as Array<
    Omit<DashboardCampaign, "campaign_insights" | "creative" | "execution_started_at"> & {
      campaign_insights: DashboardCampaign["campaign_insights"] | NonNullable<DashboardCampaign["campaign_insights"]>[];
      campaign_creatives: Array<{ creative_id: string }> | null;
    }
  >;
  const creatives = await Promise.all(
    rows.map((c, i) => {
      const id = c.campaign_creatives?.[0]?.creative_id;
      return i < THUMBNAILS && id ? loadCreative(id) : Promise.resolve(null);
    }),
  );
  return {
    account: account.data as {
      ad_account_id: string;
      name: string;
      currency: string;
      assigned_at: string | null;
      simulated: boolean;
    } | null,
    // A FK composta pode ser serializada como relação 1:N pelo PostgREST.
    campaigns: rows.map(({ campaign_creatives: _links, ...campaign }, i): DashboardCampaign => ({
      ...campaign,
      execution_started_at: executionDates.get(campaign.id) ?? null,
      campaign_insights: Array.isArray(campaign.campaign_insights)
        ? (campaign.campaign_insights[0] ?? null)
        : campaign.campaign_insights,
      creative: creatives[i],
    })),
  };
}
