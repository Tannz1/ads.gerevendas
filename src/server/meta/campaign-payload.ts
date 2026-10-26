import type { MetaReviewStatus } from "@/contracts/campaigns";
import type { Objective } from "@/contracts/onboarding";

/**
 * Parâmetros enviados à Marketing API v25.0 (ADR 0006). Tudo que depende do formato da Meta fica aqui
 * e é provado pelo teste de contrato `META_CONTRACT_PUBLISH=1` antes de ligar a publicação real.
 */

export type BusinessDestinationInfo = {
  whatsapp_e164: string | null;
  website_url: string | null;
  instagram_handle: string | null;
};

export type CallToAction = "LEARN_MORE" | "CONTACT_US";

export type Destination =
  | { ok: true; link: string; cta: CallToAction; viaWhatsappLink: boolean }
  | { ok: false; code: "missing_website" | "missing_whatsapp" | "missing_instagram" | "missing_destination" };

const whatsappLink = (e164: string) => `https://wa.me/${e164.replace(/\D/g, "")}`;
const instagramLink = (handle: string) => `https://www.instagram.com/${handle}/`;

/**
 * Para onde o anúncio leva. "Conversas no WhatsApp" da Meta exige homologação: até lá, o anúncio leva
 * ao link do WhatsApp (objetivo tráfego), e a tela de publicação avisa isso.
 */
export function resolveDestination(objective: Objective, b: BusinessDestinationInfo): Destination {
  switch (objective) {
    case "trafego_site":
      return b.website_url
        ? { ok: true, link: b.website_url, cta: "LEARN_MORE", viaWhatsappLink: false }
        : { ok: false, code: "missing_website" };
    case "mensagens_whatsapp":
      return b.whatsapp_e164
        ? { ok: true, link: whatsappLink(b.whatsapp_e164), cta: "CONTACT_US", viaWhatsappLink: true }
        : { ok: false, code: "missing_whatsapp" };
    case "visitas_perfil":
      return b.instagram_handle
        ? { ok: true, link: instagramLink(b.instagram_handle), cta: "LEARN_MORE", viaWhatsappLink: false }
        : { ok: false, code: "missing_instagram" };
    case "reconhecimento_local":
      if (b.website_url) return { ok: true, link: b.website_url, cta: "LEARN_MORE", viaWhatsappLink: false };
      if (b.whatsapp_e164) {
        return { ok: true, link: whatsappLink(b.whatsapp_e164), cta: "CONTACT_US", viaWhatsappLink: true };
      }
      if (b.instagram_handle) {
        return { ok: true, link: instagramLink(b.instagram_handle), cta: "LEARN_MORE", viaWhatsappLink: false };
      }
      return { ok: false, code: "missing_destination" };
  }
}

const META_OBJECTIVE: Record<Objective, "OUTCOME_TRAFFIC" | "OUTCOME_AWARENESS"> = {
  trafego_site: "OUTCOME_TRAFFIC",
  mensagens_whatsapp: "OUTCOME_TRAFFIC",
  visitas_perfil: "OUTCOME_TRAFFIC",
  reconhecimento_local: "OUTCOME_AWARENESS",
};

export function campaignParams(objective: Objective, name: string): Record<string, string> {
  return {
    name,
    objective: META_OBJECTIVE[objective],
    status: "PAUSED",
    // Crédito, emprego, moradia, política e temas sociais são bloqueados no app (o dono confirma).
    special_ad_categories: "[]",
    buying_type: "AUCTION",
  };
}

const DAY_MS = 24 * 60 * 60 * 1000;
const MIN_RADIUS_KM = 10;
const MAX_RADIUS_KM = 80;
const DEFAULT_RADIUS_KM = 15;

export function adSetParams(input: {
  name: string;
  campaignId: string;
  objective: Objective;
  dailyBudgetCents: number;
  durationDays: number;
  now: Date;
  ageMin: number;
  ageMax: number;
  cityKey: string;
  radiusKm: number | null;
}): Record<string, string> {
  const radius = Math.min(MAX_RADIUS_KM, Math.max(MIN_RADIUS_KM, input.radiusKm ?? DEFAULT_RADIUS_KM));
  return {
    name: input.name,
    campaign_id: input.campaignId,
    daily_budget: String(input.dailyBudgetCents),
    billing_event: "IMPRESSIONS",
    optimization_goal: META_OBJECTIVE[input.objective] === "OUTCOME_AWARENESS" ? "REACH" : "LINK_CLICKS",
    bid_strategy: "LOWEST_COST_WITHOUT_CAP",
    start_time: input.now.toISOString(),
    end_time: new Date(input.now.getTime() + input.durationDays * DAY_MS).toISOString(),
    targeting: JSON.stringify({
      geo_locations: { cities: [{ key: input.cityKey, radius, distance_unit: "kilometer" }] },
      age_min: input.ageMin,
      age_max: input.ageMax,
    }),
    status: "PAUSED",
  };
}

export function creativeParams(input: {
  name: string;
  pageId: string;
  instagramId: string | null;
  imageHash: string;
  headline: string;
  body: string;
  destination: { link: string; cta: CallToAction };
}): Record<string, string> {
  return {
    name: input.name,
    object_story_spec: JSON.stringify({
      page_id: input.pageId,
      ...(input.instagramId ? { instagram_user_id: input.instagramId } : {}),
      link_data: {
        image_hash: input.imageHash,
        link: input.destination.link,
        message: input.body,
        name: input.headline,
        call_to_action: { type: input.destination.cta, value: { link: input.destination.link } },
      },
    }),
  };
}

export function adParams(input: { name: string; adsetId: string; creativeId: string }): Record<string, string> {
  return {
    name: input.name,
    adset_id: input.adsetId,
    creative: JSON.stringify({ creative_id: input.creativeId }),
    status: "PAUSED",
  };
}

const UF_NAMES: Record<string, string> = {
  AC: "acre",
  AL: "alagoas",
  AP: "amapa",
  AM: "amazonas",
  BA: "bahia",
  CE: "ceara",
  DF: "distrito federal",
  ES: "espirito santo",
  GO: "goias",
  MA: "maranhao",
  MT: "mato grosso",
  MS: "mato grosso do sul",
  MG: "minas gerais",
  PA: "para",
  PB: "paraiba",
  PR: "parana",
  PE: "pernambuco",
  PI: "piaui",
  RJ: "rio de janeiro",
  RN: "rio grande do norte",
  RS: "rio grande do sul",
  RO: "rondonia",
  RR: "roraima",
  SC: "santa catarina",
  SP: "sao paulo",
  SE: "sergipe",
  TO: "tocantins",
};

const normalize = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\(state\)/g, "")
    .trim();

/** Escolhe, entre os resultados da busca de cidades da Meta, a cidade com o mesmo nome no mesmo estado. */
export function pickCity(
  results: Array<{ key: string; name: string; region?: string | null }>,
  city: string,
  uf: string,
): { key: string; name: string } | null {
  const wantedCity = normalize(city);
  const wantedState = UF_NAMES[uf.toUpperCase()];
  const found = results.find(
    (r) => normalize(r.name) === wantedCity && wantedState !== undefined && normalize(r.region ?? "") === wantedState,
  );
  return found ? { key: found.key, name: found.name } : null;
}

const REJECTED = new Set(["DISAPPROVED"]);
const PENDING = new Set(["PENDING_REVIEW", "IN_PROCESS", "PREAPPROVED"]);

/** Status de revisão da campanha a partir do `effective_status` de cada anúncio. */
export function reviewFromAds(statuses: string[]): MetaReviewStatus {
  if (statuses.length === 0) return "pending_review";
  if (statuses.some((s) => REJECTED.has(s))) return "rejected";
  if (statuses.some((s) => PENDING.has(s))) return "pending_review";
  return statuses.every((status) => status === "ACTIVE") ? "approved" : "pending_review";
}

type InsightsRow = {
  spend?: string;
  impressions?: string;
  reach?: string;
  clicks?: string;
  actions?: Array<{ action_type: string; value: string }>;
};

const CONVERSATION_ACTION = "onsite_conversion.messaging_conversation_started_7d";
const toInt = (v: string | undefined) => (v ? Math.max(0, Math.round(Number(v))) || 0 : 0);

export function insightsFromMeta(row: InsightsRow | null) {
  return {
    spend_cents: row?.spend ? Math.max(0, Math.round(Number(row.spend) * 100)) || 0 : 0,
    impressions: toInt(row?.impressions),
    reach: toInt(row?.reach),
    clicks: toInt(row?.clicks),
    conversations: toInt(row?.actions?.find((a) => a.action_type === CONVERSATION_ACTION)?.value),
  };
}
