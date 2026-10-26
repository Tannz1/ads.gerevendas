import "server-only";
import { getAppContext } from "./context";
import type { CampaignStatus, MetaConnectionStatus, MetaReviewStatus } from "@/contracts/campaigns";
import type { Objective } from "@/contracts/onboarding";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type MetaConnectionView = {
  status: MetaConnectionStatus;
  simulated: boolean;
  ad_account_id: string | null;
  ad_account_name: string | null;
  page_id: string | null;
  page_name: string | null;
  instagram_actor_id: string | null;
  whatsapp_phone_e164: string | null;
  billing_verified_on_meta: boolean;
  connected_at: string | null;
};

export type CampaignListItem = {
  id: string;
  name: string;
  objective: Objective;
  status: CampaignStatus;
  meta_review_status: MetaReviewStatus;
  simulated: boolean;
  daily_budget_cents: number;
  currency: string;
  duration_days: number;
  external_campaign_id: string | null;
  created_at: string;
  activated_at: string | null;
};

export type CampaignDetailView = CampaignListItem & {
  strategy_id: string;
  external_adset_id: string | null;
  spend_confirmed_at: string;
  paused_at: string | null;
  creatives: Array<{
    creative_id: string;
    external_ad_id: string | null;
    angle_key: string;
    headline: string;
  }>;
  operations: Array<{
    id: string;
    operation: "publish_paused" | "activate" | "pause";
    simulated: boolean;
    created_at: string;
  }>;
  /** Métricas lidas da Meta (só campanhas reais). null = ainda não sincronizadas. */
  insights: {
    spend_cents: number;
    impressions: number;
    reach: number;
    clicks: number;
    conversations: number;
    fetched_at: string;
  } | null;
};

export async function loadMetaConnection(organizationId: string): Promise<MetaConnectionView | null> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("meta_connections")
    .select(
      "status, simulated, ad_account_id, ad_account_name, page_id, page_name, instagram_actor_id, whatsapp_phone_e164, billing_verified_on_meta, connected_at",
    )
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (!data) return null;
  return data as MetaConnectionView;
}

export async function loadCampaignsList(organizationId: string): Promise<CampaignListItem[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("campaigns")
    .select(
      "id, name, objective, status, meta_review_status, simulated, daily_budget_cents, currency, duration_days, external_campaign_id, created_at, activated_at",
    )
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false });
  return (data ?? []) as CampaignListItem[];
}

export async function loadCampaignDetail(campaignId: string): Promise<CampaignDetailView | null> {
  const ctx = await getAppContext();
  if (ctx.mode !== "supabase" || !ctx.organization) return null;
  const supabase = await createSupabaseServerClient();
  const [{ data: camp }, { data: links }, { data: ops }, { data: insights }] = await Promise.all([
    supabase
      .from("campaigns")
      .select(
        "id, strategy_id, name, objective, status, meta_review_status, simulated, daily_budget_cents, currency, duration_days, external_campaign_id, external_adset_id, spend_confirmed_at, activated_at, paused_at, created_at",
      )
      .eq("id", campaignId)
      .eq("organization_id", ctx.organization.id)
      .maybeSingle(),
    supabase
      .from("campaign_creatives")
      .select("creative_id, external_ad_id, creatives(angle_key, content)")
      .eq("campaign_id", campaignId)
      .eq("organization_id", ctx.organization.id),
    supabase
      .from("publication_operations")
      .select("id, operation, simulated, created_at")
      .eq("campaign_id", campaignId)
      .eq("organization_id", ctx.organization.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("campaign_insights")
      .select("spend_cents, impressions, reach, clicks, conversations, fetched_at")
      .eq("campaign_id", campaignId)
      .eq("organization_id", ctx.organization.id)
      .maybeSingle(),
  ]);

  if (!camp) return null;
  const c = camp as unknown as Omit<CampaignDetailView, "creatives" | "operations" | "insights">;

  const creatives = (
    (links ?? []) as unknown as Array<{
      creative_id: string;
      external_ad_id: string | null;
      creatives: { angle_key: string; content: { headline?: string } } | null;
    }>
  ).map((item) => ({
    creative_id: item.creative_id,
    external_ad_id: item.external_ad_id,
    angle_key: item.creatives?.angle_key ?? "oferta",
    headline: item.creatives?.content?.headline ?? "Peça",
  }));

  return {
    ...c,
    creatives,
    operations: (ops ?? []) as CampaignDetailView["operations"],
    insights: (insights as CampaignDetailView["insights"]) ?? null,
  };
}
