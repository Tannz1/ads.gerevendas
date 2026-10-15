/**
 * Normaliza telefone brasileiro para E.164 (+55DDDNUMERO). Retorna o texto original
 * (que falhará na validação) quando não for possível normalizar.
 */
export function normalizeBrazilWhatsapp(input: string): string {
  const raw = input.trim();
  if (!raw) return "";
  const digits = raw.replace(/\D/g, "");
  if (raw.startsWith("+")) return `+${digits}`;
  if (digits.length === 10 || digits.length === 11) return `+55${digits}`;
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith("55")) return `+${digits}`;
  return raw;
}

export function formatBrazilWhatsapp(e164: string | undefined): string {
  if (!e164) return "";
  const m = /^\+55(\d{2})(\d{4,5})(\d{4})$/.exec(e164);
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : e164;
}
