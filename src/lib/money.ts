/** Converte texto digitado em reais ("1.234,56", "24,9", "R$ 10") para centavos. */
export function parseBRLToCents(input: string): number | null {
  const cleaned = input.replace(/[R$\s]/g, "");
  if (!cleaned) return null;
  if (!/^\d{1,3}(\.\d{3})*(,\d{1,2})?$|^\d+(,\d{1,2})?$/.test(cleaned)) return null;
  const [intPart, decPart = ""] = cleaned.replace(/\./g, "").split(",");
  const cents = Number(intPart) * 100 + Number(decPart.padEnd(2, "0"));
  return Number.isSafeInteger(cents) ? cents : null;
}

export function formatCents(cents: number, currency = "BRL"): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(cents / 100);
}

/** Formato para preencher o campo de edição: 2490 -> "24,90". */
export function centsToInput(cents: number | null | undefined): string {
  if (cents == null) return "";
  return (cents / 100).toFixed(2).replace(".", ",");
}
