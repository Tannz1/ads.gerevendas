import "server-only";
import { randomUUID } from "node:crypto";
import { activateWithCompensation } from "./execution";
import { getAppContext } from "../context";
import type { Objective } from "@/contracts/onboarding";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { renderCreativePng } from "../creative-png";
import { loadCreative, VIDEOS_BUCKET } from "../creatives-data";
import { insightsFromMeta, reviewFromAds } from "./campaign-payload";
import type { MetaBusinessClient } from "./client";
import { runPublication, type PublicationInput } from "./publish";
import { isAdAccountUsable } from "./steps";

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
  const ctx = await getAppContext();
  if (ctx.mode !== "supabase" || !ctx.organization) return null;
  const supabase = await createSupabaseServerClient();
  const [{ data: camp, error: campaignError }, { data: links, error: linksError }] = await Promise.all([
    supabase
      .from("campaigns")
      .select(
        "id, organization_id, status, simulated, daily_budget_cents, duration_days, external_campaign_id, external_adset_id",
      )
      .eq("id", campaignId)
      .eq("organization_id", ctx.organization.id)
      .maybeSingle(),
    supabase
      .from("campaign_creatives")
      .select("external_ad_id")
      .eq("campaign_id", campaignId)
      .eq("organization_id", ctx.organization.id),
  ]);
  if (campaignError || linksError) throw new Error("campaign_load_failed");
  if (!camp) return null;
  return {
    ...(camp as Omit<RealCampaign, "ad_ids">),
    ad_ids: ((links ?? []) as Array<{ external_ad_id: string | null }>)
      .map((l) => l.external_ad_id)
      .filter((id): id is string => Boolean(id)),
  };
}

async function loadPublicationInput(campaignId: string): Promise<PublicationInput | null> {
  const ctx = await getAppContext();
  if (ctx.mode !== "supabase" || !ctx.organization) return null;
  const supabase = await createSupabaseServerClient();
  const { data: camp } = await supabase
    .from("campaigns")
    .select(
      "id, organization_id, strategy_id, name, objective, daily_budget_cents, duration_days, external_campaign_id, external_adset_id",
    )
    .eq("id", campaignId)
    .eq("organization_id", ctx.organization.id)
    .maybeSingle();
  if (!camp) return null;
  const c = camp as {
    id: string;
    organization_id: string;
    strategy_id: string;
    name: string;
    objective: Objective;
    daily_budget_cents: number;
    duration_days: number;
    external_campaign_id: string | null;
    external_adset_id: string | null;
  };

  const [
    { data: links, error: linksError },
    { data: conn, error: connectionError },
    { data: strategy, error: strategyError },
  ] = await Promise.all([
    supabase
      .from("campaign_creatives")
      .select(
        "creative_id, image_hash, external_video_id, external_creative_id, external_ad_id, creatives(angle_key, content)",
      )
      .eq("campaign_id", campaignId)
      .eq("organization_id", c.organization_id),
    supabase
      .from("meta_connections")
      .select("ad_account_id, page_id, instagram_actor_id")
      .eq("organization_id", c.organization_id)
      .maybeSingle(),
    supabase
      .from("strategies")
      .select(
        "briefs(age_min, age_max, service_radius_km, businesses(city, state, whatsapp_e164, website_url, instagram_handle))",
      )
      .eq("organization_id", c.organization_id)
      .eq("id", c.strategy_id)
      .maybeSingle(),
  ]);
  if (linksError || connectionError || strategyError) throw new Error("publication_input_load_failed");
  const brief = (
    strategy as unknown as {
      briefs: (PublicationInput["audience"] & { businesses: PublicationInput["business"] }) | null;
    } | null
  )?.briefs;
  const biz = brief?.businesses;
  const connection = conn as PublicationInput["connection"] | null;
  if (!connection?.ad_account_id || !connection.page_id || !biz || !brief) return null;

  const linkedCreatives = (
    (links ?? []) as unknown as Array<{
      creative_id: string;
      image_hash: string | null;
      external_video_id: string | null;
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
    external_video_id: l.external_video_id,
    external_creative_id: l.external_creative_id,
    external_ad_id: l.external_ad_id,
  }));

  const creatives = await Promise.all(
    linkedCreatives.map(async (creative) => {
      const view = await loadCreative(creative.creative_id);
      if (!view) throw new Error("creative_not_found");
      return {
        ...creative,
        headline: view.content.headline,
        body: view.content.body,
        video_path: view.video?.path ?? null,
        render_view: { ...view, image_url: null },
      };
    }),
  );

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

  const frozen = await admin.rpc("meta_freeze_publication", { p_campaign: campaignId, p_input: input });
  if (frozen.error) throw new Error(`rpc_failed:${frozen.error.code}`);
  // IDs podem avançar entre tentativas; o conteúdo permanece o original aprovado.
  const stable = frozen.data as PublicationInput;
  const publicationInput = {
    ...stable,
    campaign: {
      ...stable.campaign,
      external_campaign_id: input.campaign.external_campaign_id,
      external_adset_id: input.campaign.external_adset_id,
    },
    creatives: stable.creatives.map((creative) => {
      const current = input.creatives.find((row) => row.creative_id === creative.creative_id);
      return {
        ...creative,
        image_hash: current?.image_hash ?? null,
        external_video_id: current?.external_video_id ?? null,
        external_creative_id: current?.external_creative_id ?? null,
        external_ad_id: current?.external_ad_id ?? null,
      };
    }),
  };
  const result = await runPublication(publicationInput, {
    client,
    beginStep: (key) => rpcOrThrow(admin.rpc("meta_begin_publication_step", { p_campaign: campaignId, p_step: key })),
    record: (payload) =>
      rpcOrThrow(admin.rpc("meta_record_publication", { p_campaign: campaignId, p_payload: payload })),
    renderPng: async (creativeId) => {
      const view = stable.creatives.find((creative) => creative.creative_id === creativeId)?.render_view;
      if (!view) throw new Error("creative_not_found");
      return Buffer.from(await (await renderCreativePng(view, "feed")).arrayBuffer());
    },
    videoUrl: async (path) => {
      const { data, error } = await admin.storage.from(VIDEOS_BUCKET).createSignedUrl(path, 3600);
      if (error || !data) throw new Error("video_url_failed");
      return data.signedUrl;
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
  if (!campaign.external_campaign_id || !campaign.external_adset_id || campaign.ad_ids.length === 0) {
    return { error: { message: "publication_incomplete" } };
  }
  const admin = createSupabaseAdminClient();
  const authorization = await admin.rpc("meta_check_activation", {
    p_campaign: campaign.id,
    p_actor: actorId,
    p_budget: input.confirmed_daily_budget_cents,
    p_days: input.confirmed_duration_days,
    p_key: input.idempotency_key,
  });
  if (authorization.error) return { error: authorization.error };
  const funding = await client.getFunding(authorization.data as string);
  if (!isAdAccountUsable(funding.account_status) || !funding.has_funding_source) {
    return { error: { message: "meta_not_connected" } };
  }
  return activateWithCompensation(
    client,
    {
      campaignId: campaign.external_campaign_id,
      adsetId: campaign.external_adset_id,
      adIds: campaign.ad_ids,
    },
    async () => {
      const { error } = await createSupabaseAdminClient().rpc("meta_activate_campaign", {
        p_campaign: campaign.id,
        p_actor: actorId,
        p_confirmed_daily_budget_cents: input.confirmed_daily_budget_cents,
        p_confirmed_duration_days: input.confirmed_duration_days,
        p_idempotency_key: input.idempotency_key,
        p_correlation_id: correlationId,
      });
      if (error) throw new Error(`activation_commit_failed:${error.code}`);
      return { error: null };
    },
    () =>
      rpcOrThrow(
        admin.rpc("meta_pause_campaign", {
          p_campaign: campaign.id,
          p_actor: actorId,
          p_correlation_id: correlationId,
        }),
      ),
  );
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

/** Interrupção exige reconciliação pelo operador antes de liberar a trava. */
export async function withCampaignExecution<T>(campaignId: string, run: () => Promise<T>): Promise<T> {
  const db = createSupabaseAdminClient();
  const token = randomUUID();
  const { data, error } = await db.rpc("meta_claim_execution", { p_campaign: campaignId, p_token: token });
  if (error) throw new Error(`rpc_failed:${error.code}`);
  if (!data) throw new Error("campaign_execution_busy");
  let release = true;
  try {
    return await run();
  } catch (e) {
    // Se nem a pausa foi confirmada, mantém a trava até recuperação pelo operador.
    if (e instanceof Error && e.message === "activation_recovery_required") release = false;
    throw e;
  } finally {
    if (release) await rpcOrThrow(db.rpc("meta_release_execution", { p_campaign: campaignId, p_token: token }));
  }
}
