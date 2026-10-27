import type { ImageKind } from "@/lib/image-bytes";
import { ProviderError } from "./openai-text";

/** ~40 s de fala. Mantém o vídeo curto e o custo previsível. */
export const MAX_SCRIPT_CHARS = 600;

export type VideoStatus =
  | { status: "pending" | "generating" }
  | { status: "completed"; content_url: string }
  | { status: "failed"; failure_reason: string };

export interface VoiceVideoProvider {
  readonly name: "elevenlabs";
  /** Narração em MP3. */
  speech(text: string, voiceId: string): Promise<Uint8Array>;
  /** Avatar falante a partir da foto + áudio (Creatify Aurora). Retorna o ID da geração. */
  createAvatarVideo(image: { bytes: Uint8Array; mime: ImageKind["mime"] }, audio: Uint8Array): Promise<string>;
  getVideo(generationId: string): Promise<VideoStatus>;
}

type Options = {
  apiKey: string;
  ttsModel: string;
  fetchFn?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  baseUrl?: string;
};

const b64 = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64");

/**
 * ElevenLabs: TTS (`POST /v1/text-to-speech/{voice_id}`) e Flows de vídeo (`/v1/flows/video`),
 * contrato conferido na documentação oficial em 27/10/2026. Vídeo pela API exige plano Pro (402).
 */
export function elevenlabs(opts: Options): VoiceVideoProvider {
  const fetchFn = opts.fetchFn ?? fetch;
  const sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  const base = opts.baseUrl ?? "https://api.elevenlabs.io/v1";

  /** `retry`: só onde repetir não pode cobrar duas vezes (a criação de vídeo não tem chave de idempotência). */
  async function call(path: string, init: RequestInit, retry: boolean): Promise<Response> {
    let res: Response | undefined;
    for (let attempt = 0; attempt < (retry ? 2 : 1); attempt++) {
      try {
        res = await fetchFn(`${base}${path}`, {
          ...init,
          headers: { "xi-api-key": opts.apiKey, "content-type": "application/json" },
          signal: AbortSignal.timeout(120_000),
        });
      } catch {
        res = undefined;
      }
      if (res && (res.ok || (res.status !== 429 && res.status < 500))) break;
      if (retry && attempt === 0) await sleep(2000);
    }
    if (!res || res.status === 429 || res.status >= 500) {
      throw new ProviderError("external_unavailable", "ElevenLabs não respondeu");
    }
    if (res.status === 402) throw new ProviderError("invalid_output", "Plano ElevenLabs sem acesso (vídeo exige Pro)");
    if (!res.ok) throw new ProviderError("invalid_output", `ElevenLabs recusou (${res.status})`);
    return res;
  }

  return {
    name: "elevenlabs",

    async speech(text, voiceId) {
      const clean = text.trim();
      if (!clean || clean.length > MAX_SCRIPT_CHARS) {
        throw new ProviderError("invalid_output", `Roteiro vazio ou acima de ${MAX_SCRIPT_CHARS} caracteres`);
      }
      const res = await call(
        `/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`,
        { method: "POST", body: JSON.stringify({ text: clean, model_id: opts.ttsModel }) },
        true,
      );
      const bytes = new Uint8Array(await res.arrayBuffer());
      if (bytes.length === 0) throw new ProviderError("invalid_output", "Resposta sem áudio");
      return bytes;
    },

    async createAvatarVideo(image, audio) {
      const res = await call(
        "/flows/video",
        {
          method: "POST",
          body: JSON.stringify({
            model_id: "creatify-aurora",
            image: { type: "inline_base64", content_base64: b64(image.bytes), mime_type: image.mime },
            audio: { type: "inline_base64", content_base64: b64(audio), mime_type: "audio/mpeg" },
            resolution: "720p",
          }),
        },
        false,
      );
      const json = (await res.json()) as { id?: unknown };
      if (typeof json.id !== "string" || !json.id)
        throw new ProviderError("invalid_output", "Resposta sem ID da geração");
      return json.id;
    },

    async getVideo(generationId) {
      const res = await call(`/flows/video/${encodeURIComponent(generationId)}`, { method: "GET" }, true);
      const json = (await res.json()) as { status?: string; content_url?: string; failure_reason?: string };
      if (json.status === "completed" && json.content_url)
        return { status: "completed", content_url: json.content_url };
      if (json.status === "failed") return { status: "failed", failure_reason: json.failure_reason ?? "unknown" };
      if (json.status === "pending" || json.status === "generating") return { status: json.status };
      throw new ProviderError("invalid_output", "Status de geração desconhecido");
    },
  };
}
