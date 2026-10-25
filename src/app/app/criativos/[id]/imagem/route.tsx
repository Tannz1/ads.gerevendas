import { z } from "zod";
import { FORMATS, type Format } from "@/contracts/creatives";
import { isSupabaseConfigured } from "@/lib/public-env";
import { renderCreativePng } from "@/server/creative-png";
import { loadCreative } from "@/server/creatives-data";

const formatSchema = z.enum(Object.keys(FORMATS) as [Format, ...Format[]]).catch("feed");

/** PNG da peça para baixar. Só membros da empresa (sessão + RLS); outros recebem 404. */
export async function GET(request: Request, ctx: RouteContext<"/app/criativos/[id]/imagem">) {
  const { id } = await ctx.params;
  if (!isSupabaseConfigured() || !z.uuid().safeParse(id).success) return new Response(null, { status: 404 });

  const view = await loadCreative(id);
  if (!view) return new Response(null, { status: 404 });

  const format = formatSchema.parse(new URL(request.url).searchParams.get("formato"));
  return renderCreativePng(view, format, {
    "Cache-Control": "private, no-store",
    "Content-Disposition": `attachment; filename="anuncio-${view.angle_key}-${format}.png"`,
  });
}
