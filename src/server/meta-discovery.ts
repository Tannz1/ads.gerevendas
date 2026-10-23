import { randomBytes } from "node:crypto";
import type { DiscoveredMetaAssets } from "@/lib/meta-oauth";

/**
 * Contas e páginas descobertas no OAuth da Meta, guardadas por 10 minutos até o usuário escolher.
 * Não cabem em cookie: com 25 contas a lista passa de 4 KB e o navegador descarta o cookie.
 * O cookie leva só a chave; a leitura confere a organização.
 */
const TTL_MS = 10 * 60_000;
export const META_DISCOVERED_COOKIE = "gv_meta_discovered";

type Entry = { orgId: string; assets: DiscoveredMetaAssets; expires: number };

// ponytail: memória do processo (1 réplica no EasyPanel); com mais réplicas, mover para uma tabela.
// globalThis: Route Handler e página podem estar em bundles diferentes do mesmo processo.
const g = globalThis as typeof globalThis & { __gvMetaDiscoveries?: Map<string, Entry> };
const store = (g.__gvMetaDiscoveries ??= new Map<string, Entry>());

export function saveDiscovery(orgId: string, assets: DiscoveredMetaAssets, now = Date.now()): string {
  for (const [key, entry] of store) if (entry.expires <= now) store.delete(key);
  const key = randomBytes(18).toString("base64url");
  store.set(key, { orgId, assets, expires: now + TTL_MS });
  return key;
}

export function readDiscovery(key: string | undefined, orgId: string, now = Date.now()): DiscoveredMetaAssets | null {
  if (!key) return null;
  const entry = store.get(key);
  if (!entry || entry.expires <= now || entry.orgId !== orgId) return null;
  return entry.assets;
}
