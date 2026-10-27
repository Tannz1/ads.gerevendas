import { describe, expect, it, vi } from "vitest";
import { parseServerEnv } from "@/lib/env";
import { elevenlabs, MAX_SCRIPT_CHARS } from "@/server/ai/elevenlabs";
import { selectVoiceVideoProvider } from "@/server/ai/provider";

const MP3 = new Uint8Array([0x49, 0x44, 0x33, 4, 0]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
const noSleep = async () => {};

function client(fetchFn: typeof fetch) {
  return elevenlabs({ apiKey: "sk-test", ttsModel: "eleven_multilingual_v2", fetchFn, sleep: noSleep });
}

describe("elevenlabs", () => {
  it("gera narração com a chave no header xi-api-key", async () => {
    const fetchFn = vi.fn(async () => new Response(MP3, { status: 200 }));
    const bytes = await client(fetchFn).speech(" Olá, padaria! ", "voz1");
    expect(bytes).toEqual(MP3);
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.elevenlabs.io/v1/text-to-speech/voz1?output_format=mp3_44100_128");
    expect((init.headers as Record<string, string>)["xi-api-key"]).toBe("sk-test");
    expect(JSON.parse(init.body as string)).toEqual({ text: "Olá, padaria!", model_id: "eleven_multilingual_v2" });
  });

  it("recusa roteiro vazio ou longo sem chamar a API", async () => {
    const fetchFn = vi.fn();
    await expect(client(fetchFn).speech("  ", "v")).rejects.toThrow();
    await expect(client(fetchFn).speech("x".repeat(MAX_SCRIPT_CHARS + 1), "v")).rejects.toThrow();
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("cria avatar com foto e áudio inline e não repete a criação em erro 5xx", async () => {
    const ok = vi.fn(async () => Response.json({ id: "gen_1", status: "pending" }));
    expect(await client(ok).createAvatarVideo({ bytes: JPEG, mime: "image/jpeg" }, MP3)).toBe("gen_1");
    const body = JSON.parse((ok.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body.model_id).toBe("creatify-aurora");
    expect(body.image).toEqual({ type: "inline_base64", content_base64: "/9j/4A==", mime_type: "image/jpeg" });
    expect(body.audio.mime_type).toBe("audio/mpeg");

    const down = vi.fn(async () => new Response("", { status: 503 }));
    await expect(client(down).createAvatarVideo({ bytes: JPEG, mime: "image/jpeg" }, MP3)).rejects.toMatchObject({
      code: "external_unavailable",
    });
    expect(down).toHaveBeenCalledTimes(1);
  });

  it("explica quando o plano não tem vídeo (402)", async () => {
    const fetchFn = vi.fn(async () => new Response("", { status: 402 }));
    await expect(client(fetchFn).createAvatarVideo({ bytes: JPEG, mime: "image/jpeg" }, MP3)).rejects.toThrow(/Pro/);
  });

  it("lê os estados da geração", async () => {
    const reply = (body: object) => client(vi.fn(async () => Response.json(body))).getVideo("gen_1");
    expect(await reply({ status: "generating" })).toEqual({ status: "generating" });
    expect(await reply({ status: "completed", content_url: "https://x/v.mp4" })).toEqual({
      status: "completed",
      content_url: "https://x/v.mp4",
    });
    expect(await reply({ status: "failed", failure_reason: "moderated" })).toEqual({
      status: "failed",
      failure_reason: "moderated",
    });
    await expect(reply({ status: "weird" })).rejects.toThrow();
  });

  it("só existe com chave e kill switch desligado", () => {
    expect(selectVoiceVideoProvider(parseServerEnv({}))).toBeNull();
    expect(
      selectVoiceVideoProvider(parseServerEnv({ ELEVENLABS_API_KEY: "k", FEATURE_FLAG_KILL_SWITCH: "true" })),
    ).toBeNull();
    expect(selectVoiceVideoProvider(parseServerEnv({ ELEVENLABS_API_KEY: "k" }))?.name).toBe("elevenlabs");
    expect(parseServerEnv({ ELEVENLABS_VOICE_IDS: "a, b,," }).ELEVENLABS_VOICE_IDS).toEqual(["a", "b"]);
  });
});
