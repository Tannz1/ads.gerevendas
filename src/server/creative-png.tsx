import "server-only";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { FORMATS, type Format } from "@/contracts/creatives";
import { AdTemplate } from "@/components/creatives/ad-template";
import { formatCents } from "@/lib/money";
import { loadImageDataUri, type CreativeView } from "./creatives-data";

// Fontes em public/fonts (copiado para a imagem standalone). Lidas uma vez por processo.
let fonts: Promise<Array<{ name: string; data: Buffer; weight: 500 | 700 | 800; style: "normal" }>> | undefined;
function loadFonts() {
  const file = (name: string) => readFile(join(process.cwd(), "public", "fonts", name));
  fonts ??= Promise.all([
    file("inter-500-latin.woff").then((data) => ({
      name: "Body",
      data,
      weight: 500 as const,
      style: "normal" as const,
    })),
    file("inter-700-latin.woff").then((data) => ({
      name: "Body",
      data,
      weight: 700 as const,
      style: "normal" as const,
    })),
    file("plus-jakarta-sans-800-latin.woff").then((data) => ({
      name: "Display",
      data,
      weight: 800 as const,
      style: "normal" as const,
    })),
  ]);
  return fonts;
}

/** PNG da peça no formato pedido: o mesmo arquivo que o cliente baixa e que vai para a Meta. */
export async function renderCreativePng(
  view: CreativeView,
  format: Format,
  headers?: Record<string, string>,
): Promise<ImageResponse> {
  const { width, height } = FORMATS[format];
  const priceLabel = view.price_cents === null ? null : formatCents(view.price_cents, view.currency);
  const imageSrc = view.image ? await loadImageDataUri(view.image) : null;
  return new ImageResponse(
    <AdTemplate
      content={view.content}
      format={format}
      businessName={view.business_name}
      priceLabel={priceLabel}
      fonts={{ display: "Display", body: "Body" }}
      imageSrc={imageSrc}
    />,
    { width, height, fonts: await loadFonts(), headers },
  );
}
