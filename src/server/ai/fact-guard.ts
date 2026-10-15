import type { BriefFacts, GeneratedStrategy } from "@/contracts/strategy";

/**
 * Fact-guard: confere o texto gerado contra os fatos confirmados do brief (ADR 0003, item 5).
 * A IA PROPÕE; tudo que parecer afirmação (número, preço, desconto, garantia, superlativo,
 * depoimento, urgência) só passa se estiver nas informações que o cliente confirmou.
 *
 * Módulo puro (sem segredos nem I/O): pode ser usado no servidor e em testes.
 */

export type FactIssue = { path: string; message: string };

/** Minúsculas e sem acentos: "Grátis", "GRATIS" e "grátis" comparam igual. */
export function normalizeForFacts(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** Normaliza mantendo um mapa de posições para citar o trecho original nas mensagens. */
function normalizeWithMap(text: string): { norm: string; map: number[] } {
  let norm = "";
  const map: number[] = [];
  let index = 0;
  for (const ch of text) {
    const n = normalizeForFacts(ch);
    for (let k = 0; k < n.length; k++) map.push(index);
    norm += n;
    index += ch.length;
  }
  map.push(index);
  return { norm, map };
}

function originalSlice(source: string, map: number[], start: number, end: number): string {
  return source.slice(map[start] ?? 0, map[end] ?? source.length).trim();
}

const NUMBER_RE = /\d+(?:[.,]\d+)*/g;

/**
 * Valores numéricos de um token ("1.200" → [1200], "24,90" → [24.9], "6" → [6]).
 * Listas ambíguas ("1,2,3") viram cada parte inteira.
 */
export function numberValues(token: string): number[] {
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(token)) return [Number(token.replace(/\./g, "").replace(",", "."))];
  const separators = token.match(/[.,]/g)?.length ?? 0;
  if (separators === 0) return [Number(token)];
  if (separators === 1) return [Number(token.replace(",", "."))];
  return token.split(/[.,]/).map(Number);
}

/** Chave inteira (centésimos) para comparar números sem erro de ponto flutuante. */
const numberKey = (n: number) => Math.round(n * 100);

function formatBRL(cents: number): string {
  const reais = Math.floor(cents / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${reais},${String(cents % 100).padStart(2, "0")}`;
}

type TermKind = "promo" | "claim" | "testimonial" | "urgency";

type TermRule = {
  kind: TermKind;
  /** Padrão procurado no texto gerado (já normalizado). */
  pattern: RegExp;
  /** Se este padrão aparecer nos fatos, o termo está confirmado pelo cliente. */
  factPattern: RegExp;
};

const KIND_MESSAGES: Record<TermKind, string> = {
  promo: "promoção, desconto ou gratuidade que não está nas informações confirmadas",
  claim: "garantia, superlativo ou ranking sem comprovação nas informações confirmadas",
  testimonial: "depoimento ou avaliação de clientes que não foi confirmado",
  urgency: "urgência que não está nas informações confirmadas",
};

const same = (pattern: RegExp): Pick<TermRule, "pattern" | "factPattern"> => ({ pattern, factPattern: pattern });

const TERM_RULES: TermRule[] = [
  // (c) promoções, descontos e gratuidade
  { kind: "promo", pattern: /%/, factPattern: /%/ },
  { kind: "promo", pattern: /\bdescontos?\b/, factPattern: /\bdescont/ },
  { kind: "promo", pattern: /\bgratis\b|\bgratuit(?:[oa]s?|amente)\b/, factPattern: /\bgratis\b|\bgratuit/ },
  { kind: "promo", pattern: /\bpromoc(?:ao|oes|ional|ionais)\b/, factPattern: /\bpromoc/ },
  { kind: "promo", pattern: /\bliquidac(?:ao|oes)\b/, factPattern: /\bliquidac/ },
  { kind: "promo", pattern: /\bcupo(?:m|ns)\b/, factPattern: /\bcupo/ },
  { kind: "promo", pattern: /\bbrindes?\b/, factPattern: /\bbrinde/ },
  { kind: "promo", ...same(/\bqueima\s+de\s+estoque\b/) },
  { kind: "promo", ...same(/\bmetade\s+do\s+preco\b/) },
  { kind: "promo", ...same(/\bblack\s+friday\b/) },
  { kind: "promo", pattern: /\bleve\s+(?:\S+\s+){1,2}pague\b/, factPattern: /\bleve\b[^.]*\bpague\b/ },
  // (d) garantias, superlativos e rankings
  { kind: "claim", pattern: /\bgarant(?:ia|ias|ido|ida|idos|idas|imos|e|em)\b/, factPattern: /\bgarant/ },
  { kind: "claim", pattern: /\b(?:o|a|os|as)\s+melhor(?:es)?\b/, factPattern: /\bmelhor/ },
  {
    kind: "claim",
    pattern: /\bmelhor(?:es)?\s+d[aoe]s?\s+(?:cidade|bairro|regiao|brasil|mundo|estado|zona|pais)\b/,
    factPattern: /\bmelhor/,
  },
  { kind: "claim", ...same(/\bn\s?[º°]\s*1\b|\bn\.\s*1\b|\bnumero\s+(?:1|um)\b|#\s*1\b/) },
  { kind: "claim", pattern: /\blider(?:es)?\b/, factPattern: /\blider/ },
  { kind: "claim", ...same(/\b100\s*%|\bcem\s+por\s+cento\b/) },
  { kind: "claim", pattern: /\bcomprovad(?:o|a|os|as|amente)\b/, factPattern: /\bcomprovad/ },
  { kind: "claim", ...same(/\bcientificamente\b/) },
  { kind: "claim", pattern: /\baprovad[oa]s?\s+(?:por|pel[oa]s?)\b/, factPattern: /\baprovad/ },
  { kind: "claim", pattern: /\brecomendad[oa]s?\s+(?:por|pel[oa]s?)\b/, factPattern: /\brecomendad/ },
  { kind: "claim", pattern: /\bmais\s+vendid[oa]s?\b/, factPattern: /\bmais\s+vendid/ },
  { kind: "claim", pattern: /\b(?:o|a)\s+unic[oa]\b/, factPattern: /\bunic[oa]/ },
  { kind: "claim", pattern: /\bpremiad[oa]s?\b/, factPattern: /\bpremi/ },
  {
    kind: "claim",
    ...same(/\b(?:imbative(?:l|is)|inigualave(?:l|is)|incomparave(?:l|is)|insuperave(?:l|is)|imperdive(?:l|is))\b/),
  },
  // (e) depoimentos e avaliações
  { kind: "testimonial", pattern: /\bdepoimentos?\b/, factPattern: /\bdepoiment/ },
  { kind: "testimonial", pattern: /\bavaliac(?:ao|oes)\b/, factPattern: /\bavaliac/ },
  { kind: "testimonial", pattern: /\bestrelas\b|\d\s*estrela\b/, factPattern: /\bestrela/ },
  { kind: "testimonial", ...same(/[★☆⭐]/u) },
  { kind: "testimonial", pattern: /\bnota\s+(?:maxima|\d)/, factPattern: /\bnota\b/ },
  { kind: "testimonial", ...same(/\bsegundo\s+(?:os\s+)?(?:nossos\s+)?clientes\b/) },
  {
    kind: "testimonial",
    ...same(/\bclientes\s+(?:dizem|aprovam|amam|adoram|recomendam|elogiam|garantem|falam|satisfeitos|felizes)\b/),
  },
  // (f) urgência falsa
  { kind: "urgency", ...same(/\bso\s+hoje\b/) },
  { kind: "urgency", ...same(/\bultim[oa]s?\s+(?:unidades?|vagas?|pecas?|dias|horas|chances?|lugares)\b/) },
  { kind: "urgency", ...same(/\bpor\s+tempo\s+limitado\b/) },
  { kind: "urgency", ...same(/\b(?:acaba|termina|encerra)\s+hoje\b/) },
  { kind: "urgency", pattern: /\bcorra(?:m)?\b/, factPattern: /\bcorra/ },
  { kind: "urgency", ...same(/\b(?:estoque|vagas|unidades)\s+limitad[oa]s?\b/) },
  { kind: "urgency", ...same(/\brelampago\b/) },
  { kind: "urgency", ...same(/\bagora\s+ou\s+nunca\b/) },
];

/** Fala entre aspas (curtas não contam). */
const QUOTE_RE = /["“”«»„]([^"“”«»„]{6,})["“”«»„]/g;
/** Atribuição a clientes perto de uma citação. */
const ATTRIBUTION_RE =
  /\b(?:clientes?|disse|disseram|diz|dizem|afirma|afirmam|comenta|comentam|relata|relatam|elogia|elogiam)\b/;
const DASH_ATTRIBUTION_RE = /^\s*[-–—]\s*\p{L}/u;

/** Formatos e dimensões das peças: não são afirmações sobre o negócio. */
const FORMAT_TOKENS_RE = /\b(?:4\s*[:x×]\s*5|9\s*[:x×]\s*16|1080\s*[x×]\s*(?:1350|1920))\b/g;

const MONEY_RES = [/r\$\s*(\d+(?:[.,]\d+)*)/g, /(\d+(?:[.,]\d+)*)\s*(?:reais|real)\b/g];

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export type FactChecker = {
  /**
   * Confere um texto. `adFacing` = texto que vai na peça/anúncio (título, texto, texto principal);
   * nesses não há exceção para formatos como "4:5".
   */
  check(path: string, text: string, options?: { adFacing?: boolean }): FactIssue[];
};

/** Prepara os fatos uma vez e devolve um verificador reutilizável. */
export function createFactChecker(facts: BriefFacts): FactChecker {
  const factTexts = [
    facts.business_name,
    facts.segment,
    facts.city,
    facts.state,
    facts.offer_name,
    facts.offer_description,
    ...facts.differentiators,
    facts.audience_description,
  ];
  const corpus = normalizeForFacts(factTexts.join("\n"));

  const allowedNumbers = new Set<number>();
  for (const token of corpus.match(NUMBER_RE) ?? []) {
    for (const value of numberValues(token)) allowedNumbers.add(numberKey(value));
  }
  for (const value of [facts.age_min, facts.age_max, facts.service_radius_km]) {
    if (value !== null) allowedNumbers.add(numberKey(value));
  }
  if (facts.price_cents !== null) {
    allowedNumbers.add(facts.price_cents);
    allowedNumbers.add(numberKey(Math.floor(facts.price_cents / 100)));
  }

  const rules: TermRule[] = [...TERM_RULES];
  const city = normalizeForFacts(facts.city).trim();
  if (city) {
    const pattern = new RegExp(`\\bmelhor(?:es)?\\s+(?:de|em)\\s+${escapeRegExp(city)}\\b`);
    rules.push({ kind: "claim", pattern, factPattern: /\bmelhor/ });
  }
  const confirmedRules = rules.map((rule) => ({ ...rule, confirmed: rule.factPattern.test(corpus) }));

  function check(path: string, text: string, options: { adFacing?: boolean } = {}): FactIssue[] {
    const issues: FactIssue[] = [];
    const { norm, map } = normalizeWithMap(text);
    const quote = (start: number, end: number) => originalSlice(text, map, start, end);

    // Formatos de peça (4:5, 9:16) só são aceitos fora do texto do anúncio.
    const scan = options.adFacing ? norm : norm.replace(FORMAT_TOKENS_RE, (m) => " ".repeat(m.length));

    // (b) valores em dinheiro
    const moneySpans: Array<[number, number]> = [];
    for (const re of MONEY_RES) {
      for (const match of scan.matchAll(re)) {
        const start = match.index ?? 0;
        const end = start + match[0].length;
        moneySpans.push([start, end]);
        const amount = quote(start, end);
        if (facts.price_cents === null) {
          issues.push({ path, message: `Menciona valor (${amount}), mas o cliente não confirmou preço.` });
          continue;
        }
        const values = numberValues(match[1] ?? "");
        if (values.length !== 1 || numberKey(values[0] ?? NaN) !== facts.price_cents) {
          issues.push({
            path,
            message: `Valor ${amount} diferente do preço confirmado (R$ ${formatBRL(facts.price_cents)}).`,
          });
        }
      }
    }

    // (a) todo número precisa estar nos fatos
    for (const match of scan.matchAll(NUMBER_RE)) {
      const start = match.index ?? 0;
      if (moneySpans.some(([s, e]) => start >= s && start < e)) continue;
      const values = numberValues(match[0]);
      if (values.every((v) => allowedNumbers.has(numberKey(v)))) continue;
      issues.push({ path, message: `Número "${match[0]}" não aparece nas informações confirmadas.` });
    }

    // (c)-(f) termos de promoção, garantia, depoimento e urgência
    for (const rule of confirmedRules) {
      if (rule.confirmed) continue;
      const match = rule.pattern.exec(scan);
      if (!match) continue;
      const start = match.index;
      const found = quote(start, start + match[0].length) || match[0];
      issues.push({ path, message: `"${found}": ${KIND_MESSAGES[rule.kind]}.` });
    }

    // (e) fala entre aspas atribuída a clientes
    for (const match of scan.matchAll(QUOTE_RE)) {
      const inner = (match[1] ?? "").trim();
      if (inner && corpus.includes(inner)) continue;
      const after = scan.slice((match.index ?? 0) + match[0].length);
      if (DASH_ATTRIBUTION_RE.test(after) || ATTRIBUTION_RE.test(scan)) {
        issues.push({
          path,
          message: "Fala entre aspas atribuída a clientes: depoimentos não podem ser inventados.",
        });
        break;
      }
    }

    return issues;
  }

  return { check };
}

/** Atalho para conferir um único texto. */
export function checkTextAgainstFacts(text: string, facts: BriefFacts, path = "texto"): FactIssue[] {
  return createFactChecker(facts).check(path, text, { adFacing: true });
}

/**
 * Confere toda a saída gerada. Avisos (`cautions`) não são conferidos: são orientações ao
 * dono do negócio e costumam citar justamente o que não pode aparecer.
 */
export function checkGeneratedAgainstFacts(gen: GeneratedStrategy, facts: BriefFacts): FactIssue[] {
  const checker = createFactChecker(facts);
  const issues: FactIssue[] = [];
  const s = gen.strategy;

  issues.push(...checker.check("strategy.summary", s.summary));
  issues.push(...checker.check("strategy.positioning", s.positioning));
  s.audience_insights.forEach((t, i) => issues.push(...checker.check(`strategy.audience_insights[${i}]`, t)));
  s.key_messages.forEach((t, i) => issues.push(...checker.check(`strategy.key_messages[${i}]`, t)));
  issues.push(...checker.check("strategy.channel_note", s.channel_note));

  gen.concepts.forEach((c, i) => {
    const p = `concepts[${i}]`;
    issues.push(...checker.check(`${p}.title`, c.title));
    issues.push(...checker.check(`${p}.rationale`, c.rationale));
    issues.push(...checker.check(`${p}.headline`, c.headline, { adFacing: true }));
    issues.push(...checker.check(`${p}.body`, c.body, { adFacing: true }));
    issues.push(...checker.check(`${p}.primary_text`, c.primary_text, { adFacing: true }));
    issues.push(...checker.check(`${p}.visual_direction`, c.visual_direction));
    if (c.show_price && facts.price_cents === null) {
      issues.push({ path: `${p}.show_price`, message: "show_price só pode ser true quando há preço confirmado." });
    }
  });

  return issues;
}

/** Índice do conceito de um caminho ("concepts[2].headline" → 2); null para a estratégia. */
export function conceptIndexOfPath(path: string): number | null {
  const match = /^concepts\[(\d+)\]/.exec(path);
  return match ? Number(match[1]) : null;
}
