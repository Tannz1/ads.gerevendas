import type { ServerEnv } from "./env";

/**
 * ADR 0005: a BM única da GereVendas pode operar em modo real (contas e conexões). Publicação real
 * continua bloqueada no código de campanhas até a Spec 2, mesmo com FEATURE_FLAG_REAL_PUBLISHING.
 */
export const META_ENABLED_IN_THIS_BUILD = true;

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
