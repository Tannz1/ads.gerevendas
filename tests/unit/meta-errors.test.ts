import { describe, expect, it } from "vitest";
import { mapGraphError } from "@/server/meta/errors";

describe("mapGraphError", () => {
  it.each([
    [400, { error: { code: 190 } }, "token_expired"],
    [403, { error: { code: 10 } }, "missing_permissions"],
    [403, { error: { code: 200 } }, "missing_permissions"],
    [400, { error: { code: 17 } }, "rate_limited"],
    [400, { error: { code: 80004 } }, "rate_limited"],
    [400, { error: { code: 100, error_subcode: 33 } }, "asset_not_shared"],
    [500, null, "meta_unavailable"],
    [400, { error: { code: 1 } }, "meta_unavailable"],
    [400, { error: { code: 999 } }, "unknown"],
  ])("HTTP %s %j vira %s", (status, body, code) => {
    expect(mapGraphError(status, body).code).toBe(code);
  });

  it("guarda o código da Meta sem expor o corpo", () => {
    const err = mapGraphError(400, { error: { code: 100, error_subcode: 33, message: "segredo" } });
    expect(err.metaCode).toBe(100);
    expect(err.metaSubcode).toBe(33);
    expect(err.message).not.toContain("segredo");
  });
});
