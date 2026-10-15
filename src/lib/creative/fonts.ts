import "server-only";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * Fontes da exportação PNG (next/og aceita ttf/otf/woff). Arquivos em `public/fonts` (licença
 * OFL ao lado), lidos uma vez por processo. `process.cwd()` é a raiz do app também no servidor
 * standalone (o `server.js` faz chdir para a própria pasta, onde o build copia `public/`).
 */

export type RenderFont = {
  name: "Inter" | "Plus Jakarta Sans";
  data: ArrayBuffer;
  weight: 400 | 600 | 700 | 800;
  style: "normal";
};

/** Famílias como o template deve referenciá-las no ImageResponse. */
export const RENDER_FONT_FAMILIES = { display: "Plus Jakarta Sans", body: "Inter" } as const;

const FILES: ReadonlyArray<Omit<RenderFont, "data" | "style"> & { file: string }> = [
  { name: "Inter", weight: 400, file: "inter-latin-400-normal.woff" },
  { name: "Inter", weight: 600, file: "inter-latin-600-normal.woff" },
  { name: "Plus Jakarta Sans", weight: 700, file: "plus-jakarta-sans-latin-700-normal.woff" },
  { name: "Plus Jakarta Sans", weight: 800, file: "plus-jakarta-sans-latin-800-normal.woff" },
];

let cached: Promise<RenderFont[]> | undefined;

async function load(): Promise<RenderFont[]> {
  const dir = join(process.cwd(), "public", "fonts");
  return Promise.all(
    FILES.map(async ({ file, name, weight }) => {
      const buf = await readFile(join(dir, file));
      const data = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
      return { name, weight, style: "normal" as const, data };
    }),
  );
}

/** Carrega (uma vez) as fontes da exportação. Uma falha não fica em cache: tenta de novo depois. */
export function loadRenderFonts(): Promise<RenderFont[]> {
  cached ??= load().catch((error: unknown) => {
    cached = undefined;
    throw error;
  });
  return cached;
}
