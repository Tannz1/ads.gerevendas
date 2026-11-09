import "server-only";
import type { CampaignStatus, MediaFundingStatus } from "@/contracts/campaigns";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ASSETS_BUCKET, loadBriefCreatives, type CreativesOverview } from "./creatives-data";

/** Leituras do fluxo simples (ADR 0010). Isolamento pelo RLS da sessão do usuário. */

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>;

export type ProductCampaign = {
  id: string;
  status: CampaignStatus;
  simulated: boolean;
  daily_budget_cents: number;
  duration_days: number;
  currency: string;
  media_funding_status: MediaFundingStatus;
  funded_amount_cents: number;
  created_at: string;
  activated_at: string | null;
  insights: { spend_cents: number; conversations: number; clicks: number; fetched_at: string } | null;
};

export type ProductSummary = {
  brief_id: string;
  name: string;
  price_cents: number | null;
  currency: string;
  photo_url: string | null;
  created_at: string;
  campaign: ProductCampaign | null;
};

type OfferRow = {
  name: string;
  price_cents: number | null;
  currency: string;
  differentiators: string[];
  assets: { storage_path: string } | null;
};

const CAMPAIGN_COLUMNS =
  "id, strategy_id, status, simulated, daily_budget_cents, duration_days, currency, media_funding_status, funded_amount_cents, created_at, activated_at, " +
  "campaign_insights(spend_cents, conversations, clicks, fetched_at)";

type CampaignRow = Omit<ProductCampaign, "insights"> & {
  strategy_id: string;
  campaign_insights: ProductCampaign["insights"] | NonNullable<ProductCampaign["insights"]>[];
};

const toCampaign = ({ campaign_insights, strategy_id: _s, ...c }: CampaignRow): ProductCampaign => ({
  ...c,
  // A FK composta pode vir como relação 1:N pelo PostgREST.
  insights: Array.isArray(campaign_insights) ? (campaign_insights[0] ?? null) : campaign_insights,
});

async function signed(supabase: Supabase, paths: string[]): Promise<Map<string, string>> {
  if (!paths.length) return new Map();
  const { data } = await supabase.storage.from(ASSETS_BUCKET).createSignedUrls(paths, 3600);
  return new Map((data ?? []).flatMap((d) => (d.path && d.signedUrl ? [[d.path, d.signedUrl] as const] : [])));
}

/** Campanha mais recente de cada brief (via estratégias do brief). */
async function latestCampaignByBrief(supabase: Supabase, briefIds: string[]) {
  const out = new Map<string, ProductCampaign>();
  if (!briefIds.length) return out;
  const { data: strategies } = await supabase.from("strategies").select("id, brief_id").in("brief_id", briefIds);
  const briefOf = new Map((strategies ?? []).map((s) => [s.id as string, s.brief_id as string]));
  if (!briefOf.size) return out;
  const { data: campaigns } = await supabase
    .from("campaigns")
    .select(CAMPAIGN_COLUMNS)
    .in("strategy_id", [...briefOf.keys()])
    .order("created_at", { ascending: false });
  for (const row of (campaigns ?? []) as unknown as CampaignRow[]) {
    const brief = briefOf.get(row.strategy_id);
    if (brief && !out.has(brief)) out.set(brief, toCampaign(row));
  }
  return out;
}

/** Produtos do fluxo simples, mais recentes primeiro, com a campanha mais nova de cada um. */
export async function loadProducts(organizationId: string): Promise<ProductSummary[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("briefs")
    .select("id, created_at, offers(name, price_cents, currency, differentiators, assets(storage_path))")
    .eq("organization_id", organizationId)
    .not("request_key", "is", null)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw new Error(`products_load_failed:${error.code}`);
  const rows = (data ?? []) as unknown as Array<{ id: string; created_at: string; offers: OfferRow }>;
  const [urls, campaigns] = await Promise.all([
    signed(
      supabase,
      rows.flatMap((r) => (r.offers.assets ? [r.offers.assets.storage_path] : [])),
    ),
    latestCampaignByBrief(
      supabase,
      rows.map((r) => r.id),
    ),
  ]);
  return rows.map((r) => ({
    brief_id: r.id,
    name: r.offers.name,
    price_cents: r.offers.price_cents,
    currency: r.offers.currency,
    photo_url: r.offers.assets ? (urls.get(r.offers.assets.storage_path) ?? null) : null,
    created_at: r.created_at,
    campaign: campaigns.get(r.id) ?? null,
  }));
}

export type ProductFlow = {
  brief_id: string;
  name: string;
  price_cents: number | null;
  currency: string;
  highlights: string[];
  photo_url: string | null;
  radius_km: number | null;
  business: { name: string; city: string; state: string; whatsapp_e164: string | null };
  creatives: Exclude<CreativesOverview, { state: "no_brief" }>;
  campaign: ProductCampaign | null;
  meta: { connected: boolean; shared_account: boolean };
  wallet_balance_cents: number;
};

/** Tudo que as telas 4 a 8 precisam de um produto. null = não existe ou é de outra empresa. */
export async function loadProductFlow(organizationId: string, briefId: string): Promise<ProductFlow | null> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("briefs")
    .select(
      "id, service_radius_km, businesses(name, city, state, whatsapp_e164), " +
        "offers(name, price_cents, currency, differentiators, assets(storage_path))",
    )
    .eq("id", briefId)
    .eq("organization_id", organizationId)
    .not("request_key", "is", null)
    .maybeSingle();
  if (!data) return null;
  const b = data as unknown as {
    id: string;
    service_radius_km: number | null;
    businesses: ProductFlow["business"];
    offers: OfferRow;
  };

  const [creatives, campaigns, urls, meta, wallet] = await Promise.all([
    loadBriefCreatives({
      id: b.id,
      businesses: { name: b.businesses.name },
      offers: { price_cents: b.offers.price_cents, currency: b.offers.currency },
    }),
    latestCampaignByBrief(supabase, [b.id]),
    signed(supabase, b.offers.assets ? [b.offers.assets.storage_path] : []),
    supabase
      .from("meta_connections")
      .select("status, shared_account")
      .eq("organization_id", organizationId)
      .maybeSingle(),
    supabase.from("media_wallets").select("balance_cents").eq("organization_id", organizationId).maybeSingle(),
  ]);

  return {
    brief_id: b.id,
    name: b.offers.name,
    price_cents: b.offers.price_cents,
    currency: b.offers.currency,
    highlights: b.offers.differentiators ?? [],
    photo_url: b.offers.assets ? (urls.get(b.offers.assets.storage_path) ?? null) : null,
    radius_km: b.service_radius_km,
    business: b.businesses,
    creatives,
    campaign: campaigns.get(b.id) ?? null,
    meta: {
      connected: meta.data?.status === "connected",
      shared_account: Boolean(meta.data?.shared_account),
    },
    wallet_balance_cents: Number(wallet.data?.balance_cents ?? 0),
  };
}

export type SalesSummary = {
  quantity: number;
  amount_cents: number;
  records: Array<{ id: string; quantity: number; amount_cents: number | null; sold_on: string }>;
};

/** Vendas registradas pelo dono numa campanha (as 20 mais recentes na lista; totais de todas). */
export async function loadSales(campaignId: string): Promise<SalesSummary> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("sales_records")
    .select("id, quantity, amount_cents, sold_on")
    .eq("campaign_id", campaignId)
    .order("sold_on", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw new Error(`sales_load_failed:${error.code}`);
  const rows = (data ?? []) as SalesSummary["records"];
  return {
    quantity: rows.reduce((s, r) => s + r.quantity, 0),
    amount_cents: rows.reduce((s, r) => s + (r.amount_cents ?? 0), 0),
    records: rows.slice(0, 20),
  };
}
