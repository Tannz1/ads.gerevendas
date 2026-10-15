import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { DAILY_GENERATION_LIMIT } from "@/contracts/strategy";
import { loadBriefFacts } from "@/server/ai/facts";
import { buildMockStrategy } from "@/server/ai/mock";
import { decideJobRecovery, REQUEUE_AFTER_MS, STALE_RUNNING_MS } from "@/server/job-runner";
import {
  getLatestSubmittedBrief,
  loadLatestStrategy,
  mapEnqueueError,
  parseJobRow,
  readGenerationJob,
  StoredContentError,
} from "@/server/strategy-data";

type Row = Record<string, unknown>;

/** Cliente de consulta falso: aplica .eq/.order/.limit sobre tabelas em memória. */
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
const BRIEF_OLD = "33333333-3333-4333-8333-333333333331";
const BRIEF_NEW = "33333333-3333-4333-8333-333333333332";
const OFFER = "44444444-4444-4444-8444-444444444444";
const BUSINESS = "55555555-5555-4555-8555-555555555555";
const STRATEGY_V1 = "66666666-6666-4666-8666-666666666661";
const STRATEGY_V2 = "66666666-6666-4666-8666-666666666662";
const JOB = "77777777-7777-4777-8777-777777777777";

const facts = {
  business_name: "Padaria Exemplo",
  segment: "Alimentação",
  city: "Campinas",
  state: "SP",
  offer_name: "Café da manhã completo",
  offer_description: "Pão na chapa, café e suco natural.",
  price_cents: 2490,
  currency: "BRL",
  differentiators: ["Pão saindo do forno às 6h"],
  audience_description: "Moradores e trabalhadores do bairro",
  age_min: 25,
  age_max: 55,
  service_radius_km: 3,
  objective: "mensagens_whatsapp" as const,
  tone_of_voice: "acolhedor",
  brand_primary_color: "#C2410C",
  has_whatsapp: true,
  has_instagram: true,
  has_website: false,
};

const generated = buildMockStrategy(facts);

function db(overrides: Partial<Record<string, Row[]>> = {}) {
  return fakeDb({
    briefs: [
      {
        id: BRIEF_OLD,
        organization_id: ORG,
        status: "submitted",
        created_at: "2026-10-01T10:00:00Z",
        offer_id: OFFER,
        business_id: BUSINESS,
        objective: "mensagens_whatsapp",
        audience_description: "Moradores e trabalhadores do bairro",
        age_min: 25,
        age_max: 55,
        service_radius_km: 3,
      },
      {
        id: BRIEF_NEW,
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
        differentiators: ["Pão saindo do forno às 6h"],
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
        instagram_handle: "padaria.exemplo",
        whatsapp_e164: "+5519999990000",
        website_url: null,
        brand_primary_color: "#C2410C",
        tone_of_voice: "acolhedor",
      },
    ],
    strategies: [1, 2].map((version) => ({
      id: version === 1 ? STRATEGY_V1 : STRATEGY_V2,
      organization_id: ORG,
      brief_id: BRIEF_NEW,
      version,
      provider: "mock",
      model: null,
      is_simulation: true,
      created_at: `2026-10-1${version}T10:00:00Z`,
      content: generated.strategy,
    })),
    creative_concepts: generated.concepts
      .map((content, i) => ({
        id: `88888888-8888-4888-8888-88888888888${i}`,
        organization_id: ORG,
        strategy_id: STRATEGY_V2,
        position: i + 1,
        content,
      }))
      .reverse(),
    ...overrides,
  });
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("leitura de brief e estratégia", () => {
  it("brief submetido mais recente da organização", async () => {
    expect((await getLatestSubmittedBrief(db(), ORG))?.id).toBe(BRIEF_NEW);
    expect(await getLatestSubmittedBrief(db(), OTHER_ORG)).toBeNull();
  });

  it("loadBriefFacts monta os fatos a partir do banco", async () => {
    expect(await loadBriefFacts(db(), ORG, BRIEF_NEW)).toEqual(facts);
    await expect(loadBriefFacts(db(), OTHER_ORG, BRIEF_NEW)).rejects.toMatchObject({ reason: "not_found" });
  });

  it("última versão da estratégia, conceitos em ordem de posição", async () => {
    const view = await loadLatestStrategy(db(), ORG);
    expect(view?.id).toBe(STRATEGY_V2);
    expect(view?.version).toBe(2);
    expect(view?.is_simulation).toBe(true);
    expect(view?.concepts.map((c) => c.position)).toEqual([1, 2, 3, 4, 5]);
    expect(view?.concepts[0]?.content.angle).toBe("oferta_direta");
  });

  it("sem estratégia ou sem brief → null", async () => {
    expect(await loadLatestStrategy(db({ strategies: [] }), ORG)).toBeNull();
    expect(await loadLatestStrategy(db({ briefs: [] }), ORG)).toBeNull();
  });

  it("conteúdo gravado inválido → loga e lança", async () => {
    const broken = db({
      strategies: [
        {
          id: STRATEGY_V2,
          organization_id: ORG,
          brief_id: BRIEF_NEW,
          version: 1,
          provider: "mock",
          model: null,
          is_simulation: true,
          created_at: "2026-10-12T10:00:00Z",
          content: { summary: "curto" },
        },
      ],
    });
    await expect(loadLatestStrategy(broken, ORG)).rejects.toBeInstanceOf(StoredContentError);
  });
});

const jobRow = (overrides: Row = {}) => ({
  id: JOB,
  organization_id: ORG,
  brief_id: BRIEF_NEW,
  status: "queued",
  attempts: 0,
  max_attempts: 3,
  error_code: null,
  provider: "mock",
  model: null,
  is_simulation: true,
  result_strategy_id: null,
  created_at: "2026-10-15T10:00:00Z",
  started_at: null,
  finished_at: null,
  ...overrides,
});

describe("jobs", () => {
  it("readGenerationJob devolve o job do contrato + brief_id/model", async () => {
    const record = await readGenerationJob(db({ generation_jobs: [jobRow()] }), ORG, JOB);
    expect(record).toMatchObject({ brief_id: BRIEF_NEW, model: null, job: { id: JOB, status: "queued" } });
    expect(record?.job).not.toHaveProperty("brief_id");
    expect(await readGenerationJob(db({ generation_jobs: [jobRow()] }), OTHER_ORG, JOB)).toBeNull();
  });

  it("código de erro desconhecido vira internal", () => {
    const parsed = parseJobRow(jobRow({ status: "failed", error_code: "algo_novo" }) as never);
    expect(parsed.job.error_code).toBe("internal");
  });

  it("decideJobRecovery: running travado, queued parado, demais nada", () => {
    const now = Date.parse("2026-10-15T12:00:00Z");
    const iso = (msAgo: number) => new Date(now - msAgo).toISOString();
    const running = (msAgo: number) => ({ status: "running" as const, created_at: iso(msAgo), started_at: iso(msAgo) });
    expect(decideJobRecovery(running(STALE_RUNNING_MS + 1_000), now)).toBe("mark_stale");
    expect(decideJobRecovery(running(STALE_RUNNING_MS - 1_000), now)).toBe("none");

    const queued = (createdAgo: number, startedAgo: number | null) => ({
      status: "queued" as const,
      created_at: iso(createdAgo),
      started_at: startedAgo === null ? null : iso(startedAgo),
    });
    expect(decideJobRecovery(queued(REQUEUE_AFTER_MS + 1_000, null), now)).toBe("reschedule");
    expect(decideJobRecovery(queued(5_000, null), now)).toBe("none");
    // Voltou para a fila há pouco (backoff do runner): não reagenda.
    expect(decideJobRecovery(queued(120_000, 3_000), now)).toBe("none");
    expect(decideJobRecovery(queued(120_000, REQUEUE_AFTER_MS + 1_000), now)).toBe("reschedule");

    for (const status of ["succeeded", "failed"] as const) {
      expect(decideJobRecovery({ status, created_at: iso(3_600_000), started_at: iso(3_600_000) }, now)).toBe("none");
    }
  });
});

describe("mapEnqueueError", () => {
  it("cota diária → quota_exceeded", () => {
    const mapped = mapEnqueueError({ code: "P0001", message: "generation_quota_exceeded" });
    expect(mapped.code).toBe("quota_exceeded");
    expect(mapped.message).toContain(String(DAILY_GENERATION_LIMIT));
  });

  it("brief não submetido → brief_not_ready", () => {
    expect(mapEnqueueError({ code: "P0001", message: "brief_not_ready" }).code).toBe("brief_not_ready");
  });

  it("acesso negado → forbidden", () => {
    expect(mapEnqueueError({ code: "42501", message: "forbidden" }).code).toBe("forbidden");
  });

  it("corrida na mesma chave → conflict; resto → internal", () => {
    expect(mapEnqueueError({ code: "23505", message: "duplicate key" }).code).toBe("conflict");
    expect(mapEnqueueError({ code: "XX000", message: "boom" }).code).toBe("internal");
    expect(mapEnqueueError({ code: "P0001", message: "outra_coisa" }).code).toBe("internal");
  });
});
