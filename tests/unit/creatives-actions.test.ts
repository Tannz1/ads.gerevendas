import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: vi.fn() }));
vi.mock("@/server/context", () => ({
  getAppContext: vi.fn(),
  getCorrelationId: vi.fn(async () => "corr-12345678"),
}));

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAppContext } from "@/server/context";
import { buildMockStrategy } from "@/server/ai/mock";
import {
  approveCreative,
  createCreativeFromConcept,
  getCreative,
  listCreatives,
  saveCreative,
} from "@/server/creatives";

type Row = Record<string, unknown>;
type RpcResult = { data: unknown; error: { code: string; message: string } | null };

const ORG = "11111111-1111-4111-8111-111111111111";
const BRIEF = "33333333-3333-4333-8333-333333333333";
const OFFER = "44444444-4444-4444-8444-444444444444";
const BUSINESS = "55555555-5555-4555-8555-555555555555";
const STRATEGY = "66666666-6666-4666-8666-666666666666";
const CONCEPT = "88888888-8888-4888-8888-888888888888";
const CREATIVE = "99999999-9999-4999-8999-999999999999";

function fakeSupabase(tables: Record<string, Row[]>, rpcs: Record<string, RpcResult[]> = {}) {
  const rpcCalls: Array<{ fn: string; args: Row }> = [];
  return {
    rpcCalls,
    client: {
      rpc: vi.fn(async (fn: string, args: Row) => {
        rpcCalls.push({ fn, args });
        const queue = rpcs[fn];
        if (!queue?.length) throw new Error(`rpc inesperada: ${fn}`);
        return queue.length > 1 ? queue.shift()! : queue[0]!;
      }),
      from(table: string) {
        const filters: Array<[string, unknown]> = [];
        const rows = () => (tables[table] ?? []).filter((r) => filters.every(([c, v]) => r[c] === v));
        const builder = {
          select: () => builder,
          eq: (c: string, v: unknown) => (filters.push([c, v]), builder),
          order: () => builder,
          limit: () => builder,
          overrideTypes: () => builder,
          maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
          then: (resolve: (v: unknown) => unknown) => Promise.resolve({ data: rows(), error: null }).then(resolve),
        };
        return builder;
      },
    },
  };
}

const concept = buildMockStrategy({
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
  objective: "mensagens_whatsapp",
  tone_of_voice: "direto",
  brand_primary_color: "#C2410C",
  has_whatsapp: true,
  has_instagram: false,
  has_website: false,
}).concepts[0]!;

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

const tables = (offer: Row = {}): Record<string, Row[]> => ({
  creative_concepts: [{ id: CONCEPT, organization_id: ORG, strategy_id: STRATEGY, content: concept }],
  strategies: [{ id: STRATEGY, organization_id: ORG, brief_id: BRIEF }],
  briefs: [{ id: BRIEF, organization_id: ORG, offer_id: OFFER, business_id: BUSINESS }],
  offers: [
    { id: OFFER, organization_id: ORG, price_cents: 2490, price_confirmed_by_client: true, currency: "BRL", ...offer },
  ],
  businesses: [{ id: BUSINESS, organization_id: ORG, name: "Padaria Exemplo", brand_primary_color: "#C2410C" }],
  creatives: [
    {
      id: CREATIVE,
      organization_id: ORG,
      concept_id: CONCEPT,
      offer_id: OFFER,
      status: "draft",
      version: 2,
      design: design(),
      updated_at: "2026-10-15T10:00:00Z",
      approved_at: null,
    },
  ],
});

function useDb(t: Record<string, Row[]>, rpcs: Record<string, RpcResult[]> = {}) {
  const db = fakeSupabase(t, rpcs);
  vi.mocked(createSupabaseServerClient).mockResolvedValue(db.client as never);
  return db;
}

beforeEach(() => {
  vi.mocked(getAppContext).mockResolvedValue({
    mode: "supabase",
    user: { id: "u1", email: null },
    organization: { id: ORG, name: "Padaria Exemplo", role: "owner" },
  });
  for (const m of ["log", "warn", "error"] as const) vi.spyOn(console, m).mockImplementation(() => {});
});

afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe("peças: modo demonstração", () => {
  it("todas as ações respondem feature_disabled", async () => {
    vi.mocked(getAppContext).mockResolvedValue({ mode: "demo" });
    const results = await Promise.all([
      createCreativeFromConcept({ concept_id: CONCEPT, format: "feed_4x5" }),
      getCreative(CREATIVE),
      listCreatives(),
      saveCreative({ creative_id: CREATIVE, version: 1, design: design() }),
      approveCreative({ creative_id: CREATIVE, version: 1 }),
    ]);
    for (const r of results) expect(r).toMatchObject({ ok: false, error: { code: "feature_disabled" } });
    expect(createSupabaseServerClient).not.toHaveBeenCalled();
  });
});

describe("createCreativeFromConcept", () => {
  it("monta o design a partir do conceito e cria via RPC", async () => {
    const db = useDb(tables(), { create_creative: [{ data: CREATIVE, error: null }] });
    const result = await createCreativeFromConcept({ concept_id: CONCEPT, format: "stories_9x16" });
    expect(result).toEqual({ ok: true, data: { creative_id: CREATIVE }, correlation_id: "corr-12345678" });
    expect(db.rpcCalls[0]?.fn).toBe("create_creative");
    expect(db.rpcCalls[0]?.args).toMatchObject({
      p_concept: CONCEPT,
      p_design: {
        format: "stories_9x16",
        headline: concept.headline,
        show_price: true,
        price_cents: 2490,
        brand_color: "#C2410C",
      },
    });
    expect(revalidatePath).toHaveBeenCalled();
  });

  it("valida entrada e conceito inexistente", async () => {
    expect(await createCreativeFromConcept({ concept_id: "x", format: "feed_4x5" })).toMatchObject({
      ok: false,
      error: { code: "validation_failed" },
    });
    useDb({ ...tables(), creative_concepts: [] });
    expect(await createCreativeFromConcept({ concept_id: CONCEPT, format: "feed_4x5" })).toMatchObject({
      ok: false,
      error: { code: "not_found" },
    });
  });

  it("erro de preço do banco vira erro no campo", async () => {
    useDb(tables(), { create_creative: [{ data: null, error: { code: "P0001", message: "price_mismatch" } }] });
    const result = await createCreativeFromConcept({ concept_id: CONCEPT, format: "feed_4x5" });
    expect(result).toMatchObject({ ok: false, error: { code: "validation_failed" } });
    if (!result.ok) expect(result.error.field_errors).toHaveProperty("price_cents");
  });
});

describe("getCreative / listCreatives", () => {
  it("devolve a peça e o preço confirmado da oferta", async () => {
    useDb(tables());
    const result = await getCreative(CREATIVE);
    expect(result).toMatchObject({
      ok: true,
      data: {
        creative: { id: CREATIVE, version: 2, status: "draft" },
        offer: { price_cents: 2490, price_confirmed_by_client: true, currency: "BRL" },
      },
    });
  });

  it("peça inexistente → not_found; id inválido → validation_failed", async () => {
    useDb({ ...tables(), creatives: [] });
    expect(await getCreative(CREATIVE)).toMatchObject({ ok: false, error: { code: "not_found" } });
    expect(await getCreative("abc")).toMatchObject({ ok: false, error: { code: "validation_failed" } });
  });

  it("lista as peças da organização", async () => {
    useDb(tables());
    const result = await listCreatives();
    expect(result).toMatchObject({ ok: true });
    if (result.ok) expect(result.data.map((c) => c.id)).toEqual([CREATIVE]);
  });
});

describe("saveCreative", () => {
  it("design inválido → validation_failed com erros por campo (sem chamar o banco)", async () => {
    const db = useDb(tables());
    const result = await saveCreative({
      creative_id: CREATIVE,
      version: 2,
      design: design({ headline: "x".repeat(41), show_price: true, price_cents: null }),
    });
    expect(result).toMatchObject({ ok: false, error: { code: "validation_failed" } });
    if (!result.ok) {
      expect(result.error.field_errors).toHaveProperty("headline");
      expect(result.error.field_errors).toHaveProperty("price_cents");
    }
    expect(db.rpcCalls).toHaveLength(0);
  });

  it("salva e devolve a nova versão", async () => {
    const db = useDb(tables(), { save_creative: [{ data: 3, error: null }] });
    const result = await saveCreative({
      creative_id: CREATIVE,
      version: 2,
      design: design({ headline: "Novo título" }),
    });
    expect(result).toMatchObject({ ok: true, data: { version: 3 } });
    expect(db.rpcCalls[0]).toMatchObject({ fn: "save_creative", args: { p_creative: CREATIVE, p_version: 2 } });
  });

  it("conflito de versão → conflict; preço sem confirmação → erro em show_price", async () => {
    useDb(tables(), { save_creative: [{ data: null, error: { code: "P0001", message: "version_conflict" } }] });
    expect(await saveCreative({ creative_id: CREATIVE, version: 1, design: design() })).toMatchObject({
      ok: false,
      error: { code: "conflict" },
    });

    useDb(tables(), { save_creative: [{ data: null, error: { code: "P0001", message: "price_not_confirmed" } }] });
    const result = await saveCreative({ creative_id: CREATIVE, version: 2, design: design() });
    expect(result).toMatchObject({ ok: false, error: { code: "validation_failed" } });
    if (!result.ok) expect(result.error.field_errors).toHaveProperty("show_price");
  });
});

describe("approveCreative", () => {
  it("aprova a versão atual", async () => {
    const db = useDb(tables(), { approve_creative: [{ data: null, error: null }] });
    expect(await approveCreative({ creative_id: CREATIVE, version: 2 })).toMatchObject({
      ok: true,
      data: { status: "approved" },
    });
    expect(db.rpcCalls[0]).toMatchObject({ fn: "approve_creative", args: { p_creative: CREATIVE, p_version: 2 } });
  });

  it("não aprova peça com preço que deixou de ser confirmado", async () => {
    const db = useDb(tables({ price_cents: null, price_confirmed_by_client: false }));
    const result = await approveCreative({ creative_id: CREATIVE, version: 2 });
    expect(result).toMatchObject({ ok: false, error: { code: "validation_failed" } });
    if (!result.ok) expect(result.error.field_errors).toHaveProperty("show_price");
    expect(db.rpcCalls).toHaveLength(0);
  });

  it("conflito de versão → conflict", async () => {
    useDb(tables(), { approve_creative: [{ data: null, error: { code: "P0001", message: "version_conflict" } }] });
    expect(await approveCreative({ creative_id: CREATIVE, version: 1 })).toMatchObject({
      ok: false,
      error: { code: "conflict" },
    });
  });
});
