/**
 * Utilitários de cor para as peças (sem dependências; roda no servidor, no navegador e no Satori).
 * Contraste segundo a WCAG 2.x: texto comum ≥ 4,5:1; texto grande (título) e elementos gráficos ≥ 3:1.
 */

export type Rgb = { r: number; g: number; b: number };

export const WHITE = "#FFFFFF";
export const BLACK = "#000000";
/** Tinta escura padrão das peças (quase preto azulado, mais elegante que preto puro). */
export const INK = "#0B1020";

/** Contraste mínimo para texto comum (WCAG AA). */
export const AA_BODY = 4.5;
/** Contraste mínimo para texto grande e elementos gráficos (WCAG AA). */
export const AA_LARGE = 3;

const HEX = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/i;

export function hexToRgb(hex: string): Rgb {
  const match = HEX.exec(hex.trim());
  if (!match) throw new Error(`Cor inválida: ${hex}`);
  let value = match[1];
  if (value.length === 3) value = [...value].map((c) => c + c).join("");
  const n = Number.parseInt(value, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export function rgbToHex({ r, g, b }: Rgb): string {
  const part = (v: number) =>
    Math.round(Math.min(255, Math.max(0, v)))
      .toString(16)
      .padStart(2, "0");
  return `#${part(r)}${part(g)}${part(b)}`.toUpperCase();
}

function channel(v: number): number {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** Luminância relativa (0 = preto, 1 = branco). */
export function relativeLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** Razão de contraste entre duas cores (1 a 21). */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Menor contraste de `color` contra todas as cores de fundo (ex.: paradas de um gradiente). */
export function minContrast(color: string, backgrounds: string | readonly string[]): number {
  const list = typeof backgrounds === "string" ? [backgrounds] : backgrounds;
  return Math.min(...list.map((bg) => contrastRatio(color, bg)));
}

/** Mistura linear em sRGB: `weight` 0 devolve `a`, 1 devolve `b`. */
export function mix(a: string, b: string, weight: number): string {
  const w = Math.min(1, Math.max(0, weight));
  const x = hexToRgb(a);
  const y = hexToRgb(b);
  return rgbToHex({ r: x.r + (y.r - x.r) * w, g: x.g + (y.g - x.g) * w, b: x.b + (y.b - x.b) * w });
}

/** Clareia em direção ao branco (0 a 1). */
export function tint(hex: string, amount: number): string {
  return mix(hex, WHITE, amount);
}

/** Escurece em direção ao preto (0 a 1). */
export function shade(hex: string, amount: number): string {
  return mix(hex, BLACK, amount);
}

/** Cor sólida equivalente a `overlay` com opacidade `alpha` aplicada sobre `base`. */
export function blend(base: string, overlay: string, alpha: number): string {
  return mix(base, overlay, alpha);
}

/** `rgba()` para uso em estilos (Satori e navegador aceitam). */
export function withAlpha(hex: string, alpha: number): string {
  const { r, g, b } = hexToRgb(hex);
  const a = Math.round(Math.min(1, Math.max(0, alpha)) * 1000) / 1000;
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

/** Saturação (0 a 1) no modelo HSV: 0 = cinza; 1 = cor pura. */
export function saturation(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  const max = Math.max(r, g, b);
  return max === 0 ? 0 : (max - Math.min(r, g, b)) / max;
}

export function isLight(hex: string): boolean {
  // Ponto em que o contraste com branco e com preto se igualam (~0,179).
  return relativeLuminance(hex) > 0.179;
}

/**
 * Cor de texto legível sobre um fundo (ou sobre todas as cores de um gradiente). Tenta as
 * preferidas (`light`/`dark`) e, se nenhuma atingir o mínimo, recorre a branco/preto puros.
 * Sempre devolve a de maior contraste quando nada atinge o mínimo.
 */
export function readableTextColor(
  background: string | readonly string[],
  options: { minContrast?: number; light?: string; dark?: string } = {},
): string {
  const min = options.minContrast ?? AA_BODY;
  const light = options.light ?? WHITE;
  const dark = options.dark ?? INK;
  const bgs = typeof background === "string" ? [background] : background;
  const avg = bgs.reduce((sum, bg) => sum + relativeLuminance(bg), 0) / bgs.length;
  const preferDark = avg > 0.179;
  const candidates = preferDark ? [dark, light, BLACK, WHITE] : [light, dark, WHITE, BLACK];
  for (const c of candidates) if (minContrast(c, bgs) >= min) return c;
  return candidates.reduce((best, c) => (minContrast(c, bgs) > minContrast(best, bgs) ? c : best));
}

/**
 * Ajusta `color` (escurecendo sobre fundos claros, clareando sobre escuros) até atingir o
 * contraste mínimo, preservando o matiz o máximo possível. Devolve null se precisar deslocar
 * a cor mais que `maxShift` (0 a 1) — ex.: amarelo escurecido vira oliva; aí é melhor outra cor.
 */
export function adjustForContrast(
  color: string,
  background: string | readonly string[],
  min = AA_BODY,
  maxShift = 1,
): string | null {
  const bgs = typeof background === "string" ? [background] : background;
  if (minContrast(color, bgs) >= min) return color;
  const avg = bgs.reduce((sum, bg) => sum + relativeLuminance(bg), 0) / bgs.length;
  const toward = avg > 0.179 ? BLACK : WHITE;
  for (let step = 1; step <= 20 && step * 0.05 <= maxShift + 1e-9; step++) {
    const candidate = mix(color, toward, step * 0.05);
    if (minContrast(candidate, bgs) >= min) return candidate;
  }
  return null;
}

/** Como `adjustForContrast`, mas sempre devolve uma cor legível (cai para branco/tinta). */
export function ensureContrast(color: string, background: string | readonly string[], min = AA_BODY): string {
  return adjustForContrast(color, background, min) ?? readableTextColor(background, { minContrast: min });
}

/** true quando duas cores são visualmente distinguíveis como superfícies (não como texto). */
export function distinct(a: string, b: string, min = 1.25): boolean {
  return contrastRatio(a, b) >= min;
}
