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
  withAlpha,
} from "@/lib/creative/color";
import { priceDisplayLength, typeFor } from "@/lib/creative/typography";
import {
  ArtboardRoot,
  BrandMark,
  CtaPill,
  FitText,
  PriceText,
  SafeColumn,
  Shape,
  Spacer,
  basePairs,
  basePalette,
  canvasOf,
  displayPrice,
  type ContrastPair,
  type TemplateProps,
} from "./shared";

/**
 * Oferta: o preço confirmado é o protagonista, num cartão de alto contraste. Sem preço, o
 * cartão destaca o título. Nenhum selo/rótulo fixo ("promoção", "desconto"): só textos da peça.
 */
export function ofertaPalette(design: CreativeDesign) {
  const base = basePalette(design, { angle: 165 });
  const claro = design.background === "claro";
  const brandOnPaper = claro && contrastRatio(base.brand, base.stops[0]) >= AA_LARGE;
  // Cartão: claro (ou tinta) sobre fundo da marca; cor da marca sobre fundo claro.
  const card = claro ? (brandOnPaper ? base.brand : mix(INK, base.brand, 0.1)) : base.ctaBg;
  const cardInk = readableTextColor(card);
  const brandOnCard = contrastRatio(base.brand, card) >= AA_LARGE;
  const priceColor = claro && brandOnPaper ? cardInk : (adjustForContrast(base.brand, card, AA_LARGE, 0.3) ?? cardInk);
  const pillBg = claro && brandOnPaper ? cardInk : brandOnCard ? base.brand : cardInk;
  const pillText =
    pillBg === base.brand
      ? readableTextColor(pillBg)
      : (adjustForContrast(base.brand, pillBg, AA_BODY, 0.3) ?? readableTextColor(pillBg));
  return {
    ...base,
    card,
    cardInk,
    cardInkSoft: ensureContrast(mix(cardInk, card, 0.25), card, AA_BODY),
    priceColor,
    pillBg,
    pillText,
    monoBg: base.ctaBg,
    monoText: base.ctaText,
  };
}

export function ofertaPairs(design: CreativeDesign): ContrastPair[] {
  const p = ofertaPalette(design);
  return [
    ...basePairs(p),
    { role: "preço no cartão", fg: p.priceColor, bgs: [p.card], min: AA_LARGE },
    { role: "título no cartão", fg: p.cardInk, bgs: [p.card], min: AA_LARGE },
    { role: "texto no cartão", fg: p.cardInkSoft, bgs: [p.card], min: AA_BODY },
    { role: "botão no cartão", fg: p.pillText, bgs: [p.pillBg], min: AA_BODY },
    { role: "monograma", fg: p.monoText, bgs: [p.monoBg], min: AA_LARGE },
  ];
}

export function OfertaTemplate({ design, fonts }: TemplateProps) {
  const p = ofertaPalette(design);
  const c = canvasOf(design);
  const f = design.format;
  const price = displayPrice(design);
  const stories = c.stories;
  const align = stories ? "center" : "left";

  const name = typeFor("oferta", f, "business_name", design.business_name.length);
  const headline = typeFor("oferta", f, price ? "headline" : "headline_no_price", design.headline.length);
  const body = typeFor("oferta", f, "body", design.body.length);
  const priceFit = price ? typeFor("oferta", f, "price", priceDisplayLength(price)) : null;
  const cta = typeFor("oferta", f, price ? "cta_with_price" : "cta", design.cta.length);
  const pad = stories ? 64 : 56;
  const shadow = `0 40px 80px -30px ${withAlpha("#000000", p.light ? 0.28 : 0.45)}`;

  const stripes = [0, 1, 2].map((i) => (
    <Shape
      key={`faixa-${i}`}
      style={{
        width: stories ? 900 : 760,
        height: stories ? 64 : 54,
        borderRadius: 64,
        right: stories ? -360 + i * 30 : -330 + i * 26,
        top: (stories ? 30 : -6) + i * (stories ? 108 : 92),
        backgroundColor: p.decoTone,
        transform: "rotate(-35deg)",
      }}
    />
  ));
  const shapes = [
    ...stripes,
    <Shape
      key="bola"
      style={
        stories
          ? { width: 1100, height: 1100, borderRadius: 1100, left: -420, bottom: -760, backgroundColor: p.decoTone }
          : { width: 640, height: 640, borderRadius: 640, left: -300, bottom: -260, backgroundColor: p.decoTone }
      }
    />,
    ...(stories
      ? [
          <Shape
            key="aro"
            style={{
              width: 230,
              height: 230,
              borderRadius: 230,
              right: 90,
              bottom: 120,
              border: `18px solid ${p.accent}`,
            }}
          />,
        ]
      : []),
  ];

  const ctaInCard = (
    <div key="cta" style={{ display: "flex", flexShrink: 0, justifyContent: stories ? "center" : "flex-start" }}>
      <CtaPill text={design.cta} fit={cta} bg={p.pillBg} color={p.pillText} family={fonts.display} />
    </div>
  );

  const card =
    price && priceFit ? (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          flexShrink: 0,
          alignItems: stories ? "center" : "flex-start",
          boxSizing: "border-box",
          width: c.contentWidth,
          padding: pad,
          borderRadius: stories ? 56 : 48,
          backgroundColor: p.card,
          boxShadow: shadow,
        }}
      >
        <PriceText
          formatted={price}
          fit={priceFit}
          color={p.priceColor}
          family={fonts.display}
          align={align}
          prefixColor={p.cardInkSoft}
        />
        <Spacer size={stories ? 40 : 30} />
        {ctaInCard}
      </div>
    ) : (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          flexShrink: 0,
          alignItems: stories ? "center" : "flex-start",
          boxSizing: "border-box",
          width: c.contentWidth,
          padding: pad,
          borderRadius: stories ? 56 : 48,
          backgroundColor: p.card,
          boxShadow: shadow,
        }}
      >
        <div style={{ display: "flex", width: 96, height: 12, borderRadius: 12, backgroundColor: p.priceColor }} />
        <Spacer size={stories ? 40 : 32} />
        <FitText
          field="headline"
          fit={headline}
          color={p.cardInk}
          family={fonts.display}
          weight={800}
          tracking={-0.03}
          align={align}
          balance
        >
          {design.headline}
        </FitText>
        {design.body
          ? [
              <Spacer key="sb" size={28} />,
              <FitText
                key="body"
                field="body"
                fit={body}
                color={p.cardInkSoft}
                family={fonts.body}
                weight={400}
                align={align}
                pretty
              >
                {design.body}
              </FitText>,
            ]
          : null}
        <Spacer size={stories ? 48 : 40} />
        {ctaInCard}
      </div>
    );

  const intro = price
    ? [
        <FitText
          key="headline"
          field="headline"
          fit={headline}
          color={p.ink}
          family={fonts.display}
          weight={800}
          tracking={-0.03}
          align={align}
          balance
        >
          {design.headline}
        </FitText>,
        ...(design.body
          ? [
              <Spacer key="sb" size={24} />,
              <FitText
                key="body"
                field="body"
                fit={body}
                color={p.inkSoft}
                family={fonts.body}
                weight={400}
                align={align}
                pretty
              >
                {design.body}
              </FitText>,
            ]
          : []),
        <Spacer key="sc" size={stories ? 56 : 44} />,
      ]
    : [];

  return (
    <ArtboardRoot design={design} background={p.background} fonts={fonts}>
      {shapes}
      <SafeColumn design={design} align={stories ? "center" : "stretch"}>
        <BrandMark
          name={design.business_name}
          fit={name}
          size={stories ? 92 : 84}
          monoBg={p.monoBg}
          monoText={p.monoText}
          color={p.ink}
          fonts={fonts}
          align={align}
        />
        <Spacer grow={1} size={40} />
        {intro}
        {card}
        {stories ? <Spacer grow={1} size={0} /> : null}
      </SafeColumn>
    </ArtboardRoot>
  );
}
