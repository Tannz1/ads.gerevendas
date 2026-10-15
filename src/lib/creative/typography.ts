import type { CreativeFormat, TemplateKey } from "@/contracts/strategy";

/**
 * Tipografia determinística das peças. Cada caixa de texto tem largura e altura máxima fixas;
 * o tamanho da fonte desce em degraus conforme o comprimento do texto, de modo que os textos
 * dentro dos limites do contrato (título 40, texto 90, botão 24) caibam por construção.
 *
 * O modelo é conservador: considera ~0,6 em por caractere (a média real em português fica
 * entre 0,49 e 0,56 em nas fontes usadas) e perda de ~18% por quebra de linha entre palavras.
 * Casos extremos (tudo em maiúsculas largas, palavras gigantes) são detectados pelo editor,
 * que mede o DOM (`data-fit`) e avisa o usuário.
 */

export type FitField = "headline" | "body" | "cta" | "price" | "business_name";

export type TextBoxSpec = {
  /** Largura útil da caixa, em px no tamanho final da peça. */
  width: number;
  /** Altura máxima da caixa (px). Para caixas de uma linha, é derivada do maior tamanho. */
  maxHeight: number;
  lineHeight: number;
  /** Tamanhos candidatos em px, do maior para o menor. */
  sizes: readonly number[];
  /** Largura média conservadora por caractere, em em (já inclui o letter-spacing). */
  charEm: number;
  /** Texto em uma linha só (botão, preço). */
  singleLine?: boolean;
};

export type TextStep = { maxLength: number; fontSize: number; lines: number };

export type TextFit = {
  fontSize: number;
  lineHeight: number;
  width: number;
  /** Altura máxima total da caixa (inclui `padding`; as caixas usam border-box). */
  maxHeight: number;
  /** Respiro vertical (px, em cima e embaixo) para acentos e descendentes não serem cortados. */
  padding: number;
  /** Linhas que cabem na caixa com o tamanho escolhido. */
  lines: number;
};

/** Aproveitamento médio de uma linha quando o texto quebra entre palavras. */
export const WRAP_EFFICIENCY = 0.82;

/** Limites de texto do editor (iguais ao contrato `creativeDesignSchema`). */
export const TEXT_LIMITS = { headline: 40, body: 90, cta: 24, business_name: 60 } as const;

/**
 * Altura da "caixa de conteúdo" das fontes, em em (Plus Jakarta Sans: 1,04 + 0,22; Inter:
 * 0,97 + 0,24). Com entrelinha menor que isso, acentos e descendentes passam da linha; o
 * respiro vertical evita que sejam cortados (overflow hidden) e falsos alertas no editor.
 */
export const CONTENT_AREA_EM = 1.28;

export function verticalPadding(spec: TextBoxSpec, fontSize: number): number {
  if (spec.lineHeight >= CONTENT_AREA_EM) return 0;
  return Math.ceil(fontSize * ((CONTENT_AREA_EM - spec.lineHeight) / 2 + 0.01));
}

export function linesAt(spec: TextBoxSpec, fontSize: number): number {
  if (spec.singleLine) return 1;
  const usable = spec.maxHeight - 2 * verticalPadding(spec, fontSize);
  return Math.max(1, Math.floor(usable / (fontSize * spec.lineHeight)));
}

/** Quantos caracteres cabem na caixa com o tamanho dado (estimativa conservadora). */
export function capacityAt(spec: TextBoxSpec, fontSize: number): number {
  const perLine = spec.width / (spec.charEm * fontSize);
  // Uma linha só não perde espaço com quebra de palavras.
  if (spec.singleLine) return Math.floor(perLine * 100) / 100;
  const lines = linesAt(spec, fontSize);
  return lines === 1 ? Math.floor(perLine) : Math.floor(Math.floor(perLine) * lines * WRAP_EFFICIENCY);
}

/** Degraus de tamanho: até `maxLength` caracteres, usa `fontSize`. */
export function fontSteps(spec: TextBoxSpec): TextStep[] {
  return spec.sizes.map((fontSize) => ({
    fontSize,
    maxLength: capacityAt(spec, fontSize),
    lines: linesAt(spec, fontSize),
  }));
}

/** Escolhe o maior tamanho em que o texto cabe; abaixo do último degrau usa o menor tamanho. */
export function fitText(spec: TextBoxSpec, length: number): TextFit {
  const fontSize = spec.sizes.find((size) => capacityAt(spec, size) >= length) ?? spec.sizes[spec.sizes.length - 1];
  return {
    fontSize,
    lineHeight: spec.lineHeight,
    width: spec.width,
    maxHeight: spec.maxHeight,
    padding: verticalPadding(spec, fontSize),
    lines: linesAt(spec, fontSize),
  };
}

/**
 * Comprimento "visual" do preço formatado, em caracteres do valor: o símbolo da moeda é
 * desenhado com 40% do tamanho (conta ~0,45 por caractere, mais o espaço até o valor).
 */
export function priceDisplayLength(formatted: string): number {
  const { prefix, amount } = splitPrice(formatted);
  return prefix ? amount.length + prefix.length * 0.45 + 0.2 : amount.length;
}

/** Separa "R$ 1.234,56" em símbolo ("R$") e valor ("1.234,56"). */
export function splitPrice(formatted: string): { prefix: string; amount: string } {
  const normalized = formatted.replace(/[  ]/g, " ").trim();
  const firstDigit = normalized.search(/\d/);
  if (firstDigit <= 0) return { prefix: "", amount: normalized };
  return { prefix: normalized.slice(0, firstDigit).trim(), amount: normalized.slice(firstDigit).trim() };
}

// ---------------------------------------------------------------- caracteres suportados

/**
 * Caracteres presentes nas quatro fontes embarcadas (subconjunto latino do Inter e do Plus
 * Jakarta Sans). Fora disso o Satori tentaria baixar fontes/emojis de CDNs externas; por isso
 * o texto é limpo antes de desenhar, no editor e na exportação (o resultado fica idêntico).
 */
const UNSUPPORTED = /[^ -~ -¬®-ÿŒœ–—‘-‚“-„•…€™]/gu;

/** Normaliza espaços e remove caracteres que as fontes da peça não desenham (ex.: emojis). */
export function renderableText(input: string): string {
  return input.normalize("NFC").replace(/\s+/g, " ").replace(UNSUPPORTED, "").replace(/ {2,}/g, " ").trim();
}

/** true quando o texto tem caracteres que não aparecerão na peça. */
export function hasUnsupportedChars(input: string): boolean {
  return renderableText(input) !== input.normalize("NFC").replace(/\s+/g, " ").trim();
}

// ---------------------------------------------------------------- especificações por template

const display = (s: Omit<TextBoxSpec, "charEm"> & { charEm?: number }): TextBoxSpec => ({ charEm: 0.6, ...s });
const text = (s: Omit<TextBoxSpec, "charEm"> & { charEm?: number }): TextBoxSpec => ({ charEm: 0.58, ...s });
const line = (width: number, sizes: readonly number[], charEm = 0.6): TextBoxSpec => ({
  width,
  sizes,
  charEm,
  lineHeight: CONTENT_AREA_EM,
  singleLine: true,
  maxHeight: Math.ceil(sizes[0] * (CONTENT_AREA_EM + 0.02)),
});
const price = (width: number, sizes: readonly number[]): TextBoxSpec => line(width, sizes, 0.62);

export type TemplateTypeSpec = {
  /** Nome do negócio ao lado do monograma. */
  business_name: TextBoxSpec;
  headline: TextBoxSpec;
  /** Título quando a peça não mostra preço (alguns templates dão mais destaque a ele). */
  headline_no_price: TextBoxSpec;
  body: TextBoxSpec;
  /** Botão quando está sozinho na linha. */
  cta: TextBoxSpec;
  /** Botão quando divide a linha com o preço. */
  cta_with_price: TextBoxSpec;
  price: TextBoxSpec;
};

const brandName = (width: number, sizes: readonly number[] = [34, 30, 27], charEm = 0.6): TextBoxSpec => ({
  width,
  sizes,
  charEm,
  lineHeight: 1.22,
  maxHeight: Math.ceil(sizes[0] * 1.22 * 2),
});

export const TYPE_SPECS: Record<TemplateKey, Record<CreativeFormat, TemplateTypeSpec>> = {
  destaque: {
    feed_4x5: {
      business_name: brandName(560, [34, 30, 27, 25]),
      headline: display({ width: 936, maxHeight: 440, lineHeight: 1.06, sizes: [148, 132, 116, 104, 96, 88] }),
      headline_no_price: display({ width: 936, maxHeight: 460, lineHeight: 1.06, sizes: [156, 140, 124, 110, 100] }),
      body: text({ width: 820, maxHeight: 160, lineHeight: 1.32, sizes: [40, 37, 34, 32] }),
      cta: line(700, [44, 40, 36]),
      cta_with_price: line(700, [44, 40, 36]),
      price: price(760, [128, 112, 100, 88, 76, 64]),
    },
    stories_9x16: {
      business_name: brandName(700, [36, 32, 28]),
      headline: display({ width: 936, maxHeight: 500, lineHeight: 1.06, sizes: [164, 148, 132, 116, 104, 96] }),
      headline_no_price: display({
        width: 936,
        maxHeight: 600,
        lineHeight: 1.06,
        sizes: [172, 156, 140, 124, 110, 100],
      }),
      body: text({ width: 860, maxHeight: 172, lineHeight: 1.34, sizes: [42, 39, 36, 34] }),
      cta: line(740, [46, 42, 38]),
      cta_with_price: line(740, [46, 42, 38]),
      price: price(860, [156, 140, 124, 108, 96, 84, 72]),
    },
  },
  oferta: {
    feed_4x5: {
      business_name: brandName(720),
      headline: display({ width: 936, maxHeight: 250, lineHeight: 1.06, sizes: [100, 92, 84, 76, 68] }),
      headline_no_price: display({ width: 824, maxHeight: 420, lineHeight: 1.06, sizes: [124, 112, 100, 92, 84, 76] }),
      body: text({ width: 800, maxHeight: 144, lineHeight: 1.32, sizes: [36, 34, 32] }),
      cta: line(640, [40, 36, 32]),
      cta_with_price: line(640, [40, 36, 32]),
      price: price(824, [210, 184, 160, 140, 120, 104, 90, 78]),
    },
    stories_9x16: {
      business_name: brandName(700, [36, 32, 28]),
      headline: display({ width: 936, maxHeight: 330, lineHeight: 1.06, sizes: [112, 104, 96, 88, 80, 72] }),
      headline_no_price: display({ width: 808, maxHeight: 560, lineHeight: 1.06, sizes: [140, 128, 116, 104, 96, 88] }),
      body: text({ width: 800, maxHeight: 150, lineHeight: 1.34, sizes: [38, 36, 34, 32] }),
      cta: line(660, [46, 42, 38]),
      cta_with_price: line(660, [46, 42, 38]),
      price: price(808, [230, 200, 176, 152, 132, 112, 96, 82]),
    },
  },
  minimal: {
    feed_4x5: {
      business_name: brandName(760, [26, 24, 22], 0.8),
      headline: display({ width: 900, maxHeight: 400, lineHeight: 1.08, sizes: [120, 108, 98, 88, 80, 72] }),
      headline_no_price: display({ width: 900, maxHeight: 420, lineHeight: 1.08, sizes: [124, 112, 100, 90, 82, 74] }),
      body: text({ width: 780, maxHeight: 156, lineHeight: 1.42, sizes: [36, 34, 32, 30] }),
      cta: line(600, [40, 36, 32]),
      cta_with_price: line(440, [38, 34, 30, 28, 26]),
      price: price(360, [96, 84, 74, 64, 56, 48]),
    },
    stories_9x16: {
      business_name: brandName(760, [28, 26, 24], 0.8),
      headline: display({ width: 920, maxHeight: 460, lineHeight: 1.08, sizes: [140, 124, 112, 100, 90, 82] }),
      headline_no_price: display({ width: 920, maxHeight: 520, lineHeight: 1.08, sizes: [148, 132, 118, 106, 96, 86] }),
      body: text({ width: 820, maxHeight: 172, lineHeight: 1.42, sizes: [40, 37, 34, 32] }),
      cta: line(780, [44, 40, 36]),
      cta_with_price: line(780, [44, 40, 36]),
      price: price(936, [150, 132, 116, 100, 88, 76]),
    },
  },
  faixa: {
    feed_4x5: {
      business_name: brandName(720),
      headline: display({ width: 936, maxHeight: 330, lineHeight: 1.04, sizes: [128, 116, 104, 92, 84, 76] }),
      headline_no_price: display({ width: 936, maxHeight: 330, lineHeight: 1.04, sizes: [128, 116, 104, 92, 84, 76] }),
      body: text({ width: 860, maxHeight: 140, lineHeight: 1.32, sizes: [38, 36, 34, 32, 30] }),
      cta: line(640, [42, 38, 34]),
      cta_with_price: line(640, [42, 38, 34]),
      price: price(760, [100, 88, 76, 64, 56]),
    },
    stories_9x16: {
      business_name: brandName(700, [36, 32, 28]),
      headline: display({ width: 936, maxHeight: 420, lineHeight: 1.04, sizes: [148, 132, 118, 106, 96, 86] }),
      headline_no_price: display({ width: 936, maxHeight: 420, lineHeight: 1.04, sizes: [148, 132, 118, 106, 96, 86] }),
      body: text({ width: 880, maxHeight: 168, lineHeight: 1.34, sizes: [42, 39, 36, 34] }),
      cta: line(740, [46, 42, 38]),
      cta_with_price: line(740, [46, 42, 38]),
      price: price(760, [124, 108, 94, 82, 72, 62]),
    },
  },
};

/** Atalho usado pelos templates. */
export function typeFor(template: TemplateKey, format: CreativeFormat, field: keyof TemplateTypeSpec, length: number) {
  return fitText(TYPE_SPECS[template][format][field], length);
}
