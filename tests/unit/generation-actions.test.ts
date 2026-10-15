import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: vi.fn() }));
vi.mock("@/server/context", () => ({
  getAppContext: vi.fn(),
  getCorrelationId: vi.fn(async () => "corr-12345678"),
}));

import { after } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAppContext } from "@/server/context";
import { buildMockStrategy } from "@/server/ai/mock";
import {
  generateStrategyDemo,
  getGenerationJob,
  getLatestStrategy,
  requestStrategyGeneration,
} from "@/server/generation";

type Row = Record<string, unknown>;
type RpcResult = { data: unknown; error: { code: string; message: string } | null };

const ORG = "11111111-1111-4111-8111-111111111111";
const BRIEF = "33333333-3333-4333-8333-333333333333";
const OFFER = "44444444-4444-4444-8444-444444444444";
const BUSINESS = "55555555-5555-4555-8555-555555555555";
const JOB = "77777777-7777-4777-8777-777777777777";
const STRATEGY = "66666666-6666-4666-8666-666666666666";

/** Supabase falso: tabelas em memória para .from() e fila de respostas por RPC. */
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

const baseTables = (): Record<string, Row[]> => ({
  briefs: [
    {
      id: BRIEF,
      organization_id: ORG,
      status: "submitted",
      created_at: "2026-10-10T10:00:00Z",
      offer_id: OFFER,
      business_id: BUSINESS,
      objective: "mensagens_whatsapp",
      audience_description: "Moradores e trabalhadores do bairro",
      age_min: 25,
      age_max: 55,
      service_radius_km: 3,
    },
  ],
  offers: [
    {
      id: OFFER,
      organization_id: ORG,
      name: "Café da manhã completo",
      description: "Pão na chapa, café e suco natural.",
      price_cents: 2490,
      currency: "BRL",
      price_confirmed_by_client: true,
      differentiators: [],
    },
  ],
  businesses: [
    {
      id: BUSINESS,
      organization_id: ORG,
      name: "Padaria Exemplo",
      segment: "Alimentação",
      city: "Campinas",
      state: "SP",
      instagram_handle: null,
      whatsapp_e164: "+5519999990000",
      website_url: null,
      brand_primary_color: "#C2410C",
      tone_of_voice: "acolhedor",
    },
  ],
});

const job = (overrides: Row = {}): Row => ({
  id: JOB,
  organization_id: ORG,
  brief_id: BRIEF,
  status: "queued",
  attempts: 0,
  max_attempts: 3,
  error_code: null,
  provider: "mock",
  model: null,
  is_simulation: true,
  result_strategy_id: null,
  created_at: new Date().toISOString(),
  started_at: null,
  finished_at: null,
  ...overrides,
});

const supabaseMode = () =>
  vi.mocked(getAppContext).mockResolvedValue({
    mode: "supabase",
    user: { id: "u1", email: "dono@exemplo.com" },
    organization: { id: ORG, name: "Padaria Exemplo", role: "owner" },
  });

const onboarding = {
  business: {
    name: "Padaria Exemplo",
    segment: "Alimentação",
    city: "Campinas",
    state: "SP",
    instagram_handle: "",
    whatsapp_e164: "+5519999990000",
    website_url: "",
  },
  offer: {
    name: "Café da manhã completo",
    description: "Pão na chapa, café e suco natural.",
    price_cents: null,
    currency: "BRL",
    price_confirmed_by_client: false,
    differentiators: [],
  },
  audience: { description: "Moradores e trabalhadores do bairro", age_min: 25, age_max: 55, service_radius_km: 3 },
  goal: { objective: "mensagens_whatsapp" },
  identity: { brand_primary_color: "#C2410C", tone_of_voice: "acolhedor" },
  review: { facts_confirmed: true },
};

const afterCallbacks: Array<() => Promise<unknown>> = [];

beforeEach(() => {
  vi.mocked(after).mockImplementation((cb) => void afterCallbacks.push(cb as () => Promise<unknown>));
  for (const m of ["log", "warn", "error"] as const) vi.spyOn(console, m).mockImplementation(() => {});
});

afterEach(() => {
  afterCallbacks.length = 0;
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe("modo demonstração", () => {
  beforeEach(() => vi.mocked(getAppContext).mockResolvedValue({ mode: "demo" }));

  it("ações persistidas ficam desabilitadas", async () => {
    expect(await requestStrategyGeneration()).toMatchObject({ ok: false, error: { code: "feature_disabled" } });
    expect(await getLatestStrategy()).toMatchObject({ ok: false, error: { code: "feature_disabled" } });
    expect(await getGenerationJob(JOB)).toMatchObject({ ok: false, error: { code: "feature_disabled" } });
  });

  it("generateStrategyDemo usa o mock e marca simulação", async () => {
    const result = await generateStrategyDemo(onboarding);
    if (!result.ok) throw new Error(result.error.message);
    expect(result.data.is_simulation).toBe(true);
    expect(result.data.facts.price_cents).toBeNull();
    expect(result.data.generated.concepts).toHaveLength(5);
    expect(result.data.generated.concepts.some((c) => c.show_price)).toBe(false);
    expect(createSupabaseServerClient).not.toHaveBeenCalled();
  });

  it("generateStrategyDemo valida o onboarding", async () => {
    const result = await generateStrategyDemo({ ...onboarding, review: { facts_confirmed: false } });
    expect(result).toMatchObject({ ok: false, error: { code: "validation_failed" } });
    if (!result.ok) expect(result.error.field_errors).toHaveProperty("review.facts_confirmed");
  });
});

describe("modo Supabase", () => {
  beforeEach(() => supabaseMode());

  it("generateStrategyDemo fica desabilitada", async () => {
    expect(await generateStrategyDemo(onboarding)).toMatchObject({ ok: false, error: { code: "feature_disabled" } });
  });

  it("sem organização → forbidden", async () => {
    vi.mocked(getAppContext).mockResolvedValue({
      mode: "supabase",
      user: { id: "u1", email: null },
      organization: null,
    });
    expect(await requestStrategyGeneration()).toMatchObject({ ok: false, error: { code: "forbidden" } });
  });

  it("sem brief submetido → brief_not_ready", async () => {
    const db = fakeSupabase({ briefs: [] });
    vi.mocked(createSupabaseServerClient).mockResolvedValue(db.client as never);
    expect(await requestStrategyGeneration()).toMatchObject({ ok: false, error: { code: "brief_not_ready" } });
  });

  it("chave de idempotência inválida → validation_failed", async () => {
    const result = await requestStrategyGeneration({ idempotency_key: "x" });
    expect(result).toMatchObject({ ok: false, error: { code: "validation_failed" } });
  });

  it("cota → quota_exceeded", async () => {
    const db = fakeSupabase(baseTables(), {
      enqueue_generation_job: [{ data: null, error: { code: "P0001", message: "generation_quota_exceeded" } }],
    });
    vi.mocked(createSupabaseServerClient).mockResolvedValue(db.client as never);
    expect(await requestStrategyGeneration()).toMatchObject({ ok: false, error: { code: "quota_exceeded" } });
  });

  it("enfileira, responde na hora e roda o job em after() com fatos já carregados", async () => {
    const tables = { ...baseTables(), generation_jobs: [job()] };
    const db = fakeSupabase(tables, {
      enqueue_generation_job: [{ data: JOB, error: null }],
      start_generation_job: [{ data: 1, error: null }],
      complete_generation_job: [{ data: STRATEGY, error: null }],
    });
    vi.mocked(createSupabaseServerClient).mockResolvedValue(db.client as never);

    const result = await requestStrategyGeneration({ idempotency_key: "pedido-0001" });
    expect(result).toEqual({ ok: true, data: { job_id: JOB, status: "queued" }, correlation_id: "corr-12345678" });
    expect(db.rpcCalls[0]).toEqual({
      fn: "enqueue_generation_job",
      args: {
        p_org: ORG,
        p_brief: BRIEF,
        p_idempotency_key: "pedido-0001",
        p_provider: "mock",
        p_model: null,
        p_correlation_id: "corr-12345678",
      },
    });
    expect(afterCallbacks).toHaveLength(1);
    expect(db.rpcCalls.map((c) => c.fn)).toEqual(["enqueue_generation_job"]);

    await afterCallbacks[0]!();
    expect(db.rpcCalls.map((c) => c.fn)).toEqual([
      "enqueue_generation_job",
      "start_generation_job",
      "complete_generation_job",
    ]);
    const complete = db.rpcCalls[2]!.args;
    expect(complete.p_concepts).toEqual(
      buildMockStrategy({
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
        tone_of_voice: "acolhedor",
        brand_primary_color: "#C2410C",
        has_whatsapp: true,
        has_instagram: false,
        has_website: false,
      }).concepts,
    );
  });

  it("job já em andamento não agenda outro runner", async () => {
    const db = fakeSupabase(
      { ...baseTables(), generation_jobs: [job({ status: "running", started_at: new Date().toISOString() })] },
      { enqueue_generation_job: [{ data: JOB, error: null }] },
    );
    vi.mocked(createSupabaseServerClient).mockResolvedValue(db.client as never);
    expect(await requestStrategyGeneration()).toMatchObject({ ok: true, data: { status: "running" } });
    expect(afterCallbacks).toHaveLength(0);
  });

  it("getGenerationJob valida o id e devolve o job do contrato", async () => {
    expect(await getGenerationJob("nao-e-uuid")).toMatchObject({ ok: false, error: { code: "validation_failed" } });

    const db = fakeSupabase({ generation_jobs: [job({ status: "succeeded", result_strategy_id: STRATEGY })] });
    vi.mocked(createSupabaseServerClient).mockResolvedValue(db.client as never);
    const result = await getGenerationJob(JOB);
    expect(result).toMatchObject({ ok: true, data: { id: JOB, status: "succeeded", is_simulation: true } });
    if (result.ok) expect(result.data).not.toHaveProperty("brief_id");
  });

  it("getGenerationJob: running há mais de 5 min → stale_timeout", async () => {
    const old = new Date(Date.now() - 6 * 60_000).toISOString();
    const db = fakeSupabase(
      { generation_jobs: [job({ status: "running", attempts: 1, created_at: old, started_at: old })] },
      { fail_generation_job: [{ data: "failed", error: null }] },
    );
    vi.mocked(createSupabaseServerClient).mockResolvedValue(db.client as never);
    await getGenerationJob(JOB);
    expect(db.rpcCalls[0]).toMatchObject({
      fn: "fail_generation_job",
      args: { p_job: JOB, p_error_code: "stale_timeout", p_retryable: false },
    });
  });

  it("getGenerationJob: queued parado há mais de 30 s → reagenda", async () => {
    const old = new Date(Date.now() - 60_000).toISOString();
    const db = fakeSupabase({ ...baseTables(), generation_jobs: [job({ created_at: old })] });
    vi.mocked(createSupabaseServerClient).mockResolvedValue(db.client as never);
    expect(await getGenerationJob(JOB)).toMatchObject({ ok: true, data: { status: "queued" } });
    expect(afterCallbacks).toHaveLength(1);
  });

  it("getGenerationJob de outra organização → not_found", async () => {
    const db = fakeSupabase({ generation_jobs: [job({ organization_id: "outra" })] });
    vi.mocked(createSupabaseServerClient).mockResolvedValue(db.client as never);
    expect(await getGenerationJob(JOB)).toMatchObject({ ok: false, error: { code: "not_found" } });
  });

  it("getLatestStrategy sem estratégia → null", async () => {
    const db = fakeSupabase({ ...baseTables(), strategies: [] });
    vi.mocked(createSupabaseServerClient).mockResolvedValue(db.client as never);
    expect(await getLatestStrategy()).toMatchObject({ ok: true, data: null });
  });
});

describe("provider indisponível", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("AI_PROVIDER=openai sem chave → feature_disabled, sem enfileirar", async () => {
    vi.stubEnv("AI_PROVIDER", "openai");
    vi.resetModules();
    const context = await import("@/server/context");
    vi.mocked(context.getAppContext).mockResolvedValue({
      mode: "supabase",
      user: { id: "u1", email: null },
      organization: { id: ORG, name: "Padaria", role: "owner" },
    });
    const { requestStrategyGeneration: request } = await import("@/server/generation");
    const result = await request();
    expect(result).toMatchObject({ ok: false, error: { code: "feature_disabled" } });
  });
});
