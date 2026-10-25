/**
 * Endereços de telas oficiais da Meta mostrados ao cliente. Confirmados manualmente no teste de
 * contrato (docs/META_OPERADOR.md); se a Meta mudar, só este arquivo muda.
 */
export const META_PARTNERS_URL = "https://business.facebook.com/settings/partners";

export function metaBillingUrl(adAccountId: string): string {
  const numeric = adAccountId.replace(/^act_/, "");
  return `https://business.facebook.com/billing_hub/payment_settings/?asset_id=${encodeURIComponent(numeric)}`;
}
