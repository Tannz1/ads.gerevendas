import type { ServerEnv } from "@/lib/env";
import type { FeatureFlags } from "@/lib/flags";

export type MetaBusinessMode =
  | { kind: "real"; businessId: string; accessToken: string; appSecret: string; timezoneId?: number }
  | { kind: "mock" }
  | { kind: "disabled"; reason: "kill_switch" | "config_missing"; missing?: string[] };

export type ActiveMetaBusinessMode = Exclude<MetaBusinessMode, { kind: "disabled" }>;

/**
 * Real só com META_MODE=real + FEATURE_FLAG_ACCOUNT_CREATION + variáveis da BM. Modo real mal configurado
 * fica desligado (nunca cai em Simulação em silêncio); kill switch desliga inclusive a Simulação.
 */
export function resolveMetaBusinessMode(env: ServerEnv, flags: FeatureFlags): MetaBusinessMode {
  if (flags.killSwitch) return { kind: "disabled", reason: "kill_switch" };
  if (flags.metaMode !== "real" || !flags.accountCreation) return { kind: "mock" };
  const missing = [
    !env.META_BUSINESS_ID && "META_BUSINESS_ID",
    !env.META_SYSTEM_USER_TOKEN && "META_SYSTEM_USER_TOKEN",
    !env.META_APP_SECRET && "META_APP_SECRET",
  ].filter((v): v is string => Boolean(v));
  if (missing.length > 0 || !env.META_BUSINESS_ID || !env.META_SYSTEM_USER_TOKEN || !env.META_APP_SECRET) {
    return { kind: "disabled", reason: "config_missing", missing };
  }
  return {
    kind: "real",
    businessId: env.META_BUSINESS_ID,
    accessToken: env.META_SYSTEM_USER_TOKEN,
    appSecret: env.META_APP_SECRET,
    ...(env.META_AD_ACCOUNT_TIMEZONE_ID ? { timezoneId: env.META_AD_ACCOUNT_TIMEZONE_ID } : {}),
  };
}
