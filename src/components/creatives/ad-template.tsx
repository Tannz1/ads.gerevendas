import type { CSSProperties } from "react";
import { FORMATS, type CreativeContent, type Format } from "@/contracts/creatives";

/**
 * Peça estática renderizada a partir dos dados (ADR 0003). O mesmo componente vale para a prévia no
 * navegador e para o PNG (`ImageResponse`/Satori): só flexbox, posição absoluta e estilos inline.
 * Texto nunca é "queimado" em imagem: tudo aqui é editável.
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
};

/** Margens de segurança: no Stories a interface do Instagram cobre topo e rodapé. */
export const SAFE_AREA: Record<Format, { x: number; top: number; bottom: number }> = {
  feed: { x: 88, top: 88, bottom: 88 },
  stories: { x: 88, top: 260, bottom: 300 },
};

function rgba(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

export function headlineSize(headline: string): number {
  const n = headline.length;
  return n <= 22 ? 104 : n <= 36 ? 88 : 72;
}

export function AdTemplate({ content, format, businessName, priceLabel, fonts, imageSrc }: AdTemplateProps) {
  const { width, height } = FORMATS[format];
  const safe = SAFE_AREA[format];
  const { background, accent, text } = content.colors;
  const t = content.template;
  const centered = t === "problema";
  const price = content.show_price ? priceLabel : null;

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
  const column: CSSProperties = {
    position: "absolute",
    left: safe.x,
    right: safe.x,
    top: safe.top,
    bottom: safe.bottom,
    display: "flex",
    flexDirection: "column",
    justifyContent: "space-between",
    alignItems: centered ? "center" : "flex-start",
    textAlign: centered ? "center" : "left",
  };

  return (
    <div style={root}>
      {imageSrc ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element -- o mesmo JSX vira PNG no Satori, que só aceita <img> */}
          <img
            src={imageSrc}
            alt=""
            width={width}
            height={height}
            style={{ position: "absolute", left: 0, top: 0, width, height, objectFit: "cover" }}
          />
          {/* Véu da cor de fundo: mantém o texto legível sobre qualquer foto. */}
          <div
            style={{
              display: "flex",
              position: "absolute",
              left: 0,
              top: 0,
              width,
              height,
              backgroundImage: `linear-gradient(180deg, ${rgba(background, 0.35)} 0%, ${rgba(background, 0.6)} 40%, ${rgba(background, 0.94)} 100%)`,
            }}
          />
        </>
      ) : (
        <Decoration template={t} accent={accent} width={width} height={height} />
      )}

      <div style={column}>
        <div
          style={{
            display: "flex",
            fontSize: 32,
            fontWeight: 700,
            letterSpacing: 4,
            textTransform: "uppercase",
            opacity: 0.85,
          }}
        >
          {businessName}
        </div>

        <div
          style={{ display: "flex", flexDirection: "column", alignItems: centered ? "center" : "flex-start", gap: 32 }}
        >
          <div style={{ display: "flex", alignItems: "stretch", gap: 32 }}>
            {t === "beneficio" && (
              <div style={{ display: "flex", width: 16, borderRadius: 8, backgroundColor: accent }} />
            )}
            <div
              style={{
                display: "flex",
                fontFamily: fonts.display,
                fontWeight: 800,
                fontSize: headlineSize(content.headline),
                lineHeight: 1.05,
                letterSpacing: -2,
              }}
            >
              {content.headline}
            </div>
          </div>
          <div
            style={{ display: "flex", fontSize: 44, lineHeight: 1.3, fontWeight: 500, opacity: 0.92, maxWidth: 860 }}
          >
            {content.body}
          </div>
          {price && (
            <div
              style={{
                display: "flex",
                marginTop: 8,
                padding: "16px 36px",
                borderRadius: 24,
                border: `4px solid ${accent}`,
                fontSize: 64,
                fontWeight: 700,
              }}
            >
              {price}
            </div>
          )}
        </div>

        <div
          style={{
            display: "flex",
            padding: "26px 52px",
            borderRadius: 999,
            backgroundColor: accent,
            color: background,
            fontSize: 42,
            fontWeight: 700,
          }}
        >
          {content.cta}
        </div>
      </div>
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
    <div style={{ display: "flex", position: "absolute", backgroundColor: accent, opacity: 0.1, ...style }} />
  );
  switch (template) {
    case "oferta":
      return shape({ width: 760, height: 760, borderRadius: 380, right: -260, top: -220 });
    case "problema":
      return shape({
        width: 240,
        height: 12,
        borderRadius: 6,
        left: (width - 240) / 2,
        top: height * 0.3,
        opacity: 0.4,
      });
    case "beneficio":
      return shape({ width: width, height: 280, left: 0, bottom: 0 });
    case "demonstracao":
      return shape({ width: 520, height: 520, borderRadius: 64, right: -160, bottom: -120 });
    case "conveniencia":
      return (
        <>
          {shape({ width: 900, height: 900, borderRadius: 450, right: -420, bottom: -380 })}
          {shape({ width: 560, height: 560, borderRadius: 280, right: -250, bottom: -210, opacity: 0.14 })}
        </>
      );
  }
}
