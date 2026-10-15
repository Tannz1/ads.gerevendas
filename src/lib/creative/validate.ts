import type { z } from "zod";
import {
  checkDesignAgainstOffer,
  creativeDesignSchema,
  type CreativeDesign,
  type DesignIssue,
} from "@/contracts/creative";
import { hasUnsupportedChars } from "./typography";

/** Fatos da oferta necessários para validar o preço da peça. */
export type DesignOfferFacts = { price_cents: number | null; price_confirmed_by_client: boolean; currency: string };

type DesignField = keyof CreativeDesign;

const DESIGN_FIELDS: readonly DesignField[] = [
  "format",
  "template_key",
  "business_name",
  "headline",
  "body",
  "cta",
  "show_price",
  "price_cents",
  "currency",
  "brand_color",
  "background",
];

function isDesignField(key: unknown): key is DesignField {
  return typeof key === "string" && (DESIGN_FIELDS as readonly string[]).includes(key);
}

/** Mensagens em português por campo (as mensagens próprias do schema têm prioridade). */
function messageFor(field: DesignField | undefined, code: string): string {
  const small = code === "too_small";
  const big = code === "too_big";
  switch (field) {
    case "format":
      return "Escolha um formato válido (Feed 4:5 ou Stories 9:16).";
    case "template_key":
      return "Escolha um modelo de peça válido.";
    case "business_name":
      return small
        ? "Informe o nome do negócio."
        : big
          ? "Nome do negócio: máximo de 60 caracteres"
          : "Informe o nome do negócio.";
    case "headline":
      return small ? "Título muito curto" : big ? "Título: máximo de 40 caracteres" : "Informe o título.";
    case "body":
      return big ? "Texto: máximo de 90 caracteres" : "Texto inválido.";
    case "cta":
      return small ? "Botão muito curto" : big ? "Botão: máximo de 24 caracteres" : "Informe o texto do botão.";
    case "show_price":
      return "Indique se a peça mostra o preço.";
    case "price_cents":
      return "Preço inválido.";
    case "currency":
      return "Moeda inválida (use o código ISO, ex.: BRL).";
    case "brand_color":
      return "Cor em hexadecimal, ex.: #C2410C";
    case "background":
      return "Escolha um fundo válido.";
    default:
      return "Peça inválida.";
  }
}

const errorMap = (issue: { code?: string; path?: PropertyKey[] }) => {
  const key = issue.path?.[0];
  return messageFor(isDesignField(key) ? key : undefined, issue.code ?? "");
};

function issuesFromZod(error: z.ZodError): DesignIssue[] {
  const seen = new Set<string>();
  const issues: DesignIssue[] = [];
  for (const issue of error.issues) {
    const key = issue.path[0];
    const field: DesignIssue["field"] = isDesignField(key) ? key : "layout";
    // Uma mensagem por campo basta para o editor.
    if (seen.has(field)) continue;
    seen.add(field);
    issues.push({ field, message: issue.message });
  }
  return issues;
}

const TEXT_FIELDS: ReadonlyArray<[DesignField, string]> = [
  ["business_name", "O nome do negócio"],
  ["headline", "O título"],
  ["body", "O texto"],
  ["cta", "O botão"],
];

/** Caracteres que as fontes da peça não desenham (ex.: emojis) somem na exportação. */
function unsupportedCharIssues(design: CreativeDesign): DesignIssue[] {
  return TEXT_FIELDS.filter(([field]) => hasUnsupportedChars(design[field] as string)).map(([field, label]) => ({
    field,
    message: `${label} tem caracteres que não aparecem na peça (como emojis). Remova-os.`,
  }));
}

/** Regra de preço também para entradas que ainda não passaram no schema (feedback imediato). */
function offerIssuesFromRaw(input: unknown, offer: DesignOfferFacts): DesignIssue[] {
  if (typeof input !== "object" || input === null) return [];
  const raw = input as Record<string, unknown>;
  if (typeof raw.show_price !== "boolean" || typeof raw.currency !== "string") return [];
  const price = raw.price_cents;
  if (price !== null && typeof price !== "number") return [];
  return checkDesignAgainstOffer({ show_price: raw.show_price, price_cents: price, currency: raw.currency }, offer);
}

/**
 * Valida uma peça para o editor e para o servidor: schema do contrato (mensagens em português,
 * mapeadas por campo), caracteres que não aparecem na arte e — quando `offer` é informada —
 * a regra de veracidade do preço (`checkDesignAgainstOffer`).
 *
 * `design` só é devolvido quando o schema passa; `issues` vazio significa pronto para salvar.
 */
export function validateDesign(
  input: unknown,
  offer: DesignOfferFacts | null,
): { design: CreativeDesign | null; issues: DesignIssue[] } {
  const parsed = creativeDesignSchema.safeParse(input, { error: errorMap });
  if (!parsed.success) {
    const issues = issuesFromZod(parsed.error);
    if (offer) {
      for (const issue of offerIssuesFromRaw(input, offer)) {
        if (!issues.some((i) => i.field === issue.field)) issues.push(issue);
      }
    }
    return { design: null, issues };
  }
  const design = parsed.data;
  const issues = [...unsupportedCharIssues(design), ...(offer ? checkDesignAgainstOffer(design, offer) : [])];
  return { design, issues };
}

/** Converte problemas em `field_errors` do formato `ApiError`. */
export function issuesToFieldErrors(issues: readonly DesignIssue[]): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const issue of issues) (out[issue.field] ??= []).push(issue.message);
  return out;
}
