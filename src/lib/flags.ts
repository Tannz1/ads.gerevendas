import type { ServerEnv } from "./env";

/**
 * Fase 1 (ADR 0002): Meta Ads e CRM ficam fora do escopo. Mesmo que alguém ligue as
 * flags por variável de ambiente, este build não habilita publicação real.
 */
export const META_ENABLED_IN_THIS_BUILD = false;

export type FeatureFlags = {
  whatsappAds: boolean;
  realPublishing: boolean;
  accountCreation: boolean;
  pilotMode: boolean;
  killSwitch: boolean;
  metaMode: "mock" | "real";
};

export function resolveFlags(env: ServerEnv): FeatureFlags {
  const killSwitch = env.FEATURE_FLAG_KILL_SWITCH;
  const metaAllowed = META_ENABLED_IN_THIS_BUILD && !killSwitch;
  return {
    whatsappAds: metaAllowed && env.FEATURE_FLAG_WHATSAPP_ADS,
    realPublishing: metaAllowed && env.FEATURE_FLAG_REAL_PUBLISHING,
    accountCreation: metaAllowed && env.FEATURE_FLAG_ACCOUNT_CREATION,
    pilotMode: env.FEATURE_FLAG_PILOT_MODE,
    killSwitch,
    metaMode: metaAllowed ? env.META_MODE : "mock",
  };
}
