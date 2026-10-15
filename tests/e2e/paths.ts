/** Prefixa o subcaminho da aplicação (NEXT_PUBLIC_BASE_PATH), igual ao build testado. */
export const p = (path: string) => `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}${path}`;
