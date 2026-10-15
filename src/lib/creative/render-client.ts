import { apiErrorSchema } from "@/contracts/api";
import type { CreativeDesign } from "@/contracts/creative";
import { publicEnv } from "@/lib/public-env";

/**
 * Cliente da exportação PNG (seguro para o navegador: não importa nada de servidor).
 * Usa o subcaminho público (ex.: "/ads") para funcionar fora da raiz.
 */

export const RENDER_FALLBACK_MESSAGE = "Não foi possível gerar a imagem agora. Tente novamente.";

/** Erro da exportação com o código e o correlation id devolvidos pela API (quando houver). */
export class RenderError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string | null,
    readonly correlationId: string | null,
  ) {
    super(message);
    this.name = "RenderError";
  }
}

/** Gera o PNG da peça no servidor (`POST /api/render`). Lança `RenderError` com a mensagem da API. */
export async function renderCreativePng(design: CreativeDesign, init: { signal?: AbortSignal } = {}): Promise<Blob> {
  let response: Response;
  try {
    response = await fetch(`${publicEnv.basePath}/api/render`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "image/png, application/json" },
      body: JSON.stringify({ design }),
      credentials: "same-origin",
      signal: init.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new RenderError("Sem conexão com o servidor. Verifique a internet e tente de novo.", 0, null, null);
  }

  if (response.ok && (response.headers.get("content-type") ?? "").includes("image/png")) {
    return response.blob();
  }

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    // Corpo não-JSON (ex.: erro de proxy): usa a mensagem padrão.
  }
  const parsed = apiErrorSchema.safeParse(payload);
  if (parsed.success) {
    throw new RenderError(
      parsed.data.error.message,
      response.status,
      parsed.data.error.code,
      parsed.data.error.correlation_id,
    );
  }
  throw new RenderError(RENDER_FALLBACK_MESSAGE, response.status, null, null);
}

/** Nome de arquivo igual ao do `Content-Disposition` da rota. */
export function creativeFilename(design: Pick<CreativeDesign, "format" | "template_key">): string {
  return `gerevendas-${design.format}-${design.template_key}.png`;
}

/** Dispara o download de um Blob no navegador. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.rel = "noopener";
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Dá tempo ao navegador de iniciar o download antes de liberar a URL.
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}
