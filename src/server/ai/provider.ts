import type { ServerEnv } from "@/lib/env";
import { elevenlabs, type VoiceVideoProvider } from "./elevenlabs";
import { mockText } from "./mock-text";
import { openaiImage, type ImageProvider } from "./openai-image";
import { openaiText } from "./openai-text";
import type { TextProvider } from "./types";

/** Real só com chave + modelo e kill switch desligado; senão o simulado (rotulado "Simulação"). */
export function selectTextProvider(env: ServerEnv): TextProvider {
  if (env.FEATURE_FLAG_KILL_SWITCH || !env.OPENAI_API_KEY || !env.OPENAI_TEXT_MODEL) return mockText;
  return openaiText({ apiKey: env.OPENAI_API_KEY, model: env.OPENAI_TEXT_MODEL });
}

/** Voz e vídeo (ElevenLabs) só com chave e kill switch desligado. Sem provedor não há vídeo simulado. */
export function selectVoiceVideoProvider(env: ServerEnv): VoiceVideoProvider | null {
  if (env.FEATURE_FLAG_KILL_SWITCH || !env.ELEVENLABS_API_KEY) return null;
  return elevenlabs({ apiKey: env.ELEVENLABS_API_KEY, ttsModel: env.ELEVENLABS_TTS_MODEL });
}

/** Imagem só com chave + modelo de imagem e kill switch desligado. Sem provedor não há imagem simulada. */
export function selectImageProvider(env: ServerEnv): ImageProvider | null {
  if (env.FEATURE_FLAG_KILL_SWITCH || !env.OPENAI_API_KEY || !env.OPENAI_IMAGE_MODEL) return null;
  return openaiImage({ apiKey: env.OPENAI_API_KEY, model: env.OPENAI_IMAGE_MODEL, quality: env.OPENAI_IMAGE_QUALITY });
}
