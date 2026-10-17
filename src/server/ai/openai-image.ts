import { detectImage, type ImageKind } from "@/lib/image-bytes";
import { ProviderError } from "./openai-text";

export type ImageQuality = "low" | "medium" | "high" | "xhigh" | "max" | "auto";

export interface ImageProvider {
  readonly name: "openai";
  readonly model: string;
  /** `safetyId`: identificador estável e não pessoal da organização (recomendado pela OpenAI). */
  generate(prompt: string, safetyId: string): Promise<{ bytes: Uint8Array } & ImageKind>;
}

type Options = {
  apiKey: string;
  model: string;
  quality: ImageQuality;
  fetchFn?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  baseUrl?: string;
};

/**
 * OpenAI Image API (`POST /v1/images/generations`), contrato conferido na documentação oficial em
 * 17/10/2026. 1024x1536 (2:3) recorta bem para feed (4:5) e stories (9:16); JPEG para ocupar menos.
 */
export function openaiImage(opts: Options): ImageProvider {
  const fetchFn = opts.fetchFn ?? fetch;
  const sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  const url = `${opts.baseUrl ?? "https://api.openai.com/v1"}/images/generations`;

  return {
    name: "openai",
    model: opts.model,
    async generate(prompt, safetyId) {
      const body = JSON.stringify({
        model: opts.model,
        prompt,
        size: "1024x1536",
        quality: opts.quality,
        output_format: "jpeg",
        output_compression: 85,
        n: 1,
        safety_identifier: safetyId,
      });

      let res: Response | undefined;
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          res = await fetchFn(url, {
            method: "POST",
            headers: { authorization: `Bearer ${opts.apiKey}`, "content-type": "application/json" },
            body,
            signal: AbortSignal.timeout(120_000),
          });
        } catch {
          res = undefined;
        }
        if (res && (res.ok || (res.status !== 429 && res.status < 500))) break;
        if (attempt === 0) await sleep(2000);
      }
      if (!res || res.status === 429 || res.status >= 500) {
        throw new ProviderError("external_unavailable", "OpenAI Images não respondeu");
      }
      // 4xx: pedido recusado (ex.: moderação). Não adianta repetir igual.
      if (!res.ok) throw new ProviderError("invalid_output", `OpenAI Images recusou (${res.status})`);

      const json = (await res.json()) as { data?: Array<{ b64_json?: string }> };
      const b64 = json.data?.[0]?.b64_json;
      const bytes = b64 ? new Uint8Array(Buffer.from(b64, "base64")) : new Uint8Array();
      const kind = detectImage(bytes);
      if (!kind) throw new ProviderError("invalid_output", "Resposta sem imagem válida");
      return { bytes, ...kind };
    },
  };
}
