import { z } from "zod";
import { creativeDesignSchema, type CreativeDesign } from "@/contracts/creative";
import {
  briefFactsSchema,
  generatedStrategySchema,
  type BriefFacts,
  type GeneratedStrategy,
} from "@/contracts/strategy";
import type { DesignFacts } from "@/lib/creative/defaults";

/**
 * Modo demonstração (sem Supabase): estratégia e peças ficam só neste navegador. Tudo que é lido
 * do localStorage é validado pelos contratos; o que estiver fora do formato é ignorado.
 * Nada aqui é enviado a servidores (exceto a geração de PNG, que não grava nada).
 */

export const DEMO_STRATEGY_KEY = "gv-ads:strategy:v1";
export const DEMO_CREATIVES_KEY = "gv-ads:creatives:v1";
export const DEMO_ID_PREFIX = "demo-";

const demoStrategySchema = z.object({
  generated: generatedStrategySchema,
  facts: briefFactsSchema,
  created_at: z.string(),
  version: z.number().int().positive(),
});
export type DemoStrategy = z.infer<typeof demoStrategySchema>;

const demoCreativeSchema = z.object({
  id: z.string().regex(/^demo-[0-9a-f-]{36}$/),
  concept_index: z.number().int().min(0).max(4),
  design: creativeDesignSchema,
  status: z.enum(["draft", "approved"]),
  version: z.number().int().positive(),
  updated_at: z.string(),
  approved_at: z.string().nullable(),
});
export type DemoCreative = z.infer<typeof demoCreativeSchema>;

/** UUID v4 com fallback para contextos sem `crypto.randomUUID` (http fora de localhost). */
export function newUuid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    try {
      return crypto.randomUUID();
    } catch {
      // contexto inseguro: segue para o fallback
    }
  }
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function isDemoCreativeId(id: string): boolean {
  return id.startsWith(DEMO_ID_PREFIX);
}

function readJson(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as unknown) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------- estratégia

export function readDemoStrategy(): DemoStrategy | null {
  const parsed = demoStrategySchema.safeParse(readJson(DEMO_STRATEGY_KEY));
  return parsed.success ? parsed.data : null;
}

/** Grava uma nova versão da estratégia simulada (versão anterior + 1). */
export function saveDemoStrategy(generated: GeneratedStrategy, facts: BriefFacts): DemoStrategy | null {
  const previous = readDemoStrategy();
  const next: DemoStrategy = {
    generated,
    facts,
    created_at: new Date().toISOString(),
    version: (previous?.version ?? 0) + 1,
  };
  return writeJson(DEMO_STRATEGY_KEY, next) ? next : null;
}

/** Fatos usados para montar peças (preço só quando confirmado: `facts.price_cents` já vem null). */
export function designFactsFrom(facts: BriefFacts): DesignFacts {
  return {
    business_name: facts.business_name,
    brand_color: facts.brand_primary_color,
    price_cents: facts.price_cents,
    currency: facts.currency,
  };
}

/** Oferta para validar o preço das peças no editor (mesma regra do servidor). */
export function demoOfferFrom(facts: BriefFacts | null) {
  return {
    price_cents: facts?.price_cents ?? null,
    price_confirmed_by_client: facts !== null && facts.price_cents !== null,
    currency: facts?.currency ?? "BRL",
  };
}

// ---------------------------------------------------------------- peças

function readCreativeMap(): Record<string, DemoCreative> {
  const raw = readJson(DEMO_CREATIVES_KEY);
  const out: Record<string, DemoCreative> = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
    const parsed = demoCreativeSchema.safeParse(value);
    if (parsed.success && parsed.data.id === id) out[id] = parsed.data;
  }
  return out;
}

/** Peças mais recentes primeiro. */
export function listDemoCreatives(): DemoCreative[] {
  return Object.values(readCreativeMap()).sort((a, b) => b.updated_at.localeCompare(a.updated_at));
}

export function readDemoCreative(id: string): DemoCreative | null {
  return readCreativeMap()[id] ?? null;
}

export function createDemoCreative(input: { concept_index: number; design: CreativeDesign }): DemoCreative | null {
  const design = creativeDesignSchema.safeParse(input.design);
  if (!design.success) return null;
  const map = readCreativeMap();
  const creative: DemoCreative = {
    id: `${DEMO_ID_PREFIX}${newUuid()}`,
    concept_index: input.concept_index,
    design: design.data,
    status: "draft",
    version: 1,
    updated_at: new Date().toISOString(),
    approved_at: null,
  };
  map[creative.id] = creative;
  return writeJson(DEMO_CREATIVES_KEY, map) ? creative : null;
}

export type DemoWriteResult =
  { ok: true; creative: DemoCreative } | { ok: false; reason: "not_found" | "conflict" | "invalid" | "storage" };

/** Salva com a mesma regra do servidor: versão esperada (concorrência otimista) e volta a rascunho. */
export function saveDemoCreative(id: string, expectedVersion: number, design: CreativeDesign): DemoWriteResult {
  const parsed = creativeDesignSchema.safeParse(design);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  const map = readCreativeMap();
  const current = map[id];
  if (!current) return { ok: false, reason: "not_found" };
  if (current.version !== expectedVersion) return { ok: false, reason: "conflict" };
  const next: DemoCreative = {
    ...current,
    design: parsed.data,
    status: "draft",
    approved_at: null,
    version: current.version + 1,
    updated_at: new Date().toISOString(),
  };
  map[id] = next;
  return writeJson(DEMO_CREATIVES_KEY, map) ? { ok: true, creative: next } : { ok: false, reason: "storage" };
}

/** Aprova a versão atual (não publica nada). */
export function approveDemoCreative(id: string, version: number): DemoWriteResult {
  const map = readCreativeMap();
  const current = map[id];
  if (!current) return { ok: false, reason: "not_found" };
  if (current.version !== version) return { ok: false, reason: "conflict" };
  const now = new Date().toISOString();
  const next: DemoCreative = { ...current, status: "approved", approved_at: now, updated_at: now };
  map[id] = next;
  return writeJson(DEMO_CREATIVES_KEY, map) ? { ok: true, creative: next } : { ok: false, reason: "storage" };
}

/** Recomeçar a demonstração apaga também a estratégia e as peças simuladas. */
export function clearDemoStrategyAndCreatives(): void {
  for (const key of [DEMO_STRATEGY_KEY, DEMO_CREATIVES_KEY]) {
    try {
      localStorage.removeItem(key);
    } catch {
      // armazenamento indisponível: nada a apagar
    }
  }
}
