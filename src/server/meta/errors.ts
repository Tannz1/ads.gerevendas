export const META_ERROR_CODES = [
  "missing_permissions",
  "token_expired",
  "asset_not_shared",
  "rate_limited",
  "meta_unavailable",
  "config_missing",
  "unknown",
] as const;
export type MetaErrorCode = (typeof META_ERROR_CODES)[number];

export class MetaError extends Error {
  constructor(
    readonly code: MetaErrorCode,
    readonly metaCode?: number,
    readonly metaSubcode?: number,
  ) {
    super(`meta_error:${code}`);
    this.name = "MetaError";
  }
}

type GraphErrorBody = { error?: { code?: number; error_subcode?: number } };

const RATE_LIMIT_CODES = new Set([4, 17, 32, 613, 80004]);

/** Converte a resposta de erro da Graph API num código estável; nunca copia a mensagem da Meta. */
export function mapGraphError(status: number, body: unknown): MetaError {
  const err = (body as GraphErrorBody | null)?.error;
  const code = err?.code;
  const sub = err?.error_subcode;
  if (code === 190) return new MetaError("token_expired", code, sub);
  if (code === 10 || code === 3 || (code !== undefined && code >= 200 && code <= 299)) {
    return new MetaError("missing_permissions", code, sub);
  }
  if (code !== undefined && RATE_LIMIT_CODES.has(code)) return new MetaError("rate_limited", code, sub);
  if (code === 100 && sub === 33) return new MetaError("asset_not_shared", code, sub);
  if (status >= 500 || code === 1 || code === 2) return new MetaError("meta_unavailable", code, sub);
  return new MetaError("unknown", code, sub);
}
