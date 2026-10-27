import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { RealMetaBusinessClient } from "@/server/meta/real-client";
import { runPublication, type PublicationRecord } from "@/server/meta/publish";

const env = process.env;
const enabled = env.META_CONTRACT_WRITE === "1" && env.META_CONTRACT_PUBLISH === "1";
const required = [
  "META_BUSINESS_ID",
  "META_SYSTEM_USER_TOKEN",
  "META_APP_SECRET",
  "META_CONTRACT_AD_ACCOUNT_ID",
  "META_CONTRACT_PAGE_ID",
  "META_CONTRACT_PNG_PATH",
  "META_CONTRACT_WEBSITE",
  "META_CONTRACT_CITY",
  "META_CONTRACT_STATE",
];

// Execução manual com autorização do operador. Cria objetos reais PAUSADOS; nunca ativa.
describe.skipIf(!enabled)("Contrato de publicação real pausada", () => {
  it("envia imagem, campanha, conjunto, criativo e anúncio e lê revisão e métricas", async () => {
    const missing = required.filter((key) => !env[key]);
    expect(missing, "preencha as variáveis de contrato antes de autorizar a escrita").toEqual([]);
    const client = new RealMetaBusinessClient({
      businessId: env.META_BUSINESS_ID!,
      accessToken: env.META_SYSTEM_USER_TOKEN!,
      appSecret: env.META_APP_SECRET!,
    });
    const records: PublicationRecord[] = [];
    await runPublication(
      {
        campaign: {
          id: "contract",
          name: "GereVendas — contrato pausado",
          objective: "trafego_site",
          daily_budget_cents: 3000,
          duration_days: 1,
          external_campaign_id: null,
          external_adset_id: null,
        },
        connection: {
          ad_account_id: env.META_CONTRACT_AD_ACCOUNT_ID!,
          page_id: env.META_CONTRACT_PAGE_ID!,
          instagram_actor_id: env.META_CONTRACT_INSTAGRAM_ID || null,
        },
        business: {
          city: env.META_CONTRACT_CITY!,
          state: env.META_CONTRACT_STATE!,
          website_url: env.META_CONTRACT_WEBSITE!,
          whatsapp_e164: null,
          instagram_handle: null,
        },
        audience: { age_min: 25, age_max: 60, service_radius_km: 15 },
        creatives: [
          {
            creative_id: "contract",
            angle_key: "oferta",
            headline: "Teste de integração",
            body: "Validação técnica autorizada. Campanha pausada.",
            image_hash: null,
            // Opcional (ADR 0008): URL pública de um MP4 curto prova advideos + video_data.
            video_path: env.META_CONTRACT_VIDEO_URL || null,
            external_creative_id: null,
            external_ad_id: null,
          },
        ],
      },
      {
        client,
        now: () => new Date(),
        renderPng: () => readFile(env.META_CONTRACT_PNG_PATH!),
        videoUrl: async (url) => url,
        beginStep: async () => {},
        record: async (record) => {
          records.push(record);
          console.info("Objeto de contrato criado:", record);
        },
      },
    );
    const campaign = records.find((r): r is { external_campaign_id: string } => "external_campaign_id" in r);
    const ad = records.flatMap((r) =>
      "creatives" in r ? r.creatives.map((c) => c.external_ad_id).filter((id): id is string => Boolean(id)) : [],
    );
    expect(campaign).toBeDefined();
    expect(ad).toHaveLength(1);
    const effective = await client.getAdsEffectiveStatus(ad);
    expect(effective).toHaveLength(1);
    expect(effective).not.toContain("ACTIVE");
    await client.getCampaignInsights(campaign!.external_campaign_id);
  }, 420_000);
});
