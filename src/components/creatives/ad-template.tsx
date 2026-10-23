import type { CSSProperties } from "react";
import { FORMATS, type CreativeContent, type Format } from "@/contracts/creatives";
import { readableOn } from "@/lib/creatives";

/**
 * Peça estática (ADR 0003). O mesmo JSX serve à prévia e ao PNG (Satori: flexbox e estilos inline).
 * `content.template` escolhe a composição; cada uma tem uma área fixa de texto, que o prompt da
 * imagem deixa livre (`FREE_AREA` em image-prompt.ts). A cor da marca fica só no botão e nos destaques.
 */

export type AdFonts = { display: string; body: string };

export type AdTemplateProps = {
  content: CreativeContent;
  format: Format;
  businessName: string;
  /** Preço já formatado (ex.: "R$ 24,90"); só aparece com `content.show_price`. */
  priceLabel: string | null;
  fonts: AdFonts;
  /** Imagem de fundo: URL assinada (prévia) ou data URI (PNG). */
  imageSrc?: string | null;
  /** Logotipo da marca (opcional): URL assinada ou data URI. */
  logoSrc?: string | null;
};

/** Margens de segurança: no Stories a interface do Instagram cobre topo e rodapé. */
export const SAFE_AREA: Record<Format, { x: number; top: number; bottom: number }> = {
  feed: { x: 88, top: 88, bottom: 88 },
  stories: { x: 88, top: 260, bottom: 300 },
};

export function headlineSize(headline: string): number {
  const n = headline.length;
  return n <= 22 ? 112 : n <= 36 ? 92 : 76;
}

// Véus neutros (nunca na cor da marca), escuros só onde o texto fica.
const SHADE = {
  base: "linear-gradient(180deg, rgba(0,0,0,0) 30%, rgba(0,0,0,0.55) 60%, rgba(0,0,0,0.9) 100%)",
  topo: "linear-gradient(180deg, rgba(0,0,0,0.88) 0%, rgba(0,0,0,0.5) 32%, rgba(0,0,0,0) 55%, rgba(0,0,0,0) 72%, rgba(0,0,0,0.45) 100%)",
  centro: "linear-gradient(180deg, rgba(0,0,0,0.4) 0%, rgba(0,0,0,0.62) 50%, rgba(0,0,0,0.5) 100%)",
};

/** Altura da foto no layout de painel (o resto é o painel sólido com o texto). */
const PANEL_PHOTO: Record<Format, number> = { feed: 0.48, stories: 0.55 };

type Align = "flex-start" | "center" | "stretch";

export function AdTemplate({ content, format, businessName, priceLabel, fonts, imageSrc, logoSrc }: AdTemplateProps) {
  const { width, height } = FORMATS[format];
  const safe = SAFE_AREA[format];
  const { background, accent, text } = content.colors;
  const onAccent = readableOn(accent);
  const price = content.show_price ? priceLabel : null;
  const t = content.template;
  // Sombra no texto só quando ele fica sobre a foto (no painel o fundo já é sólido).
  // Satori quebra com `textShadow: undefined`: a propriedade só entra quando há sombra.
  const shadow = (value: string): CSSProperties => (imageSrc && t !== "demonstracao" ? { textShadow: value } : {});

  const root: CSSProperties = {
    width,
    height,
    display: "flex",
    position: "relative",
    overflow: "hidden",
    backgroundColor: background,
    color: text,
    fontFamily: fonts.body,
  };
  const layer: CSSProperties = { display: "flex", position: "absolute", left: 0, top: 0, width, height };
  const frame: CSSProperties = {
    position: "absolute",
    left: safe.x,
    top: safe.top,
    width: width - safe.x * 2,
    height: height - safe.top - safe.bottom,
    display: "flex",
    flexDirection: "column",
    justifyContent: "space-between",
  };
  const column = (gap: number, extra?: CSSProperties): CSSProperties => ({
    display: "flex",
    flexDirection: "column",
    gap,
    ...extra,
  });

  const title = (size = headlineSize(content.headline)) => (
    <div
      style={{
        display: "flex",
        fontFamily: fonts.display,
        fontWeight: 800,
        fontSize: size,
        lineHeight: 1.05,
        letterSpacing: -2,
        ...shadow("0 2px 18px rgba(0,0,0,0.45)"),
      }}
    >
      {content.headline}
    </div>
  );
  const body = (size = 42) => (
    <div
      style={{
        display: "flex",
        fontSize: size,
        lineHeight: 1.35,
        fontWeight: 500,
        ...shadow("0 2px 12px rgba(0,0,0,0.6)"),
      }}
    >
      {content.body}
    </div>
  );
  const cta = (align: Align = "flex-start") => (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        alignSelf: align,
        flexShrink: 0,
        whiteSpace: "nowrap",
        padding: align === "stretch" ? "30px 0" : "24px 52px",
        borderRadius: 999,
        backgroundColor: accent,
        color: onAccent,
        fontSize: align === "stretch" ? 46 : 42,
        fontWeight: 800,
        letterSpacing: -0.5,
        boxShadow: "0 10px 25px -5px rgba(0,0,0,0.35)",
      }}
    >
      {content.cta}
    </div>
  );
  const priceBlock = (align: Align = "flex-start") =>
    price ? (
      <div
        style={{
          display: "flex",
          alignSelf: align,
          flexShrink: 0,
          whiteSpace: "nowrap",
          padding: "16px 36px",
          borderRadius: 20,
          backgroundColor: accent,
          color: onAccent,
          fontFamily: fonts.display,
          fontWeight: 800,
          fontSize: 68,
        }}
      >
        {price}
      </div>
    ) : null;
  const brand = (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 20,
        fontSize: 30,
        fontWeight: 700,
        letterSpacing: 4,
        textTransform: "uppercase",
        opacity: 0.92,
        ...shadow("0 2px 10px rgba(0,0,0,0.5)"),
      }}
    >
      {logoSrc && (
        // eslint-disable-next-line @next/next/no-img-element -- compatível com Satori
        <img
          src={logoSrc}
          alt=""
          width={64}
          height={64}
          style={{ width: 64, height: 64, borderRadius: 16, objectFit: "cover" }}
        />
      )}
      <span>{businessName}</span>
    </div>
  );

  // Foto inteira com véu neutro só na área do texto; sem foto, fundo sólido com formas discretas.
  const fullPhoto = (shade: string) =>
    imageSrc ? (
      <>
        {/* eslint-disable-next-line @next/next/no-img-element -- o mesmo JSX vira PNG no Satori, que só aceita <img> */}
        <img src={imageSrc} alt="" width={width} height={height} style={{ ...layer, objectFit: "cover" }} />
        <div style={{ ...layer, backgroundImage: shade }} />
      </>
    ) : (
      <Decoration template={t} color={text} width={width} height={height} />
    );

  switch (t) {
    case "oferta":
      return (
        <div style={root}>
          {fullPhoto(SHADE.base)}
          <div style={frame}>
            {brand}
            <div style={column(26)}>
              {priceBlock()}
              {title()}
              {body()}
              <div style={{ display: "flex", marginTop: 14 }}>{cta()}</div>
            </div>
          </div>
        </div>
      );
    case "problema":
      return (
        <div style={root}>
          {fullPhoto(SHADE.centro)}
          <div style={{ ...frame, alignItems: "center", textAlign: "center" }}>
            {brand}
            <div style={column(32, { alignItems: "center" })}>
              {title()}
              {body()}
            </div>
            <div style={column(24, { alignItems: "center" })}>
              {priceBlock("center")}
              {cta("center")}
            </div>
          </div>
        </div>
      );
    case "beneficio":
      return (
        <div style={root}>
          {fullPhoto(SHADE.base)}
          <div style={frame}>
            {brand}
            <div style={column(36)}>
              <div style={{ display: "flex", gap: 32, alignItems: "stretch" }}>
                <div style={{ display: "flex", width: 12, borderRadius: 6, backgroundColor: accent }} />
                <div style={column(24, { flex: 1 })}>
                  {priceBlock()}
                  {title()}
                  {body()}
                </div>
              </div>
              {cta()}
            </div>
          </div>
        </div>
      );
    case "demonstracao": {
      const photoHeight = Math.round(height * PANEL_PHOTO[format]);
      return (
        <div style={{ ...root, flexDirection: "column" }}>
          <div
            style={{
              display: "flex",
              width,
              height: photoHeight,
              overflow: "hidden",
              backgroundColor: "rgba(255,255,255,0.06)",
            }}
          >
            {imageSrc && (
              // eslint-disable-next-line @next/next/no-img-element -- compatível com Satori
              <img
                src={imageSrc}
                alt=""
                width={width}
                height={photoHeight}
                style={{ width, height: photoHeight, objectFit: "cover" }}
              />
            )}
          </div>
          <div
            style={column(22, {
              flex: 1,
              justifyContent: "center",
              padding: `48px ${safe.x}px ${safe.bottom}px`,
            })}
          >
            <div style={{ display: "flex", width: 88, height: 8, borderRadius: 4, backgroundColor: accent }} />
            {brand}
            {title(Math.round(headlineSize(content.headline) * 0.82))}
            {body(36)}
            <div style={{ display: "flex", marginTop: 8 }}>{cta()}</div>
          </div>
          {/* Preço como selo no canto da foto: no painel não cabe ao lado do botão. */}
          {price && (
            <div style={{ display: "flex", position: "absolute", left: safe.x, top: photoHeight - 146 }}>
              {priceBlock()}
            </div>
          )}
        </div>
      );
    }
    case "conveniencia":
      return (
        <div style={root}>
          {fullPhoto(SHADE.topo)}
          <div style={frame}>
            <div style={column(24)}>
              {brand}
              {title()}
              {body()}
            </div>
            <div style={column(24)}>
              {priceBlock()}
              {cta("stretch")}
            </div>
          </div>
        </div>
      );
  }
}

/** Formas discretas na cor do texto (nunca na cor da marca) para a peça sem foto não ficar chapada. */
function Decoration({
  template,
  color,
  width,
  height,
}: {
  template: CreativeContent["template"];
  color: string;
  width: number;
  height: number;
}) {
  const shape = (style: CSSProperties) => (
    <div style={{ display: "flex", position: "absolute", backgroundColor: color, opacity: 0.06, ...style }} />
  );
  switch (template) {
    case "oferta":
      return shape({ width: 820, height: 820, borderRadius: 410, right: -300, top: -260 });
    case "problema":
      return shape({ width: 300, height: 14, borderRadius: 7, left: (width - 300) / 2, top: height * 0.3 });
    case "beneficio":
      return shape({ width, height: 300, left: 0, bottom: 0 });
    case "demonstracao":
      return null;
    case "conveniencia":
      return shape({ width: 920, height: 920, borderRadius: 460, right: -440, bottom: -400 });
  }
}
