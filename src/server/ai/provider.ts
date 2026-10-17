import type { ServerEnv } from "@/lib/env";
import { mockText } from "./mock-text";
import { openaiText } from "./openai-text";
import type { TextProvider } from "./types";

/** Real só com chave + modelo e kill switch desligado; senão o simulado (rotulado "Simulação"). */
export function selectTextProvider(env: ServerEnv): TextProvider {
  if (env.FEATURE_FLAG_KILL_SWITCH || !env.OPENAI_API_KEY || !env.OPENAI_TEXT_MODEL) return mockText;
  return openaiText({ apiKey: env.OPENAI_API_KEY, model: env.OPENAI_TEXT_MODEL });
}
