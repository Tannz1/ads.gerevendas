import { describe, expect, it } from "vitest";
import {
  CURRENT_TERMS_VERSION,
  createInviteSchema,
  deleteOrganizationConfirmSchema,
  inviteTokenSchema,
  recordConsentsSchema,
} from "@/contracts/account";

describe("account contracts (convites e LGPD)", () => {
  it("valida criação de convite com e-mail normalizado e papel permitido", () => {
    const res = createInviteSchema.safeParse({ email: "  SOCIO@Empresa.com.br ", role: "admin" });
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data.email).toBe("socio@empresa.com.br");
      expect(res.data.role).toBe("admin");
    }
  });

  it("rejeita papel owner em convites", () => {
    const res = createInviteSchema.safeParse({ email: "a@b.com", role: "owner" });
    expect(res.success).toBe(false);
  });

  it("valida formato de token de convite", () => {
    expect(inviteTokenSchema.safeParse("token_valido_1234567890").success).toBe(true);
    expect(inviteTokenSchema.safeParse("curto").success).toBe(false);
    expect(inviteTokenSchema.safeParse("token com espaco 123456789").success).toBe(false);
  });

  it("exige consentimentos obrigatórios (termos, privacidade e IA)", () => {
    expect(
      recordConsentsSchema.safeParse({
        terms_of_use: true,
        privacy_policy: true,
        ai_processing: true,
        pilot_participation: false,
      }).success,
    ).toBe(true);

    expect(
      recordConsentsSchema.safeParse({
        terms_of_use: true,
        privacy_policy: false,
        ai_processing: true,
      }).success,
    ).toBe(false);
    expect(CURRENT_TERMS_VERSION).toMatch(/^\d{4}-\d{2}-v\d+$/);
  });

  it("valida confirmação de exclusão de organização", () => {
    expect(
      deleteOrganizationConfirmSchema.safeParse({
        organization_id: "11111111-1111-4111-8111-111111111111",
        confirmation_name: "Padaria Exemplo",
      }).success,
    ).toBe(true);
  });
});
