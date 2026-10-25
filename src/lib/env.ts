import { z } from "zod";

const flag = z
  .enum(["true", "false", "1", "0", ""])
  .optional()
  .transform((v) => v === "true" || v === "1");

const optional = z
  .string()
  .optional()
  .transform((v) => (v ? v : undefined));

/**
 * Variáveis de servidor. Segredos nunca devem usar o prefixo NEXT_PUBLIC_.
 * Integrações começam em `mock`; Meta real exige META_MODE=real (ADR 0005).
 */
export const serverEnvSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.url().default("http://localhost:3000"),
  NEXT_PUBLIC_SUPABASE_URL: optional,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: optional,
  SUPABASE_SERVICE_ROLE_KEY: optional,
  OPENAI_API_KEY: optional,
  OPENAI_TEXT_MODEL: optional,
  OPENAI_IMAGE_MODEL: optional,
  // Teto de tokens de IA de texto por empresa por mês (custo).
  AI_MONTHLY_TOKEN_CAP: z.coerce.number().int().positive().default(2_000_000),
  OPENAI_IMAGE_QUALITY: z.enum(["low", "medium", "high", "xhigh", "max", "auto"]).default("medium"),
  META_MODE: z.enum(["mock", "real"]).default("mock"),
  META_APP_ID: optional,
  META_APP_SECRET: optional,
  // BM única da GereVendas (ADR 0005). O token é do System User e só existe no servidor.
  META_BUSINESS_ID: optional,
  META_SYSTEM_USER_TOKEN: optional,
  META_AD_ACCOUNT_TIMEZONE_ID: z
    .string()
    .optional()
    .transform((v) => (v ? Number(v) : undefined))
    .pipe(z.number().int().positive().optional()),
  META_POOL_MIN_AVAILABLE: z.coerce.number().int().min(0).default(2),
  BILLING_PROVIDER: z.enum(["mock"]).default("mock"),
  BILLING_WEBHOOK_SECRET: optional,
  FEATURE_FLAG_WHATSAPP_ADS: flag,
  FEATURE_FLAG_REAL_PUBLISHING: flag,
  FEATURE_FLAG_ACCOUNT_CREATION: flag,
  FEATURE_FLAG_PILOT_MODE: flag,
  FEATURE_FLAG_KILL_SWITCH: flag,
});
export type ServerEnv = z.infer<typeof serverEnvSchema>;

export function parseServerEnv(source: Record<string, string | undefined>): ServerEnv {
  const result = serverEnvSchema.safeParse(source);
  if (!result.success) {
    const keys = result.error.issues.map((i) => i.path.join(".")).join(", ");
    // Nunca inclui valores na mensagem: podem ser segredos.
    throw new Error(`Configuração inválida nas variáveis: ${keys}`);
  }
  return result.data;
}

let cached: ServerEnv | undefined;
export function serverEnv(): ServerEnv {
  cached ??= parseServerEnv(process.env);
  return cached;
}
