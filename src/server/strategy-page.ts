import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { objectiveSchema, type Objective } from "@/contracts/onboarding";
import type { BriefFacts, GenerationJob, StrategyView } from "@/contracts/strategy";
import { serverEnv } from "@/lib/env";
import { resolveFlags } from "@/lib/flags";
import { log } from "@/lib/logger";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadBriefFacts } from "./ai/facts";
import { getAiProvider, isProviderUnavailableError } from "./ai/provider";
import { DataAccessError, getLatestSubmittedBrief, loadLatestStrategy, parseJobRow } from "./strategy-data";

/**
 * Leituras das telas da fase 2 (estratégia, peças e início). Sempre com a sessão do usuário
 * (RLS); nada aqui escreve. As escritas ficam nas server actions de `generation.ts` e
 * `creatives.ts`.
 */

export type AiAvailability = { state: "available"; simulation: boolean } | { state: "unavailable" };

/** Modo da IA para a mensagem da tela: simulação (mock), real ou indisponível (sem config/kill switch). */
export function aiAvailability(): AiAvailability {
  try {
    const env = serverEnv();
    const provider = getAiProvider(env, resolveFlags(env));
    return { state: "available", simulation: provider.isSimulation };
  } catch (error) {
    if (isProviderUnavailableError(error)) return { state: "unavailable" };
    throw error;
  }
}

const JOB_COLUMNS =
  "id, brief_id, status, attempts, max_attempts, error_code, provider, model, is_simulation, result_strategy_id, created_at, started_at, finished_at";

/** Job em andamento (na fila ou rodando) do brief, se houver. */
export async function readActiveJob(
  supabase: SupabaseClient,
  orgId: string,
  briefId: string,
): Promise<GenerationJob | null> {
  const { data, error } = await supabase
    .from("generation_jobs")
    .select(JOB_COLUMNS)
    .eq("organization_id", orgId)
    .eq("brief_id", briefId)
    .in("status", ["queued", "running"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<Parameters<typeof parseJobRow>[0]>();
  if (error) throw new DataAccessError("job", error.code);
  return data ? parseJobRow(data).job : null;
}

export type StrategyPageData =
  | { brief: null }
  | { brief: { id: string }; facts: BriefFacts; strategy: StrategyView | null; activeJob: GenerationJob | null };

/** Dados da tela de estratégia: brief submetido, fatos (prévias), última estratégia e job ativo. */
export async function loadStrategyPageData(orgId: string): Promise<StrategyPageData> {
  const supabase = await createSupabaseServerClient();
  const brief = await getLatestSubmittedBrief(supabase, orgId);
  if (!brief) return { brief: null };
  const [facts, strategy, activeJob] = await Promise.all([
    loadBriefFacts(supabase, orgId, brief.id),
    loadLatestStrategy(supabase, orgId),
    readActiveJob(supabase, orgId, brief.id),
  ]);
  return { brief: { id: brief.id }, facts, strategy, activeJob };
}

export type Phase2Summary = { strategyVersion: number | null; creatives: { total: number; approved: number } };

/** Resumo barato para o início: versão da estratégia atual e contagem de peças. */
export async function loadPhase2Summary(orgId: string): Promise<Phase2Summary> {
  const supabase = await createSupabaseServerClient();
  const brief = await getLatestSubmittedBrief(supabase, orgId);
  const [strategy, total, approved] = await Promise.all([
    brief
      ? supabase
          .from("strategies")
          .select("version")
          .eq("organization_id", orgId)
          .eq("brief_id", brief.id)
          .order("version", { ascending: false })
          .limit(1)
          .maybeSingle<{ version: number }>()
      : Promise.resolve({ data: null, error: null }),
    supabase.from("creatives").select("id", { count: "exact", head: true }).eq("organization_id", orgId),
    supabase
      .from("creatives")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId)
      .eq("status", "approved"),
  ]);
  if (strategy.error) throw new DataAccessError("estratégia", strategy.error.code);
  if (total.error) throw new DataAccessError("peças", total.error.code);
  if (approved.error) throw new DataAccessError("peças", approved.error.code);
  return {
    strategyVersion: strategy.data?.version ?? null,
    creatives: { total: total.count ?? 0, approved: approved.count ?? 0 },
  };
}

/** Objetivo do brief que originou a peça (conceito → estratégia → brief); null se não der para saber. */
export async function readCreativeObjective(orgId: string, conceptId: string | null): Promise<Objective | null> {
  if (!conceptId) return null;
  try {
    const supabase = await createSupabaseServerClient();
    const concept = await supabase
      .from("creative_concepts")
      .select("strategy_id")
      .eq("organization_id", orgId)
      .eq("id", conceptId)
      .maybeSingle<{ strategy_id: string }>();
    if (concept.error || !concept.data) return null;
    const strategy = await supabase
      .from("strategies")
      .select("brief_id")
      .eq("organization_id", orgId)
      .eq("id", concept.data.strategy_id)
      .maybeSingle<{ brief_id: string }>();
    if (strategy.error || !strategy.data) return null;
    const brief = await supabase
      .from("briefs")
      .select("objective")
      .eq("organization_id", orgId)
      .eq("id", strategy.data.brief_id)
      .maybeSingle<{ objective: string }>();
    if (brief.error || !brief.data) return null;
    const parsed = objectiveSchema.safeParse(brief.data.objective);
    return parsed.success ? parsed.data : null;
  } catch (error) {
    // Sem o objetivo o editor oferece todos os botões; não impede a edição.
    log("warn", "creative.objective_unavailable", { error_name: error instanceof Error ? error.name : "unknown" });
    return null;
  }
}
