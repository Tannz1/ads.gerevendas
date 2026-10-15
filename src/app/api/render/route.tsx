import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";
import { CreativeArtwork } from "@/components/creative/artwork";
import { apiError, type ApiErrorCode } from "@/contracts/api";
import { FORMAT_SPECS, type CreativeDesign } from "@/contracts/creative";
import { CORRELATION_HEADER, ensureCorrelationId } from "@/lib/correlation";
import { RENDER_FONT_FAMILIES, loadRenderFonts } from "@/lib/creative/fonts";
import { issuesToFieldErrors, validateDesign } from "@/lib/creative/validate";
import { log } from "@/lib/logger";
import { isSupabaseConfigured } from "@/lib/public-env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * POST /api/render — exporta a peça em PNG no tamanho final (FORMAT_SPECS) com o mesmo JSX do
 * editor. Não grava nada e não chama serviços externos (fontes locais; caracteres fora das
 * fontes são removidos antes de desenhar). Nunca loga textos da peça.
 */

const MAX_BODY_BYTES = 16 * 1024;
const RATE_LIMIT = 30;
const RATE_WINDOW_MS = 60_000;
const RATE_MAX_KEYS = 10_000;

/** Janela deslizante em memória, por IP (por instância; suficiente para um container). */
const hits = new Map<string, number[]>();

function rateLimit(key: string, now: number): { ok: true } | { ok: false; retryAfterSeconds: number } {
  const since = now - RATE_WINDOW_MS;
  const recent = (hits.get(key) ?? []).filter((t) => t > since);
  if (recent.length >= RATE_LIMIT) {
    hits.set(key, recent);
    return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil((recent[0] + RATE_WINDOW_MS - now) / 1000)) };
  }
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > RATE_MAX_KEYS) {
    for (const [k, times] of hits) {
      if (times[times.length - 1] <= since) hits.delete(k);
    }
  }
  return { ok: true };
}

/** Primeiro salto do X-Forwarded-For (o proxy reverso define o cliente original). */
function clientIp(request: NextRequest): string {
  const first = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (first) return first.slice(0, 64);
  return request.headers.get("x-real-ip")?.trim().slice(0, 64) || "desconhecido";
}

/** Lê o corpo com limite de bytes (não confia só no Content-Length). */
async function readLimited(request: NextRequest, limit: number): Promise<string | null> {
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(value);
  }
  const all = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    all.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(all);
}

/** Elemento da arte (fora de handler para manter o handler livre de JSX). */
function artworkElement(design: CreativeDesign) {
  return <CreativeArtwork design={design} fonts={RENDER_FONT_FAMILIES} />;
}

async function handleRender(request: NextRequest): Promise<Response> {
  const started = performance.now();
  const correlationId = ensureCorrelationId(request.headers.get(CORRELATION_HEADER));
  const baseHeaders = { "Cache-Control": "no-store", [CORRELATION_HEADER]: correlationId };

  const fail = (
    status: number,
    code: ApiErrorCode,
    message: string,
    reason: string,
    extra?: { fieldErrors?: Record<string, string[]>; headers?: Record<string, string> },
  ) => {
    log(status >= 500 ? "error" : "warn", "render.rejected", { correlation_id: correlationId, status, reason });
    return Response.json(apiError(code, message, correlationId, extra?.fieldErrors), {
      status,
      headers: { ...baseHeaders, ...extra?.headers },
    });
  };

  const limited = rateLimit(clientIp(request), Date.now());
  if (!limited.ok) {
    return fail(
      429,
      "quota_exceeded",
      "Muitas exportações seguidas. Aguarde um minuto e tente de novo.",
      "rate_limited",
      { headers: { "Retry-After": String(limited.retryAfterSeconds) } },
    );
  }

  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    return fail(413, "validation_failed", "A peça enviada é grande demais.", "body_too_large");
  }

  if (isSupabaseConfigured()) {
    try {
      const supabase = await createSupabaseServerClient();
      const { data, error } = await supabase.auth.getClaims();
      if (error || typeof data?.claims?.sub !== "string") {
        return fail(401, "not_authenticated", "Entre na sua conta para exportar a peça.", "not_authenticated");
      }
    } catch {
      return fail(401, "not_authenticated", "Entre na sua conta para exportar a peça.", "auth_check_failed");
    }
  }

  if (!(request.headers.get("content-type") ?? "").toLowerCase().includes("application/json")) {
    return fail(400, "validation_failed", "Envie a peça em JSON.", "not_json");
  }

  const raw = await readLimited(request, MAX_BODY_BYTES);
  if (raw === null) return fail(413, "validation_failed", "A peça enviada é grande demais.", "body_too_large");

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return fail(400, "validation_failed", "Envie a peça em JSON.", "not_json");
  }

  const input = typeof body === "object" && body !== null ? (body as { design?: unknown }).design : undefined;
  if (input === undefined) {
    return fail(400, "validation_failed", "Revise os campos da peça.", "missing_design", {
      fieldErrors: { design: ["Envie a peça no campo design."] },
    });
  }
  const { design, issues } = validateDesign(input, null);
  if (!design) {
    return fail(400, "validation_failed", "Revise os campos da peça.", "invalid_design", {
      fieldErrors: issuesToFieldErrors(issues),
    });
  }

  try {
    const fonts = await loadRenderFonts();
    const spec = FORMAT_SPECS[design.format];
    const image = new ImageResponse(artworkElement(design), {
      width: spec.width,
      height: spec.height,
      fonts,
    });
    const png = await image.arrayBuffer();
    log("info", "render.completed", {
      correlation_id: correlationId,
      format: design.format,
      template_key: design.template_key,
      background: design.background,
      show_price: design.show_price,
      bytes: png.byteLength,
      duration_ms: Math.round(performance.now() - started),
    });
    return new Response(png, {
      status: 200,
      headers: {
        ...baseHeaders,
        "Content-Type": "image/png",
        "Content-Disposition": `attachment; filename="gerevendas-${design.format}-${design.template_key}.png"`,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    log("error", "render.failed", {
      correlation_id: correlationId,
      format: design.format,
      template_key: design.template_key,
      error: error instanceof Error ? error.name : "unknown",
    });
    return Response.json(
      apiError("internal", "Não foi possível gerar a imagem agora. Tente novamente.", correlationId),
      {
        status: 500,
        headers: baseHeaders,
      },
    );
  }
}

// Handler com nome minúsculo: o lint do React Compiler trata funções em maiúsculas como componentes.
export { handleRender as POST };
