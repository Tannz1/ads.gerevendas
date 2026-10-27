import type { StrategyPlan } from "@/contracts/creatives";
import { parseBRLToCents } from "@/lib/money";

export type ConfirmedFacts = {
  /** Preço confirmado pelo cliente no onboarding; null quando não informado. */
  price_cents: number | null;
  /** Texto que o próprio cliente escreveu (descrição e diferenciais): termos ali são permitidos. */
  confirmed_text: string;
};

// Promessas que a IA não pode fazer sem o cliente ter dito (AGENTS.md: "A IA gera propostas, não fatos").
const PROMISES: Array<[RegExp, string]> = [
  [/\d\s*%/, "percentual"],
  [/desconto/, "desconto"],
  [/gr[aá]tis|gratuit/, "grátis"],
  [/garanti/, "garantia"],
  [/promo[cç]/, "promoção"],
  [/[uú]ltimas unidades|s[oó] hoje|por tempo limitado/, "escassez"],
  [/depoimento|avalia[cç][aã]o de clientes/, "depoimento"],
];

const PRICE = /R\$\s*(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:,\d{1,2})?)/gi;

const norm = (s: string) => s.toLocaleLowerCase("pt-BR");

/** Devolve as violações encontradas (vazio = plano pode ser gravado). Função pura. */
export function checkFacts(plan: StrategyPlan, facts: ConfirmedFacts): string[] {
  return checkTexts(
    [plan.business_summary, ...plan.angles.flatMap((a) => [a.label, a.rationale, a.headline, a.body, a.cta])],
    facts,
  );
}

/** Mesma checagem para textos soltos (ex.: roteiro do vídeo). */
export function checkTexts(texts: string[], facts: ConfirmedFacts): string[] {
  const confirmed = norm(facts.confirmed_text);
  const violations: string[] = [];

  for (const t of texts) {
    for (const m of t.matchAll(PRICE)) {
      if (facts.price_cents === null || parseBRLToCents(m[1]) !== facts.price_cents) {
        violations.push(`preço não confirmado: "${m[0]}"`);
      }
    }
    const lower = norm(t);
    for (const [re, label] of PROMISES) {
      if (re.test(lower) && !re.test(confirmed)) violations.push(`${label} sem confirmação: "${t}"`);
    }
  }
  return violations;
}
