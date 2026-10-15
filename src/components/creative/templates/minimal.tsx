import type { CreativeDesign } from "@/contracts/creative";
import {
  AA_BODY,
  AA_LARGE,
  INK,
  adjustForContrast,
  contrastRatio,
  ensureContrast,
  mix,
  readableTextColor,
  saturation,
  tint,
  withAlpha,
} from "@/lib/creative/color";
import { priceDisplayLength, typeFor } from "@/lib/creative/typography";
import {
  ArtboardRoot,
  BrandMark,
  CtaPill,
  FitText,
  PAPER,
  PriceText,
  SafeColumn,
  Shape,
  Spacer,
  canvasOf,
  displayPrice,
  monogramOf,
  type ContrastPair,
  type TemplateProps,
} from "./shared";

/**
 * Minimal: fundo sempre claro, tipografia editorial, filetes finos e um acento da marca.
 * "solido" = papel tingido pela marca; "gradiente" = degradê suave; "claro" = papel neutro.
 */
export function minimalPalette(design: CreativeDesign) {
  const brand = design.brand_color.toUpperCase();
  const stops =
    design.background === "gradiente"
      ? [tint(brand, 0.95), tint(brand, 0.8)]
      : design.background === "solido"
        ? [tint(brand, 0.88)]
        : [mix(PAPER, brand, 0.02)];
  const background =
    stops.length === 1 ? stops[0] : `linear-gradient(180deg, ${stops[0]} 0%, ${stops[stops.length - 1]} 100%)`;
  // Letra gigante de fundo: tom muito próximo do papel; entra no cálculo de contraste.
  const ghost = mix(stops[stops.length - 1], brand, 0.07);
  const surfaces = [...stops, ghost];
  const ink = readableTextColor(surfaces, { dark: mix(INK, brand, 0.14) });
  const brandOk = surfaces.every((s) => contrastRatio(brand, s) >= AA_LARGE);
  // Acento gráfico: a própria marca quando é visível (contraste ou cor viva); senão, tinta.
  const fill = brandOk || saturation(brand) >= 0.35 ? brand : ink;
  const ctaBg = brandOk ? brand : ink;
  const onInk = (fallback: string) => adjustForContrast(brand, ink, AA_BODY, 0.3) ?? fallback;
  return {
    brand,
    stops,
    background,
    ink,
    inkSoft: ensureContrast(mix(ink, stops[0], 0.3), surfaces, AA_BODY),
    rule: withAlpha(ink, 0.16),
    fill,
    priceColor: brandOk ? brand : (adjustForContrast(brand, surfaces, AA_LARGE, 0.3) ?? ink),
    monoBg: ctaBg,
    monoText: brandOk ? readableTextColor(ctaBg) : onInk(readableTextColor(ctaBg)),
    ctaBg,
    ctaText: brandOk ? readableTextColor(ctaBg) : onInk(readableTextColor(ctaBg)),
    ghost,
  };
}

export function minimalPairs(design: CreativeDesign): ContrastPair[] {
  const p = minimalPalette(design);
  const all = [...p.stops, p.ghost];
  return [
    { role: "título", fg: p.ink, bgs: all, min: AA_LARGE },
    { role: "texto", fg: p.inkSoft, bgs: all, min: AA_BODY },
    { role: "nome", fg: p.inkSoft, bgs: all, min: AA_BODY },
    { role: "preço", fg: p.priceColor, bgs: all, min: AA_LARGE },
    { role: "botão", fg: p.ctaText, bgs: [p.ctaBg], min: AA_BODY },
    { role: "monograma", fg: p.monoText, bgs: [p.monoBg], min: AA_LARGE },
  ];
}

function Rule({ color }: { color: string }) {
  return <div style={{ display: "flex", flexShrink: 0, height: 2, backgroundColor: color }} />;
}

export function MinimalTemplate({ design, fonts }: TemplateProps) {
  const p = minimalPalette(design);
  const c = canvasOf(design);
  const f = design.format;
  const price = displayPrice(design);
  const stories = c.stories;

  const name = typeFor("minimal", f, "business_name", design.business_name.length);
  const headline = typeFor("minimal", f, price ? "headline" : "headline_no_price", design.headline.length);
  const body = typeFor("minimal", f, "body", design.body.length);
  const priceFit = price ? typeFor("minimal", f, "price", priceDisplayLength(price)) : null;
  const cta = typeFor("minimal", f, price && !stories ? "cta_with_price" : "cta", design.cta.length);
  const letter = monogramOf(design.business_name);

  const ghost = (
    <div
      style={{
        display: "flex",
        position: "absolute",
        right: stories ? -150 : -110,
        bottom: stories ? -520 : -470,
        fontFamily: fonts.display,
        fontWeight: 800,
        fontSize: stories ? 1500 : 1180,
        lineHeight: 1,
        letterSpacing: -40,
        color: p.ghost,
      }}
    >
      {letter}
    </div>
  );

  const pill = (
    <CtaPill
      text={design.cta}
      fit={cta}
      bg={p.ctaBg}
      color={p.ctaText}
      family={fonts.display}
      fullWidth={stories ? c.contentWidth : undefined}
    />
  );

  const priceText =
    price && priceFit ? (
      <PriceText
        key="price"
        formatted={price}
        fit={priceFit}
        color={p.priceColor}
        family={fonts.display}
        prefixColor={p.inkSoft}
      />
    ) : null;

  const bottom = stories ? (
    <div style={{ display: "flex", flexDirection: "column", flexShrink: 0 }}>
      {priceText ? [priceText, <Spacer key="sp" size={36} />] : null}
      {pill}
    </div>
  ) : (
    <div style={{ display: "flex", flexShrink: 0, alignItems: "flex-end", justifyContent: "space-between" }}>
      {pill}
      {priceText}
    </div>
  );

  return (
    <ArtboardRoot design={design} background={p.background} fonts={fonts}>
      {ghost}
      <Shape
        style={{
          width: stories ? 14 : 12,
          height: stories ? 340 : 260,
          left: 0,
          top: stories ? 520 : 330,
          backgroundColor: p.fill,
        }}
      />
      <SafeColumn design={design}>
        <BrandMark
          name={design.business_name}
          fit={name}
          size={stories ? 64 : 56}
          monoBg={p.monoBg}
          monoText={p.monoText}
          color={p.inkSoft}
          fonts={fonts}
          uppercase
        />
        <Spacer size={stories ? 36 : 30} />
        <Rule color={p.rule} />
        <Spacer grow={1} size={48} />
        <FitText
          field="headline"
          fit={headline}
          color={p.ink}
          family={fonts.display}
          weight={700}
          tracking={-0.035}
          balance
        >
          {design.headline}
        </FitText>
        {design.body
          ? [
              <Spacer key="sb" size={stories ? 44 : 36} />,
              <div
                key="bar"
                style={{ display: "flex", width: 64, height: 6, flexShrink: 0, backgroundColor: p.fill }}
              />,
              <Spacer key="sb2" size={stories ? 40 : 32} />,
              <FitText key="body" field="body" fit={body} color={p.inkSoft} family={fonts.body} weight={400} pretty>
                {design.body}
              </FitText>,
            ]
          : null}
        <Spacer grow={stories ? 2 : 1} size={56} />
        <Rule color={p.rule} />
        <Spacer size={stories ? 48 : 40} />
        {bottom}
      </SafeColumn>
    </ArtboardRoot>
  );
}
