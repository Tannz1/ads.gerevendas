import { describe, expect, it } from "vitest";
import { parseServerEnv } from "@/lib/env";
import { resolveFlags } from "@/lib/flags";
import { resolveMetaBusinessMode } from "@/server/meta/mode";

const mode = (vars: Record<string, string>) => {
  const env = parseServerEnv(vars);
  return resolveMetaBusinessMode(env, resolveFlags(env));
};

const real = {
  META_MODE: "real",
  FEATURE_FLAG_ACCOUNT_CREATION: "true",
  META_BUSINESS_ID: "111",
  META_SYSTEM_USER_TOKEN: "tok",
  META_APP_SECRET: "sec",
};

describe("resolveMetaBusinessMode", () => {
  it("usa Simulação por padrão", () => {
    expect(mode({})).toEqual({ kind: "mock" });
    expect(mode({ ...real, FEATURE_FLAG_ACCOUNT_CREATION: "false" })).toEqual({ kind: "mock" });
  });

  it("liga o modo real com tudo configurado", () => {
    expect(mode({ ...real, META_AD_ACCOUNT_TIMEZONE_ID: "25" })).toEqual({
      kind: "real",
      businessId: "111",
      accessToken: "tok",
      appSecret: "sec",
      timezoneId: 25,
    });
  });

  it("modo real sem variável obrigatória não cai em Simulação", () => {
    expect(mode({ ...real, META_SYSTEM_USER_TOKEN: "" })).toEqual({
      kind: "disabled",
      reason: "config_missing",
      missing: ["META_SYSTEM_USER_TOKEN"],
    });
  });

  it("kill switch desliga tudo, inclusive a Simulação", () => {
    expect(mode({ ...real, FEATURE_FLAG_KILL_SWITCH: "true" })).toEqual({ kind: "disabled", reason: "kill_switch" });
    expect(mode({ FEATURE_FLAG_KILL_SWITCH: "true" })).toEqual({ kind: "disabled", reason: "kill_switch" });
  });
});
