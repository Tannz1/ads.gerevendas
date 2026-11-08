import { z } from "zod";
import { uuidSchema } from "./common";

/**
 * Fluxo simples "Da foto ao cliente no WhatsApp" (ADR 0010). O dono parte de um produto com foto.
 * Preço e destaques são fatos que ele digitou e confirmou: viram `offers.price_cents` e
 * `offers.differentiators`, que a checagem de fatos aceita como confirmados.
 */

export const HIGHLIGHT_KINDS = ["parcelamento", "desconto", "entrega"] as const;
export type HighlightKind = (typeof HIGHLIGHT_KINDS)[number];

export const HIGHLIGHT_LABELS: Record<HighlightKind, { label: string; placeholder: string }> = {
  parcelamento: { label: "Parcelamento", placeholder: "Ex.: Até 3x sem juros" },
  desconto: { label: "Desconto", placeholder: "Ex.: 10% de desconto no Pix" },
  entrega: { label: "Entrega", placeholder: "Ex.: Entrega no mesmo dia em Maringá" },
};

const text = (min: number, max: number, label: string) =>
  z.string().trim().min(min, `${label}: mínimo de ${min} caracteres`).max(max, `${label}: máximo de ${max} caracteres`);

export const highlightSchema = z.object({
  kind: z.enum(HIGHLIGHT_KINDS),
  text: text(3, 80, "Destaque"),
});
export type Highlight = z.infer<typeof highlightSchema>;

export const productInputSchema = z.object({
  name: text(2, 120, "Nome do produto"),
  /** Uma frase opcional do dono. Sem ela, a descrição é montada só com o que ele digitou. */
  details: z.string().trim().max(400, "Detalhes: máximo de 400 caracteres").default(""),
  price_cents: z
    .number({ error: "Informe um preço válido, ex.: 299,90" })
    .int()
    .min(1, "Informe um preço maior que zero")
    .max(100_000_000)
    .nullable(),
  highlights: z
    .array(highlightSchema)
    .max(HIGHLIGHT_KINDS.length)
    .refine((h) => new Set(h.map((x) => x.kind)).size === h.length, "Um destaque de cada tipo")
    .default([]),
  photo_asset_id: uuidSchema.nullable(),
  facts_confirmed: z.literal(true, { error: "Confirme que preço e destaques são verdadeiros" }),
  request_key: z.string().trim().min(8).max(64),
});
export type ProductInput = z.input<typeof productInputSchema>;
export type Product = z.output<typeof productInputSchema>;

/** Descrição gravada na oferta (10 a 600 caracteres), feita só com o texto do próprio dono. */
export function productDescription(p: Pick<Product, "name" | "details" | "highlights">): string {
  const parts = [p.details || p.name, ...p.highlights.map((h) => h.text)];
  const out = parts.join(". ").replace(/\.\./g, ".");
  return (out.length >= 10 ? out : `${out}. Produto à venda`).slice(0, 600);
}

/**
 * Alcance do anúncio. A Meta recebe a cidade do cadastro com raio (17 a 80 km, ver campaign-payload).
 * Raio em volta do endereço da loja exige outro formato de pedido, sem teste de contrato ainda.
 */
export const REACH_OPTIONS = {
  cidade: { radius_km: 17, label: "Na cidade", hint: "Até 17 km do centro da cidade" },
  regiao: { radius_km: 40, label: "Cidade e região", hint: "Até 40 km, inclui cidades vizinhas" },
} as const;
export type ReachKey = keyof typeof REACH_OPTIONS;
export const reachKeySchema = z.enum(Object.keys(REACH_OPTIONS) as [ReachKey, ...ReachKey[]]);

export function reachFromRadius(radiusKm: number | null): ReachKey {
  return radiusKm !== null && radiusKm > REACH_OPTIONS.cidade.radius_km ? "regiao" : "cidade";
}

export const setReachSchema = z.object({ brief_id: uuidSchema, reach: reachKeySchema });

/** Valores por dia oferecidos na tela (centavos). Os limites reais ficam em CAMPAIGN_BUDGET_LIMITS. */
export const DAILY_BUDGET_CHOICES_CENTS = [1_000, 2_000, 3_000] as const;
export const DURATION_CHOICES_DAYS = [3, 5, 7, 10, 14, 30] as const;

export const recordSaleSchema = z.object({
  campaign_id: uuidSchema,
  quantity: z
    .number({ error: "Informe quantas vendas" })
    .int()
    .min(1, "Pelo menos 1 venda")
    .max(1000, "Máximo de 1000 por registro"),
  amount_cents: z.number().int().min(0).max(100_000_000).nullable(),
});
export type RecordSaleInput = z.infer<typeof recordSaleSchema>;
