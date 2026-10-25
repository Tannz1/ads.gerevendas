import { z } from "zod";
import { externalIdSchema } from "./common";

export const META_STEP_STATUSES = ["pending", "in_progress", "awaiting_meta", "done", "error"] as const;
export const metaStepStatusSchema = z.enum(META_STEP_STATUSES);
export type MetaStepStatus = z.infer<typeof metaStepStatusSchema>;

export const META_INVITE_STATUSES = ["not_sent", "pending", "accepted", "expired"] as const;
export type MetaInviteStatus = (typeof META_INVITE_STATUSES)[number];

export const META_POOL_STATUSES = ["available", "assigned", "retired"] as const;
export type MetaPoolStatus = (typeof META_POOL_STATUSES)[number];

export const adAccountIdSchema = externalIdSchema.regex(/^act_[0-9A-Za-z_]{3,60}$/, "ID de conta inválido");

export const linkPageSchema = z.object({
  page_url: z.string().trim().min(5, "Cole o link da sua Página do Facebook").max(300),
  instagram_username: z
    .string()
    .trim()
    .max(31)
    .regex(/^@?[A-Za-z0-9._]{0,30}$/, "Digite o @ do Instagram sem espaços")
    .optional()
    .transform((v) => (v ? v.replace(/^@/, "").toLowerCase() : undefined)),
});
export type LinkPageInput = z.input<typeof linkPageSchema>;

export const sendInviteSchema = z.object({
  email: z.email("Informe um e-mail válido").max(254),
});

export const registerPoolAccountsSchema = z.object({
  ad_account_ids: z.array(adAccountIdSchema).min(1, "Escolha pelo menos 1 conta").max(50),
});

export const retirePoolAccountSchema = z.object({ id: z.uuid() });
