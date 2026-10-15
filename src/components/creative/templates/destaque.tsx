import type { CreativeDesign } from "@/contracts/creative";
import { AA_LARGE, withAlpha } from "@/lib/creative/color";
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
 * Destaque: título forte, fundo da marca e formas geométricas tom sobre tom.
 * Obs.: nada de Fragment nos templates — o Satori posiciona errado filhos de Fragment.
 */
export function destaquePalette(design: CreativeDesign) {
  const base = basePalette(design, { angle: 155 });
  return { ...base, monoBg: base.ctaBg, monoText: base.ctaText };
}

export function destaquePairs(design: CreativeDesign): ContrastPair[] {
  const p = destaquePalette(design);
  return [
    ...basePairs(p),
    { role: "preço", fg: p.ink, bgs: p.stops, min: AA_LARGE },
    { role: "monograma", fg: p.monoText, bgs: [p.monoBg], min: AA_LARGE },
  ];
}

export function DestaqueTemplate({ design, fonts }: TemplateProps) {
  const p = destaquePalette(design);
  const c = canvasOf(design);
  const f = design.format;
  const price = displayPrice(design);
  const centered = c.stories;
  const align = centered ? "center" : "left";

  const name = typeFor("destaque", f, "business_name", design.business_name.length);
  const headline = typeFor("destaque", f, price ? "headline" : "headline_no_price", design.headline.length);
  const body = typeFor("destaque", f, "body", design.body.length);
  const priceFit = price ? typeFor("destaque", f, "price", priceDisplayLength(price)) : null;
  const cta = typeFor("destaque", f, "cta", design.cta.length);
  const ring = withAlpha(p.accent, 0.55);

  const shapes = centered
    ? [
        <Shape
          key="horizonte"
          style={{ width: 1560, height: 1560, borderRadius: 1560, left: -240, top: 1640, backgroundColor: p.decoTone }}
        />,
        <Shape
          key="orbita"
          style={{ width: 1800, height: 1800, borderRadius: 1800, left: -360, top: 1530, border: `3px solid ${ring}` }}
        />,
        <Shape
          key="lua"
          style={{ width: 620, height: 620, borderRadius: 620, left: -250, top: -330, backgroundColor: p.decoTone }}
        />,
        <Shape
          key="capsula"
          style={{
            width: 260,
            height: 84,
            borderRadius: 84,
            right: -40,
            top: 118,
            backgroundColor: p.accent,
            transform: "rotate(-24deg)",
          }}
        />,
        <Shape
          key="ponto"
          style={{ width: 40, height: 40, borderRadius: 40, right: 270, top: 92, backgroundColor: p.accent }}
        />,
      ]
    : [
        <Shape
          key="sol"
          style={{ width: 720, height: 720, borderRadius: 720, right: -270, top: -230, backgroundColor: p.decoTone }}
        />,
        <Shape
          key="orbita"
          style={{ width: 960, height: 960, borderRadius: 960, right: -390, top: -350, border: `3px solid ${ring}` }}
        />,
        <Shape
          key="capsula"
          style={{
            width: 220,
            height: 72,
            borderRadius: 72,
            right: -30,
            top: 96,
            backgroundColor: p.accent,
            transform: "rotate(-28deg)",
          }}
        />,
        <Shape
          key="ponto"
          style={{ width: 34, height: 34, borderRadius: 34, right: 214, top: 70, backgroundColor: p.accent }}
        />,
      ];

  const bodyBlock = design.body
    ? [
        <Spacer key="sb" size={centered ? 40 : 30} />,
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
    : [];

  const priceBlock =
    price && priceFit
      ? [
          <PriceText
            key="price"
            formatted={price}
            fit={priceFit}
            color={p.ink}
            family={fonts.display}
            align={align}
            prefixColor={p.inkSoft}
          />,
          <Spacer key="sp" size={centered ? 40 : 30} />,
        ]
      : [];

  return (
    <ArtboardRoot design={design} background={p.background} fonts={fonts}>
      {shapes}
      <SafeColumn design={design} align={centered ? "center" : "stretch"}>
        <BrandMark
          name={design.business_name}
          fit={name}
          size={centered ? 92 : 84}
          monoBg={p.monoBg}
          monoText={p.monoText}
          color={p.ink}
          fonts={fonts}
          align={align}
        />
        <Spacer grow={1} size={40} />
        <div
          style={{
            display: "flex",
            flexShrink: 0,
            width: centered ? 96 : 120,
            height: 12,
            borderRadius: 12,
            backgroundColor: p.accent,
          }}
        />
        <Spacer size={centered ? 44 : 34} />
        <FitText
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
        </FitText>
        {bodyBlock}
        <Spacer grow={centered ? 1 : 0} size={centered ? 56 : 52} />
        {priceBlock}
        <div style={{ display: "flex", flexShrink: 0, justifyContent: centered ? "center" : "flex-start" }}>
          <CtaPill text={design.cta} fit={cta} bg={p.ctaBg} color={p.ctaText} family={fonts.display} />
        </div>
      </SafeColumn>
    </ArtboardRoot>
  );
}
