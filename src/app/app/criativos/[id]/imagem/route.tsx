import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { z } from "zod";
import { FORMATS, type Format } from "@/contracts/creatives";
import { AdTemplate } from "@/components/creatives/ad-template";
import { formatCents } from "@/lib/money";
import { isSupabaseConfigured } from "@/lib/public-env";
import { loadCreative } from "@/server/creatives-data";

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

const formatSchema = z.enum(Object.keys(FORMATS) as [Format, ...Format[]]).catch("feed");

/** PNG da peça para baixar. Só membros da empresa (sessão + RLS); outros recebem 404. */
export async function GET(request: Request, ctx: RouteContext<"/app/criativos/[id]/imagem">) {
  const { id } = await ctx.params;
  if (!isSupabaseConfigured() || !z.uuid().safeParse(id).success) return new Response(null, { status: 404 });

  const view = await loadCreative(id);
  if (!view) return new Response(null, { status: 404 });

  const format = formatSchema.parse(new URL(request.url).searchParams.get("formato"));
  const { width, height } = FORMATS[format];
  const priceLabel = view.price_cents === null ? null : formatCents(view.price_cents, view.currency);

  return new ImageResponse(
    <AdTemplate
      content={view.content}
      format={format}
      businessName={view.business_name}
      priceLabel={priceLabel}
      fonts={{ display: "Display", body: "Body" }}
    />,
    {
      width,
      height,
      fonts: await loadFonts(),
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Disposition": `attachment; filename="anuncio-${view.angle_key}-${format}.png"`,
      },
    },
  );
}
