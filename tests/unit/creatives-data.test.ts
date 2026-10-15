import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { checkDesignAgainstOffer, creativeDesignSchema } from "@/contracts/creative";
import { designFromConcept, FALLBACK_BRAND_COLOR } from "@/lib/creative/defaults";
import { buildMockStrategy } from "@/server/ai/mock";
import {
  CREATIVES_LIST_LIMIT,
  listCreativeViews,
  loadConceptForCreative,
  mapCreativeRpcError,
  parseCreativeRow,
  PRICE_MISMATCH_MESSAGE,
  PRICE_NOT_CONFIRMED_MESSAGE,
  readCreative,
  readOfferPrice,
  StoredContentError,
} from "@/server/strategy-data";

type Row = Record<string, unknown>;

function fakeDb(tables: Record<string, Row[]>) {
  return {
    from(table: string) {
      const filters: Array<[string, unknown]> = [];
      let order: { column: string; ascending: boolean } | null = null;
      let limit: number | null = null;
      const rows = () => {
        let out = (tables[table] ?? []).filter((r) => filters.every(([c, v]) => r[c] === v));
        if (order) {
          const { column, ascending } = order;
          out = [...out].sort((a, b) => (String(a[column]) < String(b[column]) ? -1 : 1) * (ascending ? 1 : -1));
        }
        return limit === null ? out : out.slice(0, limit);
      };
      const builder = {
        select: () => builder,
        eq: (column: string, value: unknown) => (filters.push([column, value]), builder),
        order: (column: string, opts: { ascending: boolean }) => ((order = { column, ...opts }), builder),
        limit: (n: number) => ((limit = n), builder),
        overrideTypes: () => builder,
        maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
        then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
          Promise.resolve({ data: rows(), error: null }).then(resolve, reject),
      };
      return builder;
    },
  } as unknown as SupabaseClient;
}

const ORG = "11111111-1111-4111-8111-111111111111";
const OTHER_ORG = "22222222-2222-4222-8222-222222222222";
const BRIEF = "33333333-3333-4333-8333-333333333333";
const OFFER = "44444444-4444-4444-8444-444444444444";
const BUSINESS = "55555555-5555-4555-8555-555555555555";
const STRATEGY = "66666666-6666-4666-8666-666666666666";
const CONCEPT = "88888888-8888-4888-8888-888888888888";
const CREATIVE = "99999999-9999-4999-8999-999999999999";

const factsBase = {
  business_name: "Padaria Exemplo",
  segment: "Alimentação",
  city: "Campinas",
  state: "SP",
  offer_name: "Café da manhã completo",
  offer_description: "Pão na chapa, café e suco natural.",
  price_cents: 2490,
  currency: "BRL",
  differentiators: [],
  audience_description: "Moradores e trabalhadores do bairro",
  age_min: 25,
  age_max: 55,
  service_radius_km: 3,
  objective: "mensagens_whatsapp" as const,
  tone_of_voice: "direto",
  brand_primary_color: "#C2410C",
  has_whatsapp: true,
  has_instagram: false,
  has_website: false,
};
const concept = buildMockStrategy(factsBase).concepts[0]!;

const design = (overrides: Row = {}) => ({
  format: "feed_4x5",
  template_key: "oferta",
  business_name: "Padaria Exemplo",
  headline: "Café da manhã completo",
  body: "Pão na chapa, café e suco natural.",
  cta: "Chamar no WhatsApp",
  show_price: true,
  price_cents: 2490,
  currency: "BRL",
  brand_color: "#C2410C",
  background: "gradiente",
  ...overrides,
});

function db(offer: Partial<Row> = {}, extra: Partial<Record<string, Row[]>> = {}) {
  return fakeDb({
    creative_concepts: [{ id: CONCEPT, organization_id: ORG, strategy_id: STRATEGY, content: concept }],
    strategies: [{ id: STRATEGY, organization_id: ORG, brief_id: BRIEF }],
    briefs: [{ id: BRIEF, organization_id: ORG, offer_id: OFFER, business_id: BUSINESS }],
    offers: [
      {
        id: OFFER,
        organization_id: ORG,
        price_cents: 2490,
        price_confirmed_by_client: true,
        currency: "BRL",
        ...offer,
      },
    ],
    businesses: [{ id: BUSINESS, organization_id: ORG, name: "Padaria Exemplo", brand_primary_color: null }],
    creatives: [
      {
        id: CREATIVE,
        organization_id: ORG,
        concept_id: CONCEPT,
        offer_id: OFFER,
        status: "draft",
        version: 3,
        design: design(),
        updated_at: "2026-10-15T10:00:00Z",
        approved_at: null,
      },
    ],
    ...extra,
  });
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("peça a partir de conceito", () => {
  it("carrega conceito, oferta e negócio da mesma organização", async () => {
    const source = await loadConceptForCreative(db(), ORG, CONCEPT);
    expect(source?.concept).toEqual(concept);
    expect(source?.designFacts).toEqual({
      business_name: "Padaria Exemplo",
      brand_color: null,
      price_cents: 2490,
      currency: "BRL",
    });
    expect(await loadConceptForCreative(db(), OTHER_ORG, CONCEPT)).toBeNull();
  });

  it("design inicial válido, com o preço confirmado da oferta e cor padrão", async () => {
    const source = (await loadConceptForCreative(db(), ORG, CONCEPT))!;
    const initial = creativeDesignSchema.parse(designFromConcept(source.concept, source.designFacts, "stories_9x16"));
    expect(initial).toMatchObject({
      format: "stories_9x16",
      show_price: true,
      price_cents: 2490,
      brand_color: FALLBACK_BRAND_COLOR,
    });
    expect(checkDesignAgainstOffer(initial, source.offer)).toEqual([]);
  });

  it("preço não confirmado na oferta não vira preço na peça", async () => {
    const source = (await loadConceptForCreative(db({ price_confirmed_by_client: false }), ORG, CONCEPT))!;
    expect(source.offer.price_cents).toBeNull();
    const initial = designFromConcept(source.concept, source.designFacts, "feed_4x5");
    expect(initial).toMatchObject({ show_price: false, price_cents: null });
  });

  it("conceito gravado fora do contrato → StoredContentError", async () => {
    const broken = db(
      {},
      { creative_concepts: [{ id: CONCEPT, organization_id: ORG, strategy_id: STRATEGY, content: { angle: "x" } }] },
    );
    await expect(loadConceptForCreative(broken, ORG, CONCEPT)).rejects.toBeInstanceOf(StoredContentError);
  });
});

describe("leitura de peças", () => {
  it("readCreative + readOfferPrice", async () => {
    const found = await readCreative(db(), ORG, CREATIVE);
    expect(found?.creative).toMatchObject({ id: CREATIVE, version: 3, status: "draft", concept_id: CONCEPT });
    expect(found?.offer_id).toBe(OFFER);
    expect(await readOfferPrice(db(), ORG, OFFER)).toEqual({
      price_cents: 2490,
      price_confirmed_by_client: true,
      currency: "BRL",
    });
    expect(await readCreative(db(), OTHER_ORG, CREATIVE)).toBeNull();
  });

  it("listagem: mais recentes primeiro, ignora linhas inválidas, até 50", async () => {
    const rows = Array.from({ length: 60 }, (_, i) => ({
      id: `99999999-9999-4999-8999-9999999999${String(i).padStart(2, "0")}`,
      organization_id: ORG,
      concept_id: null,
      offer_id: OFFER,
      status: "draft",
      version: 1,
      design: i === 59 ? { format: "feed_4x5" } : design({ show_price: false, price_cents: null }),
      updated_at: `2026-10-15T10:${String(i).padStart(2, "0")}:00Z`,
      approved_at: null,
    }));
    const list = await listCreativeViews(db({}, { creatives: rows }), ORG);
    expect(list).toHaveLength(CREATIVES_LIST_LIMIT - 1);
    expect(list[0]?.updated_at).toBe("2026-10-15T10:58:00Z");
  });

  it("parseCreativeRow recusa design fora do contrato", () => {
    const row = {
      id: CREATIVE,
      concept_id: null,
      offer_id: OFFER,
      status: "draft",
      version: 1,
      design: design({ headline: "x".repeat(41) }),
      updated_at: "2026-10-15T10:00:00Z",
      approved_at: null,
    };
    expect(parseCreativeRow(row)).toBeNull();
    expect(parseCreativeRow({ ...row, design: design() })).not.toBeNull();
  });
});

describe("mapCreativeRpcError", () => {
  it("version_conflict → conflict", () => {
    expect(mapCreativeRpcError({ code: "P0001", message: "version_conflict" }).code).toBe("conflict");
  });

  it("preço sem confirmação → validation_failed em show_price", () => {
    expect(mapCreativeRpcError({ code: "P0001", message: "price_not_confirmed" })).toEqual({
      code: "validation_failed",
      message: PRICE_NOT_CONFIRMED_MESSAGE,
      field_errors: { show_price: [PRICE_NOT_CONFIRMED_MESSAGE] },
    });
  });

  it("preço diferente → validation_failed em price_cents", () => {
    expect(mapCreativeRpcError({ code: "P0001", message: "price_mismatch" })).toEqual({
      code: "validation_failed",
      message: PRICE_MISMATCH_MESSAGE,
      field_errors: { price_cents: [PRICE_MISMATCH_MESSAGE] },
    });
  });

  it("acesso negado, check do banco e erros desconhecidos", () => {
    expect(mapCreativeRpcError({ code: "42501", message: "forbidden" }).code).toBe("forbidden");
    expect(mapCreativeRpcError({ code: "23514", message: "check" }).code).toBe("validation_failed");
    expect(mapCreativeRpcError({ code: "08006", message: "conexão" }).code).toBe("internal");
  });
});
