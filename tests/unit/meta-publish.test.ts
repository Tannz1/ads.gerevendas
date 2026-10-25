import { describe, expect, it } from "vitest";
import { MockMetaBusinessClient } from "@/server/meta/mock-client";
import { PublishError, runPublication, type PublicationInput } from "@/server/meta/publish";

class CountingClient extends MockMetaBusinessClient {
  calls: string[] = [];
  cities = [{ key: "2", name: "Campinas", region: "São Paulo (state)" }];
  async searchCities() {
    this.calls.push("searchCities");
    return this.cities;
  }
  async uploadImage(a: string, png: Buffer) {
    this.calls.push("uploadImage");
    return super.uploadImage(a, png);
  }
  async createCampaign() {
    this.calls.push("createCampaign");
    return "c1";
  }
  async createAdSet(_a?: string, params: Record<string, string> = {}) {
    this.calls.push(`createAdSet:${JSON.parse(params.targeting).geo_locations.cities[0].key}`);
    return "s1";
  }
  async createAdCreative() {
    this.calls.push("createAdCreative");
    return `cr${this.calls.length}`;
  }
  async createAd() {
    this.calls.push("createAd");
    return `ad${this.calls.length}`;
  }
}

const base: PublicationInput = {
  campaign: {
    id: "camp",
    name: "Campanha Café",
    objective: "trafego_site",
    daily_budget_cents: 2500,
    duration_days: 7,
    external_campaign_id: null,
    external_adset_id: null,
  },
  creatives: [
    {
      creative_id: "k1",
      angle_key: "oferta",
      headline: "Café",
      body: "Pão na chapa",
      image_hash: null,
      external_creative_id: null,
      external_ad_id: null,
    },
    {
      creative_id: "k2",
      angle_key: "beneficio",
      headline: "Rápido",
      body: "Pronto em 5 min",
      image_hash: null,
      external_creative_id: null,
      external_ad_id: null,
    },
  ],
  connection: { ad_account_id: "act_9", page_id: "p1", instagram_actor_id: "ig1" },
  business: {
    city: "Campinas",
    state: "SP",
    whatsapp_e164: "+5519999990000",
    website_url: "https://padaria.com.br",
    instagram_handle: null,
  },
  audience: { age_min: 25, age_max: 55, service_radius_km: 5 },
};

function deps(client: CountingClient) {
  const records: unknown[] = [];
  return {
    records,
    deps: {
      client,
      record: async (payload: unknown) => {
        records.push(payload);
      },
      renderPng: async (id: string) => Buffer.from(`png-${id}`),
      now: () => new Date("2026-10-26T12:00:00Z"),
    },
  };
}

describe("runPublication", () => {
  it("cria tudo pausado e grava cada ID assim que a Meta devolve", async () => {
    const client = new CountingClient();
    const { records, deps: d } = deps(client);
    await runPublication(base, d);
    expect(client.calls.filter((c) => c === "createCampaign")).toHaveLength(1);
    expect(client.calls).toContain("createAdSet:2");
    expect(client.calls.filter((c) => c === "uploadImage")).toHaveLength(2);
    expect(client.calls.filter((c) => c === "createAd")).toHaveLength(2);
    expect(records[0]).toEqual({ external_campaign_id: "c1" });
    expect(records[1]).toEqual({ external_adset_id: "s1" });
    expect(records.length).toBe(2 + 2 * 3);
  });

  it("retoma sem recriar o que já existe", async () => {
    const client = new CountingClient();
    const { deps: d } = deps(client);
    await runPublication(
      {
        ...base,
        campaign: { ...base.campaign, external_campaign_id: "c1", external_adset_id: "s1" },
        creatives: [
          { ...base.creatives[0], image_hash: "h", external_creative_id: "cr", external_ad_id: "ad" },
          { ...base.creatives[1], image_hash: "h2" },
        ],
      },
      d,
    );
    expect(client.calls).toEqual(["createAdCreative", "createAd"]);
  });

  it("não publica sem destino ou sem a cidade certa", async () => {
    const client = new CountingClient();
    await expect(
      runPublication({ ...base, business: { ...base.business, website_url: null } }, deps(client).deps),
    ).rejects.toMatchObject({ code: "missing_website" });
    expect(client.calls).toEqual([]);

    client.cities = [{ key: "1", name: "Campinas", region: "Goiás" }];
    await expect(runPublication(base, deps(client).deps)).rejects.toBeInstanceOf(PublishError);
    await expect(runPublication(base, deps(client).deps)).rejects.toMatchObject({ code: "city_not_found" });
  });

  it("avisa quando o WhatsApp vai por link", async () => {
    const client = new CountingClient();
    const result = await runPublication(
      { ...base, campaign: { ...base.campaign, objective: "mensagens_whatsapp" } },
      deps(client).deps,
    );
    expect(result.viaWhatsappLink).toBe(true);
  });
});
