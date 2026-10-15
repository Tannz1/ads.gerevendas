import { describe, expect, it } from "vitest";
import { parseServerEnv } from "@/lib/env";
import { META_ENABLED_IN_THIS_BUILD, resolveFlags } from "@/lib/flags";
import { redact } from "@/lib/logger";

describe("env", () => {
  it("usa padrões seguros sem variáveis", () => {
    const env = parseServerEnv({});
    expect(env.META_MODE).toBe("mock");
    expect(env.BILLING_PROVIDER).toBe("mock");
    expect(env.FEATURE_FLAG_REAL_PUBLISHING).toBe(false);
  });

  it("não vaza valores na mensagem de erro", () => {
    expect(() => parseServerEnv({ META_MODE: "segredo-super-secreto" })).toThrow(/META_MODE/);
    try {
      parseServerEnv({ META_MODE: "segredo-super-secreto" });
    } catch (e) {
      expect(String(e)).not.toContain("segredo-super-secreto");
    }
  });
});

describe("feature flags (fase 1)", () => {
  it("mantém Meta desligada mesmo com flags ligadas por env", () => {
    expect(META_ENABLED_IN_THIS_BUILD).toBe(false);
    const flags = resolveFlags(
      parseServerEnv({
        META_MODE: "real",
        FEATURE_FLAG_REAL_PUBLISHING: "true",
        FEATURE_FLAG_WHATSAPP_ADS: "true",
        FEATURE_FLAG_ACCOUNT_CREATION: "true",
      }),
    );
    expect(flags).toMatchObject({
      realPublishing: false,
      whatsappAds: false,
      accountCreation: false,
      metaMode: "mock",
    });
  });

  it("expõe kill switch e modo piloto", () => {
    const flags = resolveFlags(parseServerEnv({ FEATURE_FLAG_KILL_SWITCH: "1", FEATURE_FLAG_PILOT_MODE: "true" }));
    expect(flags.killSwitch).toBe(true);
    expect(flags.pilotMode).toBe(true);
  });
});

describe("logger", () => {
  it("remove segredos em qualquer profundidade", () => {
    expect(
      redact({ access_token: "abc", nested: { apiKey: "x", ok: 1 }, list: [{ Authorization: "Bearer y" }] }),
    ).toEqual({
      access_token: "[redacted]",
      nested: { apiKey: "[redacted]", ok: 1 },
      list: [{ Authorization: "[redacted]" }],
    });
  });
});
