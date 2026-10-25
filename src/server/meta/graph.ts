import { createHmac } from "node:crypto";

/**
 * Versão fixada da Graph/Marketing API (ADR 0005). v25.0 é a versão de Marketing vigente em 25/10/2026
 * (developers.facebook.com/docs/graph-api/changelog/versions).
 */
export const META_GRAPH_VERSION = "v25.0";
export const META_GRAPH_BASE = `https://graph.facebook.com/${META_GRAPH_VERSION}`;

/** Prova do app exigida pela Meta em chamadas server-side: HMAC-SHA256 do token com o app secret. */
export function appSecretProof(accessToken: string, appSecret: string): string {
  return createHmac("sha256", appSecret).update(accessToken).digest("hex");
}
