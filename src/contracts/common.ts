import { z } from "zod";

/** IDs internos são UUID; IDs externos (ex.: Meta) são strings opacas. */
export const uuidSchema = z.uuid();
export const externalIdSchema = z.string().min(1).max(128);

export const currencySchema = z.string().regex(/^[A-Z]{3}$/, "Moeda ISO 4217 em maiúsculas");

/** Dinheiro sempre em centavos inteiros + moeda ISO. */
export const moneySchema = z.object({
  amount_cents: z.number().int().nonnegative(),
  currency: currencySchema,
});
export type Money = z.infer<typeof moneySchema>;

export const UFS = [
  "AC",
  "AL",
  "AP",
  "AM",
  "BA",
  "CE",
  "DF",
  "ES",
  "GO",
  "MA",
  "MT",
  "MS",
  "MG",
  "PA",
  "PB",
  "PR",
  "PE",
  "PI",
  "RJ",
  "RN",
  "RS",
  "RO",
  "RR",
  "SC",
  "SP",
  "SE",
  "TO",
] as const;
export const ufSchema = z.enum(UFS, { error: "Escolha o estado" });

/** Estados que toda tela que consome API precisa tratar. */
export const VIEW_STATES = [
  "loading",
  "empty",
  "error",
  "restricted",
  "missing_permissions",
  "partial_success",
  "ready",
] as const;
export type ViewState = (typeof VIEW_STATES)[number];

/** Modo de execução de integrações externas. `mock` deve ser rotulado como Simulação na UI. */
export const integrationModeSchema = z.enum(["mock", "real"]);
export type IntegrationMode = z.infer<typeof integrationModeSchema>;
