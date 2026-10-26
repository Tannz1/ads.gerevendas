import { describe, expect, it } from "vitest";
import {
  adParams,
  adSetParams,
  campaignParams,
  creativeParams,
  insightsFromMeta,
  pickCity,
  resolveDestination,
  reviewFromAds,
} from "@/server/meta/campaign-payload";

const business = {
  name: "Padaria do João",
  city: "Campinas",
  state: "SP",
  whatsapp_e164: "+5519999990000",
  website_url: "https://padariadojoao.com.br",
  instagram_handle: "padariadojoao",
};

describe("resolveDestination", () => {
  it("leva cada objetivo ao destino certo", () => {
    expect(resolveDestination("trafego_site", business)).toEqual({
      ok: true,
      link: "https://padariadojoao.com.br",
      cta: "LEARN_MORE",
      viaWhatsappLink: false,
    });
    expect(resolveDestination("mensagens_whatsapp", business)).toEqual({
      ok: true,
      link: "https://wa.me/5519999990000",
      cta: "CONTACT_US",
      viaWhatsappLink: true,
    });
    expect(resolveDestination("visitas_perfil", business)).toMatchObject({
      ok: true,
      link: "https://www.instagram.com/padariadojoao/",
    });
    expect(resolveDestination("reconhecimento_local", business)).toMatchObject({
      ok: true,
      link: "https://padariadojoao.com.br",
    });
  });

  it("não inventa destino quando falta o dado", () => {
    expect(resolveDestination("trafego_site", { ...business, website_url: null })).toEqual({
      ok: false,
      code: "missing_website",
    });
    expect(resolveDestination("mensagens_whatsapp", { ...business, whatsapp_e164: null })).toEqual({
      ok: false,
      code: "missing_whatsapp",
    });
    expect(resolveDestination("visitas_perfil", { ...business, instagram_handle: null })).toEqual({
      ok: false,
      code: "missing_instagram",
    });
    expect(
      resolveDestination("reconhecimento_local", {
        ...business,
        website_url: null,
        whatsapp_e164: null,
        instagram_handle: null,
      }),
    ).toEqual({ ok: false, code: "missing_destination" });
  });
});

describe("parâmetros dos objetos da Meta", () => {
  it("campanha nasce pausada, sem categoria especial", () => {
    expect(campaignParams("trafego_site", "Campanha")).toEqual({
      name: "Campanha",
      objective: "OUTCOME_TRAFFIC",
      status: "PAUSED",
      special_ad_categories: "[]",
      buying_type: "AUCTION",
    });
    expect(campaignParams("reconhecimento_local", "C").objective).toBe("OUTCOME_AWARENESS");
  });

  it("conjunto com orçamento em centavos, período, idade e cidade com raio limitado", () => {
    const now = new Date("2026-10-26T12:00:00.000Z");
    const p = adSetParams({
      name: "Conjunto",
      campaignId: "120001",
      objective: "trafego_site",
      dailyBudgetCents: 2500,
      durationDays: 7,
      now,
      ageMin: 25,
      ageMax: 55,
      cityKey: "269969",
      radiusKm: 200,
    });
    expect(p).toMatchObject({
      campaign_id: "120001",
      daily_budget: "2500",
      billing_event: "IMPRESSIONS",
      optimization_goal: "LINK_CLICKS",
      bid_strategy: "LOWEST_COST_WITHOUT_CAP",
      status: "PAUSED",
      start_time: "2026-10-26T12:00:00.000Z",
      end_time: "2026-11-02T12:00:00.000Z",
    });
    expect(JSON.parse(p.targeting)).toEqual({
      geo_locations: { cities: [{ key: "269969", radius: 80, distance_unit: "kilometer" }] },
      age_min: 25,
      age_max: 55,
    });
    const awareness = adSetParams({
      name: "C",
      campaignId: "1",
      objective: "reconhecimento_local",
      dailyBudgetCents: 1000,
      durationDays: 1,
      now,
      ageMin: 18,
      ageMax: 65,
      cityKey: "1",
      radiusKm: null,
    });
    expect(awareness.optimization_goal).toBe("REACH");
    expect(JSON.parse(awareness.targeting).geo_locations.cities[0].radius).toBe(15);
  });

  it("criativo com imagem, textos, botão e Instagram quando existir", () => {
    const destination = { link: "https://wa.me/5519999990000", cta: "CONTACT_US" as const };
    const withIg = JSON.parse(
      creativeParams({
        name: "Peça",
        pageId: "p1",
        instagramId: "ig1",
        imageHash: "h1",
        headline: "Café completo",
        body: "Pão na chapa e café.",
        destination,
      }).object_story_spec,
    );
    expect(withIg).toEqual({
      page_id: "p1",
      instagram_user_id: "ig1",
      link_data: {
        image_hash: "h1",
        link: "https://wa.me/5519999990000",
        message: "Pão na chapa e café.",
        name: "Café completo",
        call_to_action: { type: "CONTACT_US", value: { link: "https://wa.me/5519999990000" } },
      },
    });
    const noIg = JSON.parse(
      creativeParams({
        name: "Peça",
        pageId: "p1",
        instagramId: null,
        imageHash: "h1",
        headline: "T",
        body: "B",
        destination,
      }).object_story_spec,
    );
    expect(noIg.instagram_user_id).toBeUndefined();
  });

  it("anúncio pausado ligado ao conjunto e ao criativo", () => {
    expect(adParams({ name: "Anúncio", adsetId: "a1", creativeId: "c1" })).toEqual({
      name: "Anúncio",
      adset_id: "a1",
      creative: JSON.stringify({ creative_id: "c1" }),
      status: "PAUSED",
    });
  });
});

describe("pickCity", () => {
  const results = [
    { key: "1", name: "Campinas", region: "Goiás" },
    { key: "2", name: "Campinas", region: "São Paulo (state)" },
    { key: "3", name: "Campinas do Sul", region: "Rio Grande do Sul" },
  ];

  it("escolhe a cidade do estado certo", () => {
    expect(pickCity(results, "Campinas", "SP")?.key).toBe("2");
    expect(pickCity(results, "campinas", "GO")?.key).toBe("1");
  });

  it("não escolhe cidade de outro estado", () => {
    expect(pickCity(results, "Campinas", "MG")).toBeNull();
    expect(pickCity([], "Campinas", "SP")).toBeNull();
  });
});

describe("retorno da Meta", () => {
  it("status de revisão a partir dos anúncios", () => {
    expect(reviewFromAds(["PAUSED", "ACTIVE"])).toBe("pending_review");
    expect(reviewFromAds(["UNKNOWN"])).toBe("pending_review");
    expect(reviewFromAds(["WITH_ISSUES"])).toBe("pending_review");
    expect(reviewFromAds(["ACTIVE", "ACTIVE"])).toBe("approved");
    expect(reviewFromAds(["PAUSED", "PENDING_REVIEW"])).toBe("pending_review");
    expect(reviewFromAds(["IN_PROCESS"])).toBe("pending_review");
    expect(reviewFromAds(["ACTIVE", "DISAPPROVED"])).toBe("rejected");
    expect(reviewFromAds([])).toBe("pending_review");
  });

  it("métricas em centavos e conversas iniciadas", () => {
    expect(
      insightsFromMeta({
        spend: "12.34",
        impressions: "5000",
        reach: "3000",
        clicks: "120",
        actions: [
          { action_type: "link_click", value: "100" },
          { action_type: "onsite_conversion.messaging_conversation_started_7d", value: "7" },
        ],
      }),
    ).toEqual({ spend_cents: 1234, impressions: 5000, reach: 3000, clicks: 120, conversations: 7 });
    expect(insightsFromMeta(null)).toEqual({ spend_cents: 0, impressions: 0, reach: 0, clicks: 0, conversations: 0 });
  });
});
