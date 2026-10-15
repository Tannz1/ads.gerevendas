import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { BriefFacts, Usage } from "@/contracts/strategy";
import { buildMockStrategy, createMockProvider } from "@/server/ai/mock";
import { ProviderError, type AiTextProvider } from "@/server/ai/types";
import { abortQueuedJob, runGenerationJob, type RpcError } from "@/server/job-runner";

const JOB = "7d1b5c8e-6a0f-4c47-9b39-2f0f1f9a0a01";
const STRATEGY = "0b8f8f4e-3b1a-4d55-8a7b-6f0b1e2c3d4e";

function facts(overrides: Partial<BriefFacts> = {}): BriefFacts {
  return {
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
    objective: "mensagens_whatsapp",
    tone_of_voice: "acolhedor",
    brand_primary_color: "#C2410C",
    has_whatsapp: true,
    has_instagram: true,
    has_website: false,
    ...overrides,
  };
}

type RpcResult = { data: unknown; error: RpcError | null };
type Handler = (args: Record<string, unknown>) => RpcResult;

/** Cliente Supabase falso: respostas por função, em fila; registra todas as chamadas. */
function fakeSupabase(handlers: Record<string, Array<RpcResult | Handler>>) {
  const calls: Array<{ fn: string; args: Record<string, unknown> }> = [];
  const client = {
    rpc: vi.fn(async (fn: string, args: Record<string, unknown> = {}) => {
      calls.push({ fn, args });
      const queue = handlers[fn];
      const next = queue?.length && queue.length > 1 ? queue.shift() : queue?.[0];
      if (!next) throw new Error(`rpc inesperada: ${fn}`);
      return typeof next === "function" ? next(args) : next;
    }),
  };
  return { client, calls, fns: () => calls.map((c) => c.fn) };
}

const ok = (data: unknown): RpcResult => ({ data, error: null });
const err = (code: string, message: string): RpcResult => ({ data: null, error: { code, message } });

const USAGE: Usage = { input_tokens: 10, output_tokens: 20, cost_micro_usd: 3 };

function scriptedProvider(steps: Array<"good" | ProviderError | Error>): AiTextProvider {
  let i = 0;
  return {
    name: "openai",
    model: "modelo-teste",
    isSimulation: false,
    async generateStrategy(f) {
      const step = steps[Math.min(i++, steps.length - 1)];
      if (step instanceof Error) throw step;
      return { output: buildMockStrategy(f), usage: USAGE };
    },
  };
}

let lines: string[];
beforeEach(() => {
  lines = [];
  for (const m of ["log", "warn", "error"] as const) {
    vi.spyOn(console, m).mockImplementation((l: unknown) => void lines.push(String(l)));
  }
});

const sleep = vi.fn(async () => {});
const run = (supabase: { rpc: unknown }, provider: AiTextProvider, extra: object = {}) =>
  runGenerationJob({
    supabase: supabase as Parameters<typeof runGenerationJob>[0]["supabase"],
    jobId: JOB,
    facts: facts(),
    provider,
    correlationId: "corr-12345678",
    timeoutMs: 5_000,
    sleep,
    ...extra,
  });

beforeEach(() => sleep.mockClear());

describe("runGenerationJob", () => {
  it("sucesso: start → complete com estratégia, conceitos e uso", async () => {
    const db = fakeSupabase({ start_generation_job: [ok(1)], complete_generation_job: [ok(STRATEGY)] });
    const outcome = await run(db.client, scriptedProvider(["good"]));
    expect(outcome).toEqual({ status: "succeeded", strategy_id: STRATEGY, attempts: 1 });
    expect(db.fns()).toEqual(["start_generation_job", "complete_generation_job"]);
    const args = db.calls[1]!.args;
    expect(args.p_job).toBe(JOB);
    expect(args.p_strategy).toEqual(buildMockStrategy(facts()).strategy);
    expect(args.p_concepts).toHaveLength(5);
    expect(args.p_usage).toEqual(USAGE);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("falha retentável → volta para a fila, espera 2 s e tenta de novo com sucesso", async () => {
    const db = fakeSupabase({
      start_generation_job: [ok(1), ok(2)],
      fail_generation_job: [ok("queued")],
      complete_generation_job: [ok(STRATEGY)],
    });
    const rateLimited = new ProviderError("provider_rate_limited", true, "429", USAGE);
    const outcome = await run(db.client, scriptedProvider([rateLimited, "good"]));
    expect(outcome).toEqual({ status: "succeeded", strategy_id: STRATEGY, attempts: 2 });
    expect(db.fns()).toEqual([
      "start_generation_job",
      "fail_generation_job",
      "start_generation_job",
      "complete_generation_job",
    ]);
    expect(db.calls[1]!.args).toEqual({
      p_job: JOB,
      p_error_code: "provider_rate_limited",
      p_retryable: true,
      p_usage: USAGE,
    });
    expect(sleep).toHaveBeenCalledWith(2_000);
  });

  it("tentativas esgotadas: backoff 2 s e 4 s, depois falha", async () => {
    const db = fakeSupabase({
      start_generation_job: [ok(1), ok(2), ok(3)],
      fail_generation_job: [ok("queued"), ok("queued"), ok("failed")],
    });
    const timeout = new ProviderError("provider_timeout", true, "timeout");
    const outcome = await run(db.client, scriptedProvider([timeout]));
    expect(outcome).toEqual({ status: "failed", error_code: "provider_timeout", attempts: 3 });
    expect(sleep.mock.calls).toEqual([[2_000], [4_000]]);
    expect(db.fns().filter((f) => f === "fail_generation_job")).toHaveLength(3);
    expect(lines.some((l) => l.includes('"event":"ai.job.failed"'))).toBe(true);
  });

  it("erro não retentável falha na hora", async () => {
    const db = fakeSupabase({ start_generation_job: [ok(1)], fail_generation_job: [ok("failed")] });
    const outcome = await run(db.client, scriptedProvider([new ProviderError("fact_check_failed", false, "x")]));
    expect(outcome).toMatchObject({ status: "failed", error_code: "fact_check_failed" });
    expect(db.calls[1]!.args).toMatchObject({ p_retryable: false, p_error_code: "fact_check_failed" });
    expect(sleep).not.toHaveBeenCalled();
  });

  it("erro desconhecido vira internal não retentável", async () => {
    const db = fakeSupabase({ start_generation_job: [ok(1)], fail_generation_job: [ok("failed")] });
    const outcome = await run(db.client, scriptedProvider([new TypeError("bug")]));
    expect(outcome).toMatchObject({ status: "failed", error_code: "internal" });
    expect(db.calls[1]!.args).toMatchObject({ p_error_code: "internal", p_retryable: false });
  });

  it("corrida: outro runner já iniciou (invalid_transition) → sai sem fazer nada", async () => {
    const db = fakeSupabase({ start_generation_job: [err("P0001", "invalid_transition")] });
    const generate = vi.fn();
    const provider = { ...createMockProvider(), generateStrategy: generate };
    const outcome = await run(db.client, provider);
    expect(outcome).toEqual({ status: "skipped", reason: "not_queued" });
    expect(generate).not.toHaveBeenCalled();
    expect(db.fns()).toEqual(["start_generation_job"]);
  });

  it("job marcado como travado durante a geração (complete → invalid_transition)", async () => {
    const db = fakeSupabase({
      start_generation_job: [ok(1)],
      complete_generation_job: [err("P0001", "invalid_transition")],
    });
    const outcome = await run(db.client, scriptedProvider(["good"]));
    expect(outcome).toEqual({ status: "skipped", reason: "lost_ownership" });
    expect(db.fns()).not.toContain("fail_generation_job");
  });

  it("banco recusa o conteúdo ao concluir → invalid_output com o uso gasto", async () => {
    const db = fakeSupabase({
      start_generation_job: [ok(1)],
      complete_generation_job: [err("P0001", "price_not_confirmed")],
      fail_generation_job: [ok("failed")],
    });
    const outcome = await run(db.client, scriptedProvider(["good"]));
    expect(outcome).toMatchObject({ status: "failed", error_code: "invalid_output" });
    expect(db.calls[2]!.args).toMatchObject({ p_error_code: "invalid_output", p_retryable: false, p_usage: USAGE });
  });

  it("provider diferente do gravado no job → falha feature_disabled sem gerar", async () => {
    const db = fakeSupabase({ start_generation_job: [ok(1)], fail_generation_job: [ok("failed")] });
    const generate = vi.fn();
    const provider = { ...createMockProvider(), generateStrategy: generate };
    const outcome = await run(db.client, provider, { expected: { provider: "openai", model: "modelo-teste" } });
    expect(outcome).toMatchObject({ status: "failed", error_code: "feature_disabled" });
    expect(generate).not.toHaveBeenCalled();
  });

  it("logs estruturados sem fatos nem chaves", async () => {
    const db = fakeSupabase({ start_generation_job: [ok(1)], complete_generation_job: [ok(STRATEGY)] });
    await run(db.client, scriptedProvider(["good"]));
    const events = lines.map((l) => JSON.parse(l) as Record<string, unknown>);
    const succeeded = events.find((e) => e.event === "ai.job.succeeded");
    expect(succeeded).toMatchObject({
      correlation_id: "corr-12345678",
      job_id: JOB,
      attempt: 1,
      provider: "openai",
      model: "modelo-teste",
      input_tokens: 10,
      output_tokens: 20,
      cost_micro_usd: 3,
    });
    expect(typeof succeeded?.duration_ms).toBe("number");
    const all = lines.join("\n");
    expect(all).not.toContain("Padaria Exemplo");
    expect(all).not.toContain("Pão na chapa");
  });

  it("mock ponta a ponta (sem custo)", async () => {
    const db = fakeSupabase({ start_generation_job: [ok(1)], complete_generation_job: [ok(STRATEGY)] });
    const outcome = await run(db.client, createMockProvider(), { expected: { provider: "mock", model: null } });
    expect(outcome.status).toBe("succeeded");
    expect(db.calls[1]!.args.p_usage).toEqual({ input_tokens: 0, output_tokens: 0, cost_micro_usd: 0 });
  });
});

describe("abortQueuedJob", () => {
  it("inicia e falha sem nova tentativa", async () => {
    const db = fakeSupabase({ start_generation_job: [ok(1)], fail_generation_job: [ok("failed")] });
    await abortQueuedJob({
      supabase: db.client as never,
      jobId: JOB,
      code: "feature_disabled",
      correlationId: "corr-12345678",
    });
    expect(db.calls[1]!.args).toMatchObject({ p_error_code: "feature_disabled", p_retryable: false });
  });

  it("job que não está na fila é ignorado", async () => {
    const db = fakeSupabase({ start_generation_job: [err("P0001", "invalid_transition")] });
    await abortQueuedJob({ supabase: db.client as never, jobId: JOB, code: "feature_disabled", correlationId: "c" });
    expect(db.fns()).toEqual(["start_generation_job"]);
  });
});
