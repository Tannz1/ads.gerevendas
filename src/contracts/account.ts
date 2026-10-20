import { z } from "zod";
import { uuidSchema } from "./common";

export const INVITE_ROLES = ["admin", "member"] as const;
export const inviteRoleSchema = z.enum(INVITE_ROLES, { error: "Escolha o papel do membro" });
export type InviteRole = z.infer<typeof inviteRoleSchema>;

export const INVITE_STATUSES = ["pending", "accepted", "revoked"] as const;
export const inviteStatusSchema = z.enum(INVITE_STATUSES);
export type InviteStatus = z.infer<typeof inviteStatusSchema>;

export const createInviteSchema = z.object({
  email: z.string().trim().toLowerCase().email("Informe um e-mail válido").max(200, "E-mail muito longo"),
  role: inviteRoleSchema,
});
export type CreateInviteInput = z.infer<typeof createInviteSchema>;

export const inviteTokenSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9_-]{16,64}$/, "Código de convite inválido");

export const CONSENT_KINDS = ["terms_of_use", "privacy_policy", "ai_processing", "pilot_participation"] as const;
export const consentKindSchema = z.enum(CONSENT_KINDS);
export type ConsentKind = z.infer<typeof consentKindSchema>;

export const CURRENT_TERMS_VERSION = "2026-10-v1";

export const recordConsentsSchema = z.object({
  terms_of_use: z.literal(true, { error: "Aceite os Termos de Uso" }),
  privacy_policy: z.literal(true, { error: "Aceite a Política de Privacidade" }),
  ai_processing: z.literal(true, { error: "Autorize o uso de IA para gerar sugestões" }),
  pilot_participation: z.boolean().default(false),
});
export type RecordConsentsInput = z.infer<typeof recordConsentsSchema>;

export const deleteOrganizationConfirmSchema = z.object({
  organization_id: uuidSchema,
  confirmation_name: z.string().trim().min(2, "Digite o nome da empresa para confirmar"),
});
