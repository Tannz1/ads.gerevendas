import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Calcula assinatura HMAC-SHA256 do corpo bruto do webhook.
 */
export function computeWebhookHmac(rawBody: string, secret: string): string {
  return createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
}

/**
 * Compara assinatura recebida no cabeçalho com o HMAC esperado em tempo constante.
 */
export function verifyWebhookHmac(
  rawBody: string,
  signatureHeader: string | null,
  secret: string | undefined,
): boolean {
  if (!secret || !signatureHeader) return false;
  const normalized = signatureHeader.trim().replace(/^sha256=/i, "");
  if (!/^[0-9a-f]{64}$/i.test(normalized)) return false;

  const expected = Buffer.from(computeWebhookHmac(rawBody, secret), "hex");
  const actual = Buffer.from(normalized, "hex");
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}
