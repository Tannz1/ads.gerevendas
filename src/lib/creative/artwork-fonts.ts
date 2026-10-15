import localFont from "next/font/local";

/**
 * Fontes da ARTE das peças no editor: exatamente os mesmos arquivos que `/api/render` entrega
 * ao Satori (`public/fonts`), para o preview quebrar linhas igual ao PNG exportado.
 * `preload: false` evita baixar essas fontes em páginas que não mostram peças.
 */
export const artworkBody = localFont({
  src: [
    { path: "../../../public/fonts/inter-latin-400-normal.woff", weight: "400", style: "normal" },
    { path: "../../../public/fonts/inter-latin-600-normal.woff", weight: "600", style: "normal" },
  ],
  variable: "--font-artwork-body",
  display: "block",
  preload: false,
});

export const artworkDisplay = localFont({
  src: [
    { path: "../../../public/fonts/plus-jakarta-sans-latin-700-normal.woff", weight: "700", style: "normal" },
    { path: "../../../public/fonts/plus-jakarta-sans-latin-800-normal.woff", weight: "800", style: "normal" },
  ],
  variable: "--font-artwork-display",
  display: "block",
  preload: false,
});
