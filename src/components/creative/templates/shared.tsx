import type { CSSProperties, ReactNode } from "react";
import { FORMAT_SPECS, type CreativeDesign } from "@/contracts/creative";
import {
  AA_BODY,
  AA_LARGE,
  INK,
  WHITE,
  adjustForContrast,
  contrastRatio,
  distinct,
  ensureContrast,
  isLight,
  minContrast,
  mix,
  readableTextColor,
  shade,
  tint,
} from "@/lib/creative/color";
import { hasUnsupportedChars, splitPrice, type FitField, type TextFit } from "@/lib/creative/typography";
import { formatCents } from "@/lib/money";

/**
 * Peças compatíveis com Satori (next/og) e com o DOM: só estilos inline, `display: flex` em
 * todo elemento, posição absoluta permitida, sem grid, sem variáveis CSS e sem classes.
 */

export type ArtworkFonts = { display: string; body: string };
export type TemplateProps = { design: CreativeDesign; fonts: ArtworkFonts };

/** Par texto/fundo declarado pelos templates para auditoria de contraste (testes). */
export type ContrastPair = { role: string; fg: string; bgs: string[]; min: number };

export const PAPER = "#F7F5F0";

export function canvasOf(design: CreativeDesign) {
  const spec = FORMAT_SPECS[design.format];
  return {
    ...spec,
    stories: design.format === "stories_9x16",
    contentWidth: spec.width - spec.safe.left - spec.safe.right,
    contentHeight: spec.height - spec.safe.top - spec.safe.bottom,
  };
}

/**
 * Preço exibido: só quando `show_price` e sempre a partir de `price_cents` (formatCents). Se o
 * símbolo da moeda não existir nas fontes da peça (ex.: ₹), usa o código ISO ("INR 24,90")
 * para não depender de fontes externas.
 */
export function displayPrice(design: CreativeDesign): string | null {
  if (!design.show_price || design.price_cents === null) return null;
  const formatted = formatCents(design.price_cents, design.currency);
  if (!hasUnsupportedChars(formatted)) return formatted;
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: design.currency,
    currencyDisplay: "code",
  }).format(design.price_cents / 100);
}

/** Primeira letra/dígito do nome do negócio, para o monograma. */
export function monogramOf(name: string): string {
  const match = /[\p{L}\p{N}]/u.exec(name);
  return match ? match[0].toLocaleUpperCase("pt-BR") : "•";
}

// ---------------------------------------------------------------- paleta

export type BasePalette = {
  brand: string;
  /** Cores de fundo consideradas no contraste (sólido = 1 cor; gradiente = paradas). */
  stops: string[];
  /** Valor CSS do fundo. */
  background: string;
  /** Fundo claro (texto escuro)? */
  light: boolean;
  ink: string;
  inkSoft: string;
  /** Acento gráfico (barras, formas) com contraste ≥ 3:1 sobre o fundo. */
  accent: string;
  ctaBg: string;
  ctaText: string;
  /** Cor tom-sobre-tom para formas decorativas que só aumentam o contraste do texto. */
  decoTone: string;
};

/**
 * Paleta base para um fundo da marca. O gradiente só caminha na direção que AUMENTA o
 * contraste do texto escolhido (escurece sob texto claro, clareia sob texto escuro), então
 * o texto mantém ≥ 4,5:1 em qualquer ponto do fundo. Acentos da marca que precisariam ser
 * muito escurecidos (ex.: amarelo vira oliva) dão lugar à tinta.
 */
export function basePalette(
  design: Pick<CreativeDesign, "brand_color" | "background">,
  options: { angle?: number; paper?: string } = {},
): BasePalette {
  const brand = design.brand_color.toUpperCase();
  const angle = options.angle ?? 160;

  if (design.background === "claro") {
    const paper = options.paper ?? mix(PAPER, brand, 0.035);
    const ink = readableTextColor(paper, { dark: mix(INK, brand, 0.12) });
    const brandOk = contrastRatio(brand, paper) >= AA_LARGE;
    const ctaBg = brandOk ? brand : ink;
    return {
      brand,
      stops: [paper],
      background: paper,
      light: true,
      ink,
      inkSoft: ensureContrast(mix(ink, paper, 0.22), paper, AA_BODY),
      accent: adjustForContrast(brand, paper, AA_LARGE, 0.3) ?? ink,
      ctaBg,
      ctaText: brandOk
        ? readableTextColor(ctaBg)
        : (adjustForContrast(brand, ctaBg, AA_BODY, 0.3) ?? readableTextColor(ctaBg)),
      decoTone: mix(paper, brand, 0.16),
    };
  }

  const lightBrand = isLight(brand);
  const stops =
    design.background === "gradiente"
      ? lightBrand
        ? [tint(brand, 0.42), brand]
        : [brand, mix(brand, INK, 0.55)]
      : [brand];
  const background =
    stops.length === 1 ? brand : `linear-gradient(${angle}deg, ${stops[0]} 0%, ${stops[stops.length - 1]} 100%)`;
  const ink = readableTextColor(stops, { dark: mix(INK, brand, 0.1) });
  const inkIsLight = isLight(ink);
  // Formas tom sobre tom: na direção que aumenta o contraste; se ficarem invisíveis (marca
  // quase preta ou quase branca), invertem suavemente.
  const darker = mix(brand, INK, 0.3);
  const lighter = tint(brand, 0.38);
  const decoTone = inkIsLight
    ? distinct(darker, brand)
      ? darker
      : tint(brand, 0.1)
    : distinct(lighter, brand, 1.1)
      ? lighter
      : shade(brand, 0.08);
  const ctaBg = ink;
  return {
    brand,
    stops,
    background,
    light: !inkIsLight,
    ink,
    inkSoft: ensureContrast(mix(ink, stops[0], 0.16), [...stops, decoTone], AA_BODY),
    accent: inkIsLight
      ? ensureContrast(tint(brand, 0.62), stops, AA_LARGE)
      : ensureContrast(mix(INK, brand, 0.15), stops, AA_LARGE),
    ctaBg,
    ctaText: adjustForContrast(brand, ctaBg, AA_BODY, 0.3) ?? readableTextColor(ctaBg),
    decoTone,
  };
}

/** Pares de contraste da paleta base (usados pelos testes de legibilidade). */
export function basePairs(p: BasePalette): ContrastPair[] {
  return [
    { role: "título", fg: p.ink, bgs: [...p.stops, p.decoTone], min: AA_LARGE },
    { role: "texto", fg: p.inkSoft, bgs: [...p.stops, p.decoTone], min: AA_BODY },
    { role: "botão", fg: p.ctaText, bgs: [p.ctaBg], min: AA_BODY },
  ];
}

export function meets(pair: ContrastPair): boolean {
  return minContrast(pair.fg, pair.bgs) >= pair.min - 1e-9;
}

// ---------------------------------------------------------------- blocos

/** Caixa de texto medida pelo editor (`data-fit`): largura e altura máximas fixas. */
export function FitText({
  field,
  fit,
  children,
  color,
  family,
  weight,
  tracking = 0,
  align = "left",
  balance = false,
  pretty = false,
  fixedWidth = true,
  style,
}: {
  field: FitField;
  fit: TextFit;
  children: ReactNode;
  color: string;
  family: string;
  weight: number;
  /** letter-spacing em em. */
  tracking?: number;
  align?: "left" | "center";
  /** Equilibra o comprimento das linhas (títulos). */
  balance?: boolean;
  /** Evita palavra solitária na última linha (textos). */
  pretty?: boolean;
  /** false: a caixa abraça o texto até a largura máxima (botões, preço). */
  fixedWidth?: boolean;
  style?: CSSProperties;
}) {
  const singleLine = fit.lines === 1 && !balance && !pretty;
  return (
    <div
      data-fit={field}
      style={{
        display: "flex",
        flexShrink: 0,
        boxSizing: "border-box",
        ...(fixedWidth ? { width: fit.width } : { maxWidth: fit.width }),
        maxHeight: fit.maxHeight,
        ...(fit.padding ? { paddingTop: fit.padding, paddingBottom: fit.padding } : {}),
        overflow: "hidden",
        justifyContent: align === "center" ? "center" : "flex-start",
        textAlign: align,
        color,
        fontFamily: family,
        fontWeight: weight,
        fontSize: fit.fontSize,
        lineHeight: fit.lineHeight,
        letterSpacing: Math.round(tracking * fit.fontSize * 100) / 100,
        ...(singleLine ? { whiteSpace: "nowrap" as const } : {}),
        ...(balance ? { textWrap: "balance" as const } : pretty ? { textWrap: "pretty" as const } : {}),
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function Monogram({
  letter,
  size,
  bg,
  color,
  family,
  ring,
}: {
  letter: string;
  size: number;
  bg: string;
  color: string;
  family: string;
  ring?: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexShrink: 0,
        boxSizing: "border-box",
        width: size,
        height: size,
        borderRadius: size,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: bg,
        color,
        fontFamily: family,
        fontWeight: 800,
        fontSize: Math.round(size * 0.48),
        lineHeight: 1,
        ...(ring ? { border: `${Math.max(2, Math.round(size * 0.04))}px solid ${ring}` } : {}),
      }}
    >
      {letter}
    </div>
  );
}

/** Seta desenhada com bordas (o subconjunto latino das fontes não tem "→"). */
export function Chevron({ size, color, background }: { size: number; color: string; background: string }) {
  const arm = Math.round(size * 0.26);
  const stroke = Math.max(3, Math.round(size * 0.085));
  return (
    <div
      style={{
        display: "flex",
        flexShrink: 0,
        boxSizing: "border-box",
        width: size,
        height: size,
        borderRadius: size,
        backgroundColor: background,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          display: "flex",
          boxSizing: "border-box",
          width: arm,
          height: arm,
          marginLeft: -Math.round(arm * 0.35),
          borderTop: `${stroke}px solid ${color}`,
          borderRight: `${stroke}px solid ${color}`,
          transform: "rotate(45deg)",
        }}
      />
    </div>
  );
}

/** Botão em pílula com seta. */
export function CtaPill({
  text,
  fit,
  bg,
  color,
  family,
  fullWidth,
  shadow,
}: {
  text: string;
  fit: TextFit;
  bg: string;
  color: string;
  family: string;
  /** Largura total (stories): texto centralizado. */
  fullWidth?: number;
  shadow?: string;
}) {
  // A caixa do texto já tem entrelinha folgada (1,28); o respiro da pílula compensa.
  const padY = Math.round(fit.fontSize * 0.52);
  const padX = Math.round(fit.fontSize * 0.95);
  const icon = Math.round(fit.fontSize * 1.18);
  return (
    <div
      style={{
        display: "flex",
        flexShrink: 0,
        boxSizing: "border-box",
        alignItems: "center",
        justifyContent: fullWidth ? "space-between" : "flex-start",
        ...(fullWidth ? { width: fullWidth } : {}),
        paddingTop: padY,
        paddingBottom: padY,
        paddingLeft: padX,
        paddingRight: Math.round(padY * 0.7),
        borderRadius: 999,
        backgroundColor: bg,
        ...(shadow ? { boxShadow: shadow } : {}),
      }}
    >
      <FitText field="cta" fit={fit} color={color} family={family} weight={700} tracking={-0.01} fixedWidth={false}>
        {text}
      </FitText>
      <div style={{ display: "flex", width: Math.round(fit.fontSize * 0.55), flexShrink: 0 }} />
      <Chevron size={icon} color={bg} background={color} />
    </div>
  );
}

/** Preço no estilo varejo: símbolo menor no alto e valor grande. */
export function PriceText({
  formatted,
  fit,
  color,
  family,
  align = "left",
  prefixColor,
}: {
  formatted: string;
  fit: TextFit;
  color: string;
  family: string;
  align?: "left" | "center";
  prefixColor?: string;
}) {
  const { prefix, amount } = splitPrice(formatted);
  const size = fit.fontSize;
  return (
    <div
      data-fit="price"
      style={{
        display: "flex",
        flexShrink: 0,
        boxSizing: "border-box",
        maxWidth: fit.width,
        maxHeight: fit.maxHeight,
        overflow: "hidden",
        alignItems: "flex-start",
        justifyContent: align === "center" ? "center" : "flex-start",
        whiteSpace: "nowrap",
        color,
        fontFamily: family,
        fontWeight: 800,
        lineHeight: fit.lineHeight,
      }}
    >
      {prefix ? (
        <div
          style={{
            display: "flex",
            fontSize: Math.round(size * 0.4),
            // Alinha o topo do símbolo ao topo dos algarismos.
            marginTop: Math.round(size * 0.2),
            marginRight: Math.round(size * 0.07),
            color: prefixColor ?? color,
            letterSpacing: 0,
          }}
        >
          {prefix}
        </div>
      ) : null}
      <div
        style={{
          display: "flex",
          fontSize: size,
          letterSpacing: Math.round(size * -0.035),
        }}
      >
        {amount}
      </div>
    </div>
  );
}

/** Marca: monograma + nome do negócio. */
export function BrandMark({
  name,
  fit,
  size,
  monoBg,
  monoText,
  color,
  fonts,
  align = "left",
  uppercase = false,
}: {
  name: string;
  fit: TextFit;
  size: number;
  monoBg: string;
  monoText: string;
  color: string;
  fonts: ArtworkFonts;
  align?: "left" | "center";
  uppercase?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexShrink: 0,
        alignItems: "center",
        justifyContent: align === "center" ? "center" : "flex-start",
      }}
    >
      <Monogram letter={monogramOf(name)} size={size} bg={monoBg} color={monoText} family={fonts.display} />
      <div style={{ display: "flex", width: Math.round(size * 0.28), flexShrink: 0 }} />
      <FitText
        field="business_name"
        fit={fit}
        color={color}
        family={fonts.body}
        weight={600}
        tracking={uppercase ? 0.14 : -0.005}
        fixedWidth={false}
        style={uppercase ? { textTransform: "uppercase" } : undefined}
      >
        {name}
      </FitText>
    </div>
  );
}

/** Elemento decorativo absoluto (pode sangrar para fora da peça). */
export function Shape({ style }: { style: CSSProperties }) {
  return <div style={{ display: "flex", position: "absolute", boxSizing: "border-box", ...style }} />;
}

/** Espaçador flexível. */
export function Spacer({ size, grow }: { size?: number; grow?: number }) {
  return (
    <div
      style={{
        display: "flex",
        flexShrink: 0,
        ...(size !== undefined ? { height: size, minHeight: size } : {}),
        ...(grow ? { flexGrow: grow } : {}),
      }}
    />
  );
}

/** Raiz da peça no tamanho nativo. */
export function ArtboardRoot({
  design,
  background,
  children,
  fonts,
}: {
  design: CreativeDesign;
  background: string;
  children: ReactNode;
  fonts: ArtworkFonts;
}) {
  const c = canvasOf(design);
  return (
    <div
      style={{
        display: "flex",
        position: "relative",
        boxSizing: "border-box",
        width: c.width,
        height: c.height,
        overflow: "hidden",
        ...(background.includes("gradient") ? { backgroundImage: background } : { backgroundColor: background }),
        fontFamily: fonts.body,
        color: WHITE,
      }}
    >
      {children}
    </div>
  );
}

/**
 * Coluna de conteúdo exatamente na área segura. Todo texto fica aqui dentro; `data-fit="layout"`
 * deixa o editor detectar (improvável) estouro do conjunto.
 */
export function SafeColumn({
  design,
  children,
  align = "stretch",
}: {
  design: CreativeDesign;
  children: ReactNode;
  align?: "stretch" | "center" | "flex-start";
}) {
  const c = canvasOf(design);
  return (
    <div
      data-fit="layout"
      style={{
        display: "flex",
        position: "absolute",
        boxSizing: "border-box",
        top: c.safe.top,
        left: c.safe.left,
        width: c.contentWidth,
        height: c.contentHeight,
        flexDirection: "column",
        alignItems: align,
        overflow: "hidden",
      }}
    >
      {children}
    </div>
  );
}
