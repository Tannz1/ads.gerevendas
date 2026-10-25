import "server-only";
import type { MetaBusinessClient } from "./client";
import { MockMetaBusinessClient } from "./mock-client";
import type { ActiveMetaBusinessMode } from "./mode";
import { RealMetaBusinessClient } from "./real-client";

export function metaBusinessClient(mode: ActiveMetaBusinessMode): MetaBusinessClient {
  if (mode.kind === "mock") return new MockMetaBusinessClient();
  return new RealMetaBusinessClient({
    businessId: mode.businessId,
    accessToken: mode.accessToken,
    appSecret: mode.appSecret,
    timezoneId: mode.timezoneId,
  });
}
