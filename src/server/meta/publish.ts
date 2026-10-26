import type { Objective } from "@/contracts/onboarding";
import {
  adParams,
  adSetParams,
  campaignParams,
  creativeParams,
  pickCity,
  resolveDestination,
} from "./campaign-payload";
import type { MetaBusinessClient } from "./client";
import type { CreativeView } from "../creatives-data";

export type PublicationInput = {
  campaign: {
    id: string;
    name: string;
    objective: Objective;
    daily_budget_cents: number;
    duration_days: number;
    external_campaign_id: string | null;
    external_adset_id: string | null;
  };
  creatives: Array<{
    creative_id: string;
    angle_key: string;
    headline: string;
    body: string;
    image_hash: string | null;
    external_creative_id: string | null;
    external_ad_id: string | null;
    render_view?: CreativeView;
  }>;
  connection: { ad_account_id: string; page_id: string; instagram_actor_id: string | null };
  business: {
    city: string;
    state: string;
    whatsapp_e164: string | null;
    website_url: string | null;
    instagram_handle: string | null;
  };
  audience: { age_min: number; age_max: number; service_radius_km: number | null };
};

/** O que cada etapa grava no banco (`meta_record_publication`). */
export type PublicationRecord =
  | { external_campaign_id: string }
  | { external_adset_id: string }
  | {
      creatives: Array<{
        creative_id: string;
        image_hash?: string;
        external_creative_id?: string;
        external_ad_id?: string;
      }>;
    };

export type PublicationDeps = {
  client: MetaBusinessClient;
  record: (payload: PublicationRecord) => Promise<void>;
  renderPng: (creativeId: string) => Promise<Buffer>;
  now: () => Date;
  /** Persiste a intenção ANTES de uma escrita externa. Intenção sem ID exige reconciliação. */
  beginStep: (key: string) => Promise<void>;
};

export type PublishErrorCode =
  "missing_website" | "missing_whatsapp" | "missing_instagram" | "missing_destination" | "city_not_found";

export class PublishError extends Error {
  constructor(readonly code: PublishErrorCode) {
    super(`publish_error:${code}`);
    this.name = "PublishError";
  }
}

/**
 * Cria na Meta, sempre PAUSED, o que ainda não tem ID e grava cada ID assim que volta. Rodar de novo
 * com o estado do banco retoma do ponto em que parou, sem duplicar objetos na conta do cliente.
 */
export async function runPublication(
  input: PublicationInput,
  deps: PublicationDeps,
): Promise<{ viaWhatsappLink: boolean }> {
  const { campaign, connection } = input;
  const destination = resolveDestination(campaign.objective, input.business);
  if (!destination.ok) throw new PublishError(destination.code);
  const account = connection.ad_account_id;

  let campaignId = campaign.external_campaign_id;
  if (!campaignId) {
    await deps.beginStep("campaign");
    campaignId = await deps.client.createCampaign(account, campaignParams(campaign.objective, campaign.name));
    await deps.record({ external_campaign_id: campaignId });
  }

  let adsetId = campaign.external_adset_id;
  if (!adsetId) {
    const city = pickCity(
      await deps.client.searchCities(input.business.city),
      input.business.city,
      input.business.state,
    );
    if (!city) throw new PublishError("city_not_found");
    await deps.beginStep("adset");
    adsetId = await deps.client.createAdSet(
      account,
      adSetParams({
        name: `${campaign.name} — público`,
        campaignId,
        objective: campaign.objective,
        dailyBudgetCents: campaign.daily_budget_cents,
        durationDays: campaign.duration_days,
        now: deps.now(),
        ageMin: input.audience.age_min,
        ageMax: input.audience.age_max,
        cityKey: city.key,
        radiusKm: input.audience.service_radius_km,
      }),
    );
    await deps.record({ external_adset_id: adsetId });
  }

  for (const creative of input.creatives) {
    const label = `${campaign.name} — ${creative.angle_key}`;
    let imageHash = creative.image_hash;
    if (!imageHash) {
      const png = await deps.renderPng(creative.creative_id);
      await deps.beginStep(`image:${creative.creative_id}`);
      imageHash = await deps.client.uploadImage(account, png);
      await deps.record({ creatives: [{ creative_id: creative.creative_id, image_hash: imageHash }] });
    }
    let creativeId = creative.external_creative_id;
    if (!creativeId) {
      await deps.beginStep(`creative:${creative.creative_id}`);
      creativeId = await deps.client.createAdCreative(
        account,
        creativeParams({
          name: label,
          pageId: connection.page_id,
          instagramId: connection.instagram_actor_id,
          imageHash,
          headline: creative.headline,
          body: creative.body,
          destination,
        }),
      );
      await deps.record({ creatives: [{ creative_id: creative.creative_id, external_creative_id: creativeId }] });
    }
    if (!creative.external_ad_id) {
      await deps.beginStep(`ad:${creative.creative_id}`);
      const adId = await deps.client.createAd(account, adParams({ name: label, adsetId, creativeId }));
      await deps.record({ creatives: [{ creative_id: creative.creative_id, external_ad_id: adId }] });
    }
  }

  return { viaWhatsappLink: destination.viaWhatsappLink };
}
