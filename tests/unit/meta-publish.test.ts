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
      beginStep: async () => {},
      record: async (payload: unknown) => {
        records.push(payload);
      },
      renderPng: async (id: string) => Buffer.from(`png-${id}`),
      now: () => new Date("2026-10-26T12:00:00Z"),
    },
  };
}

describe("runPublication", () => {
  it("não repete uma escrita cujo ID pode ter se perdido", async () => {
    const client = new CountingClient();
    const started = new Set<string>();
    const d = {
      ...deps(client).deps,
      beginStep: async (key: string) => {
        if (started.has(key)) throw new Error("publication_reconciliation_required");
        started.add(key);
      },
      record: async () => {
        throw new Error("database unavailable after Meta success");
      },
    };
    await expect(runPublication(base, d)).rejects.toThrow("database unavailable");
    await expect(runPublication(base, d)).rejects.toThrow("publication_reconciliation_required");
    expect(client.calls).toEqual(["createCampaign"]);
  });

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

  it("peça com vídeo sobe o vídeo, espera a Meta processar e cria video_data com a arte de capa", async () => {
    const statuses: Array<"processing" | "ready"> = ["processing", "ready"];
    const params: Record<string, string>[] = [];
    class VideoClient extends CountingClient {
      async uploadVideo(_a: string, url: string) {
        this.calls.push(`uploadVideo:${url}`);
        return "v1";
      }
      async getVideoStatus() {
        this.calls.push("getVideoStatus");
        return statuses.shift() ?? "ready";
      }
      async createAdCreative(_a?: string, p: Record<string, string> = {}) {
        params.push(p);
        return super.createAdCreative();
      }
    }
    const client = new VideoClient();
    const { records, deps: d } = deps(client);
    await runPublication(
      { ...base, creatives: [{ ...base.creatives[0], video_path: "org/k1.mp4" }] },
      { ...d, videoUrl: async (path) => `https://storage/${path}`, sleep: async () => {} },
    );
    expect(client.calls).toEqual([
      "createCampaign",
      "searchCities",
      "createAdSet:2",
      "uploadImage",
      "uploadVideo:https://storage/org/k1.mp4",
      "getVideoStatus",
      "getVideoStatus",
      "createAdCreative",
      "createAd",
    ]);
    expect(records).toContainEqual({ creatives: [{ creative_id: "k1", external_video_id: "v1" }] });
    const spec = JSON.parse(params[0].object_story_spec);
    expect(spec.link_data).toBeUndefined();
    expect(spec.video_data).toMatchObject({ video_id: "v1", title: "Café", message: "Pão na chapa" });
    expect(spec.video_data.image_hash).toMatch(/^sim_hash_/);
  });

  it("vídeo que a Meta recusa ou que não fica pronto para a publicação sem criar o criativo", async () => {
    for (const [status, code] of [
      ["error", "video_failed"],
      ["processing", "video_processing"],
    ] as const) {
      class VideoClient extends CountingClient {
        async getVideoStatus() {
          return status;
        }
      }
      const client = new VideoClient();
      const { deps: d } = deps(client);
      await expect(
        runPublication(
          { ...base, creatives: [{ ...base.creatives[0], video_path: "org/k1.mp4", external_video_id: "v1" }] },
          { ...d, videoUrl: async () => "https://x", sleep: async () => {} },
        ),
      ).rejects.toMatchObject({ code });
      expect(client.calls).not.toContain("createAdCreative");
    }
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
