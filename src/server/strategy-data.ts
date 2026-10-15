import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ApiErrorCode } from "@/contracts/api";
import { creativeViewSchema, type CreativeView } from "@/contracts/creative";
import {
  conceptSchema,
  DAILY_GENERATION_LIMIT,
  generationJobSchema,
  jobErrorCodeSchema,
  strategyViewSchema,
  type Concept,
  type GenerationJob,
  type StrategyView,
} from "@/contracts/strategy";
import type { DesignFacts } from "@/lib/creative/defaults";
import { log } from "@/lib/logger";

/**
 * Camada de dados da fase 2 (estratégias, jobs e peças). Sempre com a sessão do usuário: o RLS
 * isola as organizações e as escritas passam por RPCs. Também concentra o mapeamento dos erros
 * das RPCs para o erro padrão da API (funções puras, testadas em unidade).
 */

/** Conteúdo gravado fora do contrato (não deveria acontecer; as RPCs validam). */
export class StoredContentError extends Error {
  constructor(
    readonly entity: "strategy" | "concept" | "creative" | "generation_job",
    readonly entityId: string,
  ) {
    super(`Conteúdo inválido em ${entity}`);
    this.name = "StoredContentError";
  }
}

/** Falha de consulta; a mensagem leva só o código do erro do banco. */
export class DataAccessError extends Error {
  constructor(what: string, code: string | undefined) {
    super(`Falha ao ler ${what}: ${code ?? "desconhecido"}`);
    this.name = "DataAccessError";
  }
}

// ---------------------------------------------------------------- briefs e estratégias

export type LatestBrief = { id: string; offer_id: string; business_id: string; created_at: string };

export async function getLatestSubmittedBrief(supabase: SupabaseClient, orgId: string): Promise<LatestBrief | null> {
  const { data, error } = await supabase
    .from("briefs")
    .select("id, offer_id, business_id, created_at")
    .eq("organization_id", orgId)
    .eq("status", "submitted")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<LatestBrief>();
  if (error) throw new DataAccessError("brief", error.code);
  return data ?? null;
}

type StrategyRow = {
  id: string;
  brief_id: string;
  version: number;
  provider: string;
  model: string | null;
  is_simulation: boolean;
  created_at: string;
  content: unknown;
};
type ConceptRow = { id: string; position: number; content: unknown };

/** Valida a estratégia gravada; conteúdo inválido é logado (sem conteúdo) e vira erro. */
export function parseStrategyView(row: StrategyRow, concepts: ConceptRow[]): StrategyView {
  const parsed = strategyViewSchema.safeParse({
    id: row.id,
    brief_id: row.brief_id,
    version: row.version,
    provider: row.provider,
    model: row.model,
    is_simulation: row.is_simulation,
    created_at: row.created_at,
    content: row.content,
    concepts: [...concepts]
      .sort((a, b) => a.position - b.position)
      .map((c) => ({ id: c.id, position: c.position, content: c.content })),
  });
  if (!parsed.success) {
    log("error", "strategy.invalid_stored_content", {
      strategy_id: row.id,
      issue_paths: parsed.error.issues.map((i) => i.path.join(".")).slice(0, 20),
    });
    throw new StoredContentError("strategy", row.id);
  }
  return parsed.data;
}

/** Última versão da estratégia do brief submetido mais recente (null se ainda não há). */
export async function loadLatestStrategy(supabase: SupabaseClient, orgId: string): Promise<StrategyView | null> {
  const brief = await getLatestSubmittedBrief(supabase, orgId);
  if (!brief) return null;

  const strategy = await supabase
    .from("strategies")
    .select("id, brief_id, version, provider, model, is_simulation, created_at, content")
    .eq("organization_id", orgId)
    .eq("brief_id", brief.id)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle<StrategyRow>();
  if (strategy.error) throw new DataAccessError("estratégia", strategy.error.code);
  if (!strategy.data) return null;

  const concepts = await supabase
    .from("creative_concepts")
    .select("id, position, content")
    .eq("organization_id", orgId)
    .eq("strategy_id", strategy.data.id)
    .order("position", { ascending: true })
    .overrideTypes<ConceptRow[], { merge: false }>();
  if (concepts.error) throw new DataAccessError("conceitos", concepts.error.code);

  return parseStrategyView(strategy.data, concepts.data ?? []);
}

// ---------------------------------------------------------------- jobs

const JOB_COLUMNS =
  "id, brief_id, status, attempts, max_attempts, error_code, provider, model, is_simulation, result_strategy_id, created_at, started_at, finished_at";

type JobRow = Omit<GenerationJob, "error_code"> & { brief_id: string; model: string | null; error_code: string | null };

export type JobRecord = { job: GenerationJob; brief_id: string; model: string | null };

export function parseJobRow(row: JobRow): JobRecord {
  // Código desconhecido (não deveria existir) vira "internal" em vez de quebrar a tela.
  const errorCode =
    row.error_code === null ? null : jobErrorCodeSchema.safeParse(row.error_code).success ? row.error_code : "internal";
  const parsed = generationJobSchema.safeParse({
    id: row.id,
    status: row.status,
    attempts: row.attempts,
    max_attempts: row.max_attempts,
    error_code: errorCode,
    provider: row.provider,
    is_simulation: row.is_simulation,
    result_strategy_id: row.result_strategy_id,
    created_at: row.created_at,
    started_at: row.started_at,
    finished_at: row.finished_at,
  });
  if (!parsed.success) throw new StoredContentError("generation_job", row.id);
  return { job: parsed.data, brief_id: row.brief_id, model: row.model };
}

export async function readGenerationJob(
  supabase: SupabaseClient,
  orgId: string,
  jobId: string,
): Promise<JobRecord | null> {
  const { data, error } = await supabase
    .from("generation_jobs")
    .select(JOB_COLUMNS)
    .eq("organization_id", orgId)
    .eq("id", jobId)
    .maybeSingle<JobRow>();
  if (error) throw new DataAccessError("job", error.code);
  return data ? parseJobRow(data) : null;
}

// ---------------------------------------------------------------- peças

export type OfferPrice = { price_cents: number | null; price_confirmed_by_client: boolean; currency: string };

const CREATIVE_COLUMNS = "id, concept_id, offer_id, status, version, design, updated_at, approved_at";
type CreativeRow = {
  id: string;
  concept_id: string | null;
  offer_id: string;
  status: string;
  version: number;
  design: unknown;
  updated_at: string;
  approved_at: string | null;
};

/** Linha → CreativeView validada; null se o design gravado estiver fora do contrato. */
export function parseCreativeRow(row: CreativeRow): CreativeView | null {
  const parsed = creativeViewSchema.safeParse({
    id: row.id,
    concept_id: row.concept_id,
    status: row.status,
    version: row.version,
    design: row.design,
    updated_at: row.updated_at,
    approved_at: row.approved_at,
  });
  if (!parsed.success) {
    log("error", "creative.invalid_stored_content", {
      creative_id: row.id,
      issue_paths: parsed.error.issues.map((i) => i.path.join(".")).slice(0, 20),
    });
    return null;
  }
  return parsed.data;
}

export async function readCreative(
  supabase: SupabaseClient,
  orgId: string,
  creativeId: string,
): Promise<{ creative: CreativeView; offer_id: string } | null> {
  const { data, error } = await supabase
    .from("creatives")
    .select(CREATIVE_COLUMNS)
    .eq("organization_id", orgId)
    .eq("id", creativeId)
    .maybeSingle<CreativeRow>();
  if (error) throw new DataAccessError("peça", error.code);
  if (!data) return null;
  const creative = parseCreativeRow(data);
  if (!creative) throw new StoredContentError("creative", data.id);
  return { creative, offer_id: data.offer_id };
}

export const CREATIVES_LIST_LIMIT = 50;

/** Peças mais recentes primeiro; linhas fora do contrato são puladas (e logadas). */
export async function listCreativeViews(supabase: SupabaseClient, orgId: string): Promise<CreativeView[]> {
  const { data, error } = await supabase
    .from("creatives")
    .select(CREATIVE_COLUMNS)
    .eq("organization_id", orgId)
    .order("updated_at", { ascending: false })
    .limit(CREATIVES_LIST_LIMIT)
    .overrideTypes<CreativeRow[], { merge: false }>();
  if (error) throw new DataAccessError("peças", error.code);
  return (data ?? []).map(parseCreativeRow).filter((c): c is CreativeView => c !== null);
}

export async function readOfferPrice(
  supabase: SupabaseClient,
  orgId: string,
  offerId: string,
): Promise<OfferPrice | null> {
  const { data, error } = await supabase
    .from("offers")
    .select("price_cents, price_confirmed_by_client, currency")
    .eq("organization_id", orgId)
    .eq("id", offerId)
    .maybeSingle<OfferPrice>();
  if (error) throw new DataAccessError("oferta", error.code);
  if (!data) return null;
  return {
    price_cents: data.price_confirmed_by_client ? data.price_cents : null,
    price_confirmed_by_client: data.price_confirmed_by_client,
    currency: data.currency.trim(),
  };
}

export type ConceptForCreative = { concept: Concept; designFacts: DesignFacts; offer: OfferPrice };

/** Conceito + oferta/negócio do brief de origem (conceito → estratégia → brief). */
export async function loadConceptForCreative(
  supabase: SupabaseClient,
  orgId: string,
  conceptId: string,
): Promise<ConceptForCreative | null> {
  const concept = await supabase
    .from("creative_concepts")
    .select("id, strategy_id, content")
    .eq("organization_id", orgId)
    .eq("id", conceptId)
    .maybeSingle<{ id: string; strategy_id: string; content: unknown }>();
  if (concept.error) throw new DataAccessError("conceito", concept.error.code);
  if (!concept.data) return null;

  const strategy = await supabase
    .from("strategies")
    .select("brief_id")
    .eq("organization_id", orgId)
    .eq("id", concept.data.strategy_id)
    .maybeSingle<{ brief_id: string }>();
  if (strategy.error) throw new DataAccessError("estratégia", strategy.error.code);
  if (!strategy.data) return null;

  const brief = await supabase
    .from("briefs")
    .select("offer_id, business_id")
    .eq("organization_id", orgId)
    .eq("id", strategy.data.brief_id)
    .maybeSingle<{ offer_id: string; business_id: string }>();
  if (brief.error) throw new DataAccessError("brief", brief.error.code);
  if (!brief.data) return null;

  const [offer, business] = await Promise.all([
    readOfferPrice(supabase, orgId, brief.data.offer_id),
    supabase
      .from("businesses")
      .select("name, brand_primary_color")
      .eq("organization_id", orgId)
      .eq("id", brief.data.business_id)
      .maybeSingle<{ name: string; brand_primary_color: string | null }>(),
  ]);
  if (business.error) throw new DataAccessError("negócio", business.error.code);
  if (!offer || !business.data) return null;

  const parsed = conceptSchema.safeParse(concept.data.content);
  if (!parsed.success) {
    log("error", "concept.invalid_stored_content", {
      concept_id: concept.data.id,
      issue_paths: parsed.error.issues.map((i) => i.path.join(".")).slice(0, 20),
    });
    throw new StoredContentError("concept", concept.data.id);
  }

  return {
    concept: parsed.data,
    designFacts: {
      business_name: business.data.name,
      brand_color: business.data.brand_primary_color,
      price_cents: offer.price_cents,
      currency: offer.currency,
    },
    offer,
  };
}

// ---------------------------------------------------------------- erros das RPCs

export type RpcErrorLike = { code?: string | null; message?: string | null };
export type MappedApiError = { code: ApiErrorCode; message: string; field_errors?: Record<string, string[]> };

/** Erros de negócio vêm como SQLSTATE P0001 com a mensagem = código (ver docs/08_CONTRATOS.md). */
export function businessErrorCode(error: RpcErrorLike): string | null {
  return error.code === "P0001" && error.message ? error.message.trim() : null;
}

const FORBIDDEN: MappedApiError = { code: "forbidden", message: "Sem permissão para esta empresa." };

export function mapEnqueueError(error: RpcErrorLike): MappedApiError {
  if (error.code === "42501") return FORBIDDEN;
  switch (businessErrorCode(error)) {
    case "generation_quota_exceeded":
      return {
        code: "quota_exceeded",
        message: `Você atingiu o limite de ${DAILY_GENERATION_LIMIT} gerações em 24 horas. Tente novamente mais tarde.`,
      };
    case "brief_not_ready":
      return { code: "brief_not_ready", message: "Conclua o cadastro do negócio antes de gerar a estratégia." };
  }
  // Mesma chave de idempotência em pedidos simultâneos.
  if (error.code === "23505") return { code: "conflict", message: "Já existe um pedido igual em andamento." };
  return { code: "internal", message: "Não foi possível pedir a geração agora. Tente novamente." };
}

export const PRICE_NOT_CONFIRMED_MESSAGE = "A oferta não tem preço confirmado; a peça não pode mostrar preço.";
export const PRICE_MISMATCH_MESSAGE = "O preço da peça precisa ser igual ao preço confirmado da oferta.";

export function mapCreativeRpcError(error: RpcErrorLike): MappedApiError {
  if (error.code === "42501") return { code: "forbidden", message: "Peça não encontrada ou sem permissão." };
  switch (businessErrorCode(error)) {
    case "version_conflict":
      return {
        code: "conflict",
        message: "Esta peça foi alterada em outra aba ou por outra pessoa. Recarregue para ver a versão mais recente.",
      };
    case "price_not_confirmed":
      return {
        code: "validation_failed",
        message: PRICE_NOT_CONFIRMED_MESSAGE,
        field_errors: { show_price: [PRICE_NOT_CONFIRMED_MESSAGE] },
      };
    case "price_mismatch":
      return {
        code: "validation_failed",
        message: PRICE_MISMATCH_MESSAGE,
        field_errors: { price_cents: [PRICE_MISMATCH_MESSAGE] },
      };
  }
  if (error.code === "23514" || error.code === "22P02") {
    return { code: "validation_failed", message: "A peça tem dados fora do formato aceito." };
  }
  return { code: "internal", message: "Não foi possível salvar a peça agora. Tente novamente." };
}
