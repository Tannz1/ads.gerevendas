import { describe, expect, it } from "vitest";
import { CREATIVE_FORMATS, TEMPLATE_KEYS } from "@/contracts/strategy";
import { formatCents } from "@/lib/money";
import {
  TEXT_LIMITS,
  TYPE_SPECS,
  capacityAt,
  fitText,
  fontSteps,
  hasUnsupportedChars,
  linesAt,
  priceDisplayLength,
  renderableText,
  splitPrice,
  verticalPadding,
  type TemplateTypeSpec,
  type TextBoxSpec,
} from "@/lib/creative/typography";

const LIMIT_BY_FIELD: Record<keyof TemplateTypeSpec, number> = {
  business_name: TEXT_LIMITS.business_name,
  headline: TEXT_LIMITS.headline,
  headline_no_price: TEXT_LIMITS.headline,
  body: TEXT_LIMITS.body,
  cta: TEXT_LIMITS.cta,
  cta_with_price: TEXT_LIMITS.cta,
  // Preço até R$ 999.999,99 (valores maiores são avisados pelo editor).
  price: priceDisplayLength(formatCents(99_999_999)),
};

const SAMPLES: Record<keyof typeof TEXT_LIMITS, string> = {
  headline: "Corte e barba com hora marcada no bairro",
  body: "Atendimento sem fila, ambiente climatizado e café por nossa conta enquanto você espera.",
  cta: "Agendar pelo WhatsApp já",
  business_name: "Barbearia e Estética Masculina Dom José & Filhos de Campinas",
};

/** Quebra gulosa com largura uniforme por caractere (modelo do pior caso). */
function greedyLines(text: string, perLine: number): number {
  let lines = 1;
  let used = 0;
  for (const word of text.split(" ")) {
    const need = used === 0 ? word.length : used + 1 + word.length;
    if (need <= perLine) used = need;
    else {
      lines++;
      used = word.length;
    }
  }
  return lines;
}

const ALL = TEMPLATE_KEYS.flatMap((t) =>
  CREATIVE_FORMATS.flatMap((f) =>
    (Object.keys(TYPE_SPECS[t][f]) as (keyof TemplateTypeSpec)[]).map(
      (field) =>
        [`${t}/${f}/${field}`, TYPE_SPECS[t][f][field], field] as [string, TextBoxSpec, keyof TemplateTypeSpec],
    ),
  ),
);

describe("degraus de tamanho", () => {
  it.each(ALL)("%s: tamanhos decrescentes e capacidade crescente", (_name, spec) => {
    for (let i = 1; i < spec.sizes.length; i++) expect(spec.sizes[i]).toBeLessThan(spec.sizes[i - 1]);
    const steps = fontSteps(spec);
    for (let i = 1; i < steps.length; i++) expect(steps[i].maxLength).toBeGreaterThanOrEqual(steps[i - 1].maxLength);
  });

  it.each(ALL)("%s: fonte nunca cresce quando o texto cresce", (_name, spec, field) => {
    let previous = Infinity;
    for (let n = 1; n <= LIMIT_BY_FIELD[field]; n++) {
      const fit = fitText(spec, n);
      expect(fit.fontSize).toBeLessThanOrEqual(previous);
      previous = fit.fontSize;
    }
  });

  it.each(ALL)("%s: o limite do campo cabe por construção", (_name, spec, field) => {
    const limit = LIMIT_BY_FIELD[field];
    const fit = fitText(spec, limit);
    expect(capacityAt(spec, fit.fontSize)).toBeGreaterThanOrEqual(limit);
    // Altura: linhas × entrelinha + respiro nunca passam da altura máxima da caixa.
    const used = fit.lines * fit.fontSize * fit.lineHeight + 2 * fit.padding;
    expect(used).toBeLessThanOrEqual(spec.maxHeight + 0.5);
  });

  it.each(ALL.filter(([, spec]) => !spec.singleLine))(
    "%s: texto real no limite quebra em até as linhas da caixa (largura conservadora)",
    (_name, spec, field) => {
      const key = field.startsWith("headline") ? "headline" : (field as keyof typeof SAMPLES);
      const sample = SAMPLES[key];
      const fit = fitText(spec, sample.length);
      const perLine = Math.floor(spec.width / (spec.charEm * fit.fontSize));
      expect(greedyLines(sample, perLine)).toBeLessThanOrEqual(linesAt(spec, fit.fontSize));
    },
  );

  it("o título diminui em degraus conforme cresce (destaque, feed)", () => {
    const spec = TYPE_SPECS.destaque.feed_4x5.headline;
    const short = fitText(spec, 9).fontSize;
    const medium = fitText(spec, 22).fontSize;
    const long = fitText(spec, 40).fontSize;
    expect(short).toBeGreaterThan(medium);
    expect(medium).toBeGreaterThan(long);
  });

  it("é determinístico", () => {
    const spec = TYPE_SPECS.faixa.stories_9x16.headline;
    expect(fitText(spec, 27)).toEqual(fitText(spec, 27));
  });

  it("entrelinha apertada ganha respiro vertical; folgada não", () => {
    expect(verticalPadding(TYPE_SPECS.destaque.feed_4x5.headline, 100)).toBeGreaterThan(0);
    expect(verticalPadding(TYPE_SPECS.destaque.feed_4x5.body, 40)).toBe(0);
    expect(verticalPadding(TYPE_SPECS.destaque.feed_4x5.cta, 40)).toBe(0);
  });
});

describe("preço", () => {
  it("separa símbolo e valor do formatCents", () => {
    expect(splitPrice(formatCents(2490))).toEqual({ prefix: "R$", amount: "24,90" });
    expect(splitPrice(formatCents(123456))).toEqual({ prefix: "R$", amount: "1.234,56" });
    expect(splitPrice("24,90")).toEqual({ prefix: "", amount: "24,90" });
  });

  it("comprimento visual conta o símbolo pela metade", () => {
    expect(priceDisplayLength(formatCents(2490))).toBeCloseTo(5 + 2 * 0.45 + 0.2, 5);
    expect(priceDisplayLength("24,90")).toBe(5);
  });
});

describe("caracteres desenháveis", () => {
  it("remove emojis e normaliza espaços", () => {
    expect(renderableText("Promo 🔥  de\nverão")).toBe("Promo de verão");
    expect(renderableText("  Café — “pão” …  ")).toBe("Café — “pão” …");
    expect(renderableText("Ação e ÇÃO")).toBe("Ação e ÇÃO");
  });

  it("acentos decompostos viram compostos (NFC)", () => {
    expect(renderableText("Café")).toBe("Café");
  });

  it("detecta o que não aparece", () => {
    expect(hasUnsupportedChars("Pão quentinho")).toBe(false);
    expect(hasUnsupportedChars("Pão quentinho 🍞")).toBe(true);
    expect(hasUnsupportedChars("Seta → aqui")).toBe(true);
    expect(hasUnsupportedChars("linha\nquebrada")).toBe(false);
  });
});
