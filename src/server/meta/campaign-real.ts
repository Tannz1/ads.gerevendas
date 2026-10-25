import "server-only";
import type { Objective } from "@/contracts/onboarding";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { renderCreativePng } from "../creative-png";
import { loadCreative } from "../creatives-data";
import { insightsFromMeta, reviewFromAds } from "./campaign-payload";
import type { MetaBusinessClient } from "./client";
import { runPublication, type PublicationInput } from "./publish";

/** Campanha real como o servidor precisa para falar com a Meta (lida com a sessão do usuário + RLS). */
export type RealCampaign = {
  id: string;
  organization_id: string;
  status: "draft" | "paused" | "active" | "ended";
  simulated: boolean;
  daily_budget_cents: number;
  duration_days: number;
  external_campaign_id: string | null;
  external_adset_id: string | null;
  ad_ids: string[];
};

export async function loadRealCampaign(campaignId: string): Promise<RealCampaign | null> {
  const supabase = await createSupabaseServerClient();
  const [{ data: camp }, { data: links }] = await Promise.all([
    supabase
      .from("campaigns")
      .select(
        "id, organization_id, status, simulated, daily_budget_cents, duration_days, external_campaign_id, external_adset_id",
      )
      .eq("id", campaignId)
      .maybeSingle(),
    supabase.from("campaign_creatives").select("external_ad_id").eq("campaign_id", campaignId),
  ]);
  if (!camp) return null;
  return {
    ...(camp as Omit<RealCampaign, "ad_ids">),
    ad_ids: ((links ?? []) as Array<{ external_ad_id: string | null }>)
      .map((l) => l.external_ad_id)
      .filter((id): id is string => Boolean(id)),
  };
}

async function loadPublicationInput(campaignId: string): Promise<PublicationInput | null> {
  const supabase = await createSupabaseServerClient();
  const { data: camp } = await supabase
    .from("campaigns")
    .select(
      "id, organization_id, name, objective, daily_budget_cents, duration_days, external_campaign_id, external_adset_id",
    )
    .eq("id", campaignId)
    .maybeSingle();
  if (!camp) return null;
  const c = camp as {
    id: string;
    organization_id: string;
    name: string;
    objective: Objective;
    daily_budget_cents: number;
    duration_days: number;
    external_campaign_id: string | null;
    external_adset_id: string | null;
  };

  const [{ data: links }, { data: conn }, { data: biz }, { data: brief }] = await Promise.all([
    supabase
      .from("campaign_creatives")
      .select("creative_id, image_hash, external_creative_id, external_ad_id, creatives(angle_key, content)")
      .eq("campaign_id", campaignId),
    supabase
      .from("meta_connections")
      .select("ad_account_id, page_id, instagram_actor_id")
      .eq("organization_id", c.organization_id)
      .maybeSingle(),
    supabase
      .from("businesses")
      .select("city, state, whatsapp_e164, website_url, instagram_handle")
      .eq("organization_id", c.organization_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("briefs")
      .select("age_min, age_max, service_radius_km")
      .eq("organization_id", c.organization_id)
      .eq("status", "submitted")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  const connection = conn as PublicationInput["connection"] | null;
  if (!connection?.ad_account_id || !connection.page_id || !biz || !brief) return null;

  const creatives = (
    (links ?? []) as unknown as Array<{
      creative_id: string;
      image_hash: string | null;
      external_creative_id: string | null;
      external_ad_id: string | null;
      creatives: { angle_key: string; content: { headline?: string; body?: string } } | null;
    }>
  ).map((l) => ({
    creative_id: l.creative_id,
    angle_key: l.creatives?.angle_key ?? "oferta",
    headline: l.creatives?.content?.headline ?? "",
    body: l.creatives?.content?.body ?? "",
    image_hash: l.image_hash,
    external_creative_id: l.external_creative_id,
    external_ad_id: l.external_ad_id,
  }));

  return {
    campaign: {
      id: c.id,
      name: c.name,
      objective: c.objective,
      daily_budget_cents: c.daily_budget_cents,
      duration_days: c.duration_days,
      external_campaign_id: c.external_campaign_id,
      external_adset_id: c.external_adset_id,
    },
    creatives,
    connection,
    business: biz as PublicationInput["business"],
    audience: brief as PublicationInput["audience"],
  };
}

async function rpcOrThrow(promise: PromiseLike<{ error: { message: string; code?: string } | null }>) {
  const { error } = await promise;
  if (error) throw new Error(`rpc_failed:${error.code ?? "unknown"}:${error.message}`);
}

/** Cria (ou retoma) na Meta tudo que falta e conclui a publicação como PAUSADA. */
export async function publishRealCampaign(
  campaignId: string,
  client: MetaBusinessClient,
  correlationId: string,
): Promise<{ viaWhatsappLink: boolean }> {
  const input = await loadPublicationInput(campaignId);
  if (!input) throw new Error("publication_input_missing");
  const admin = createSupabaseAdminClient();

  const result = await runPublication(input, {
    client,
    record: (payload) =>
      rpcOrThrow(admin.rpc("meta_record_publication", { p_campaign: campaignId, p_payload: payload })),
    renderPng: async (creativeId) => {
      const view = await loadCreative(creativeId);
      if (!view) throw new Error("creative_not_found");
      return Buffer.from(await (await renderCreativePng(view, "feed")).arrayBuffer());
    },
    now: () => new Date(),
  });

  await rpcOrThrow(admin.rpc("meta_finish_publication", { p_campaign: campaignId, p_correlation_id: correlationId }));
  return result;
}

/** Ativa na Meta (anúncios, conjunto e campanha) e grava; se o banco falhar, volta a pausar na Meta. */
export async function activateRealCampaign(
  campaign: RealCampaign,
  actorId: string,
  input: { confirmed_daily_budget_cents: number; confirmed_duration_days: number; idempotency_key: string },
  client: MetaBusinessClient,
  correlationId: string,
): Promise<{ error: { message: string; code?: string } | null }> {
  if (!campaign.external_campaign_id || !campaign.external_adset_id) {
    return { error: { message: "publication_incomplete" } };
  }
  for (const adId of campaign.ad_ids) await client.setStatus(adId, "ACTIVE");
  await client.setStatus(campaign.external_adset_id, "ACTIVE");
  await client.setStatus(campaign.external_campaign_id, "ACTIVE");

  const { error } = await createSupabaseAdminClient().rpc("meta_activate_campaign", {
    p_campaign: campaign.id,
    p_actor: actorId,
    p_confirmed_daily_budget_cents: input.confirmed_daily_budget_cents,
    p_confirmed_duration_days: input.confirmed_duration_days,
    p_idempotency_key: input.idempotency_key,
    p_correlation_id: correlationId,
  });
  if (error) await client.setStatus(campaign.external_campaign_id, "PAUSED");
  return { error };
}

/** Pausa a campanha na Meta (para a veiculação inteira) e grava. */
export async function pauseRealCampaign(
  campaign: RealCampaign,
  actorId: string,
  client: MetaBusinessClient,
  correlationId: string,
): Promise<{ error: { message: string; code?: string } | null }> {
  if (campaign.external_campaign_id) await client.setStatus(campaign.external_campaign_id, "PAUSED");
  const { error } = await createSupabaseAdminClient().rpc("meta_pause_campaign", {
    p_campaign: campaign.id,
    p_actor: actorId,
    p_correlation_id: correlationId,
  });
  return { error };
}

/** Lê na Meta o status de revisão dos anúncios e as métricas da campanha (no máximo 1 vez por minuto). */
export async function syncRealCampaign(campaign: RealCampaign, client: MetaBusinessClient): Promise<boolean> {
  if (!campaign.external_campaign_id) return false;
  const admin = createSupabaseAdminClient();
  const touch = await admin.rpc("meta_touch_campaign_sync", { p_campaign: campaign.id, p_min_interval_seconds: 60 });
  if (touch.error) throw new Error(`rpc_failed:${touch.error.code}`);
  if (touch.data !== true) return false;

  const [statuses, insights] = await Promise.all([
    client.getAdsEffectiveStatus(campaign.ad_ids),
    client.getCampaignInsights(campaign.external_campaign_id),
  ]);
  await rpcOrThrow(
    admin.rpc("meta_set_campaign_review", { p_campaign: campaign.id, p_status: reviewFromAds(statuses) }),
  );
  const m = insightsFromMeta(insights);
  await rpcOrThrow(
    admin.rpc("meta_record_insights", {
      p_campaign: campaign.id,
      p_spend_cents: m.spend_cents,
      p_impressions: m.impressions,
      p_reach: m.reach,
      p_clicks: m.clicks,
      p_conversations: m.conversations,
    }),
  );
  return true;
}
