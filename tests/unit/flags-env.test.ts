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
  it("liga o modo real da Meta só com META_MODE=real e respeita o kill switch", () => {
    expect(META_ENABLED_IN_THIS_BUILD).toBe(true);
    const on = resolveFlags(parseServerEnv({ META_MODE: "real", FEATURE_FLAG_ACCOUNT_CREATION: "true" }));
    expect(on).toMatchObject({ accountCreation: true, metaMode: "real" });
    const killed = resolveFlags(
      parseServerEnv({ META_MODE: "real", FEATURE_FLAG_ACCOUNT_CREATION: "true", FEATURE_FLAG_KILL_SWITCH: "1" }),
    );
    expect(killed).toMatchObject({ accountCreation: false, metaMode: "mock", killSwitch: true });
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
