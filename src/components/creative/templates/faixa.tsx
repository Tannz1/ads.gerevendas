import type { CreativeDesign } from "@/contracts/creative";
import {
  AA_BODY,
  AA_LARGE,
  INK,
  WHITE,
  adjustForContrast,
  contrastRatio,
  distinct,
  isLight,
  mix,
  readableTextColor,
  saturation,
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
 * Faixa: uma faixa diagonal larga e ousada atrás do título. As zonas têm altura fixa, então a
 * faixa (absoluta) sempre cobre a caixa do título, qualquer que seja o tamanho do texto.
 */

/** Geometria fixa por formato (px no tamanho final). */
const GEOMETRY = {
  feed_4x5: { brandRow: 84, gapBefore: 190, zone: 380, gapAfter: 120, angle: -6, bandHeight: 470 },
  stories_9x16: { brandRow: 92, gapBefore: 150, zone: 460, gapAfter: 120, angle: -6, bandHeight: 600 },
} as const;

export function faixaPalette(design: CreativeDesign) {
  const base = basePalette(design, { angle: 170 });
  const brand = base.brand;
  let band: string;
  if (design.background === "claro") {
    // Faixa na cor da marca, salvo marca quase igual ao papel (ex.: branco/cinza claro).
    band = contrastRatio(brand, base.background) >= 1.1 || saturation(brand) >= 0.5 ? brand : base.ink;
  } else {
    const deep = isLight(brand) ? mix(INK, brand, 0.1) : mix(brand, INK, 0.8);
    // Marca já muito escura: a faixa inverte para quase branco.
    band = base.stops.every((s) => distinct(deep, s, 1.6)) ? deep : mix(WHITE, brand, 0.06);
  }
  const bandInk = readableTextColor(band);
  return {
    ...base,
    band,
    bandInk,
    // Filete de acento sobre a faixa (gráfico): contraste ≥ 3:1 com a faixa.
    bandAccent: adjustForContrast(design.background === "claro" ? base.ink : brand, band, AA_LARGE, 0.3) ?? bandInk,
    monoBg: base.ctaBg,
    monoText: base.ctaText,
  };
}

export function faixaPairs(design: CreativeDesign): ContrastPair[] {
  const p = faixaPalette(design);
  return [
    ...basePairs(p),
    { role: "título na faixa", fg: p.bandInk, bgs: [p.band], min: AA_BODY },
    { role: "preço", fg: p.ink, bgs: p.stops, min: AA_LARGE },
    { role: "monograma", fg: p.monoText, bgs: [p.monoBg], min: AA_LARGE },
  ];
}

export function FaixaTemplate({ design, fonts }: TemplateProps) {
  const p = faixaPalette(design);
  const c = canvasOf(design);
  const f = design.format;
  const g = GEOMETRY[f];
  const price = displayPrice(design);
  const stories = c.stories;

  const name = typeFor("faixa", f, "business_name", design.business_name.length);
  const headline = typeFor("faixa", f, price ? "headline" : "headline_no_price", design.headline.length);
  const body = typeFor("faixa", f, "body", design.body.length);
  const priceFit = price ? typeFor("faixa", f, "price", priceDisplayLength(price)) : null;
  const cta = typeFor("faixa", f, "cta", design.cta.length);

  // Centro vertical da zona do título, em coordenadas da peça.
  const zoneCenter = c.safe.top + g.brandRow + g.gapBefore + g.zone / 2;
  const bandWidth = c.width + 700;
  const band = (
    <Shape
      key="faixa"
      style={{
        width: bandWidth,
        height: g.bandHeight,
        left: (c.width - bandWidth) / 2,
        top: zoneCenter - g.bandHeight / 2,
        backgroundColor: p.band,
        transform: `rotate(${g.angle}deg)`,
      }}
    />
  );
  const tick = (key: string, top: number, height: number, color: string, angle = g.angle) => (
    <Shape
      key={key}
      style={{
        width: bandWidth,
        height,
        left: (c.width - bandWidth) / 2,
        top,
        backgroundColor: color,
        transform: `rotate(${angle}deg)`,
      }}
    />
  );
  const shapes = stories
    ? [
        tick("topo", 40, 120, p.decoTone, -6),
        tick("base", 1690, 150, p.decoTone, -6),
        tick("base-fio", 1640, 14, p.accent, -6),
        band,
        tick("fio", zoneCenter + g.bandHeight / 2 - 52, 12, p.bandAccent),
      ]
    : [
        <Shape
          key="canto"
          style={{
            width: 520,
            height: 520,
            borderRadius: 520,
            right: -260,
            bottom: -300,
            backgroundColor: p.decoTone,
          }}
        />,
        band,
        tick("fio", zoneCenter + g.bandHeight / 2 - 46, 10, p.bandAccent),
      ];

  const priceText =
    price && priceFit ? (
      <PriceText
        key="price"
        formatted={price}
        fit={priceFit}
        color={p.ink}
        family={fonts.display}
        prefixColor={p.inkSoft}
      />
    ) : null;
  const pill = <CtaPill key="cta" text={design.cta} fit={cta} bg={p.ctaBg} color={p.ctaText} family={fonts.display} />;

  return (
    <ArtboardRoot design={design} background={p.background} fonts={fonts}>
      {shapes}
      <SafeColumn design={design}>
        <div style={{ display: "flex", flexShrink: 0, height: g.brandRow, alignItems: "center" }}>
          <BrandMark
            name={design.business_name}
            fit={name}
            size={stories ? 92 : 84}
            monoBg={p.monoBg}
            monoText={p.monoText}
            color={p.ink}
            fonts={fonts}
          />
        </div>
        <Spacer size={g.gapBefore} />
        <div style={{ display: "flex", flexShrink: 0, height: g.zone, alignItems: "center" }}>
          <FitText
            field="headline"
            fit={headline}
            color={p.bandInk}
            family={fonts.display}
            weight={800}
            tracking={-0.03}
            balance
          >
            {design.headline}
          </FitText>
        </div>
        <Spacer size={g.gapAfter} />
        {design.body ? (
          <FitText field="body" fit={body} color={p.inkSoft} family={fonts.body} weight={400} pretty>
            {design.body}
          </FitText>
        ) : null}
        <Spacer grow={1} size={36} />
        <div style={{ display: "flex", flexDirection: "column", flexShrink: 0 }}>
          {priceText ? [priceText, <Spacer key="sp" size={28} />] : null}
          <div style={{ display: "flex", flexShrink: 0 }}>{pill}</div>
        </div>
      </SafeColumn>
    </ArtboardRoot>
  );
}
