export const CORRELATION_HEADER = "x-correlation-id";

const VALID = /^[A-Za-z0-9-]{8,64}$/;

/** Reaproveita um correlation id válido recebido ou gera um novo. */
export function ensureCorrelationId(incoming: string | null | undefined): string {
  return incoming && VALID.test(incoming) ? incoming : crypto.randomUUID();
}
