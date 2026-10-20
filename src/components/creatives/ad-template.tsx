import type { CSSProperties, ReactNode } from "react";
import { FORMATS, type CreativeContent, type Format } from "@/contracts/creatives";

/**
 * Peça estática (ADR 0003). O mesmo JSX serve à prévia e ao PNG (Satori: flexbox e estilos inline).
 * Cada ângulo tem composição própria, para que as peças do mesmo anúncio não pareçam iguais.
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

function rgba(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

export function AdTemplate({ content, format, businessName, priceLabel, fonts, imageSrc, logoSrc }: AdTemplateProps) {
  const { width, height } = FORMATS[format];
  const safe = SAFE_AREA[format];
  const { background, accent, text } = content.colors;
  const price = content.show_price ? priceLabel : null;
  const t = content.template;

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

  const title = (
    <div
      style={{
        display: "flex",
        fontFamily: fonts.display,
        fontWeight: 800,
        fontSize: headlineSize(content.headline),
        lineHeight: 1.02,
        letterSpacing: -2,
      }}
    >
      {content.headline}
    </div>
  );
  const body = (
    <div style={{ display: "flex", fontSize: 42, lineHeight: 1.3, fontWeight: 500, opacity: 0.94 }}>{content.body}</div>
  );
  const cta = (
    <div
      style={{
        display: "flex",
        padding: "24px 48px",
        borderRadius: 999,
        backgroundColor: accent,
        color: background,
        fontSize: 40,
        fontWeight: 700,
      }}
    >
      {content.cta}
    </div>
  );
  const priceBlock = price ? (
    <div
      style={{
        display: "flex",
        padding: "18px 40px",
        borderRadius: 20,
        backgroundColor: accent,
        color: background,
        fontFamily: fonts.display,
        fontWeight: 800,
        fontSize: 72,
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
        opacity: 0.9,
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

  // Foto de fundo com véu da cor da marca, sempre por baixo do texto.
  const photo = imageSrc ? (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element -- o mesmo JSX vira PNG no Satori, que só aceita <img> */}
      <img src={imageSrc} alt="" width={width} height={height} style={{ ...layer, objectFit: "cover" }} />
      <div
        style={{
          ...layer,
          backgroundImage: `linear-gradient(180deg, ${rgba(background, 0.25)} 0%, ${rgba(background, 0.55)} 45%, ${rgba(background, 0.96)} 100%)`,
        }}
      />
    </>
  ) : null;

  // Composição por ângulo.
  let scene: ReactNode;
  switch (t) {
    case "oferta":
      scene = (
        <div style={frame}>
          {brand}
          <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
            {priceBlock}
            {title}
            {body}
          </div>
          {cta}
        </div>
      );
      break;
    case "problema":
      scene = (
        <div style={{ ...frame, alignItems: "center", textAlign: "center" }}>
          {brand}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 32 }}>
            {title}
            {body}
          </div>
          {cta}
        </div>
      );
      break;
    case "beneficio":
      scene = (
        <div style={frame}>
          {brand}
          <div style={{ display: "flex", gap: 36, alignItems: "stretch" }}>
            <div style={{ display: "flex", width: 14, borderRadius: 7, backgroundColor: accent }} />
            <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
              {title}
              {body}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
            {priceBlock}
            {cta}
          </div>
        </div>
      );
      break;
    case "demonstracao":
      scene = (
        <div style={frame}>
          {brand}
          <div style={{ display: "flex", flexDirection: "column", gap: 28, maxWidth: "78%" }}>
            {title}
            {body}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
            {priceBlock}
            {cta}
          </div>
        </div>
      );
      break;
    case "conveniencia":
      scene = (
        <div style={frame}>
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            {brand}
            {title}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
            {body}
            {priceBlock}
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              padding: "28px 0",
              borderRadius: 32,
              backgroundColor: accent,
              color: background,
              fontSize: 48,
              fontWeight: 800,
            }}
          >
            {content.cta}
          </div>
        </div>
      );
      break;
  }

  return (
    <div style={root}>
      {photo ?? <Decoration template={t} accent={accent} width={width} height={height} />}
      {scene}
    </div>
  );
}

function Decoration({
  template,
  accent,
  width,
  height,
}: {
  template: CreativeContent["template"];
  accent: string;
  width: number;
  height: number;
}) {
  const shape = (style: CSSProperties) => (
    <div style={{ display: "flex", position: "absolute", backgroundColor: accent, opacity: 0.12, ...style }} />
  );
  switch (template) {
    case "oferta":
      return shape({ width: 820, height: 820, borderRadius: 410, right: -300, top: -260 });
    case "problema":
      return shape({
        width: 300,
        height: 14,
        borderRadius: 7,
        left: (width - 300) / 2,
        top: height * 0.3,
        opacity: 0.4,
      });
    case "beneficio":
      return shape({ width, height: 300, left: 0, bottom: 0 });
    case "demonstracao":
      return shape({ width: 560, height: 560, borderRadius: 72, right: -180, bottom: -140 });
    case "conveniencia":
      return shape({ width: 920, height: 920, borderRadius: 460, right: -440, bottom: -400 });
  }
}
