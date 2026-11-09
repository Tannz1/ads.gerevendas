import { describe, expect, it } from "vitest";
import {
  linkPageSchema,
  registerPoolAccountsSchema,
  sendInviteSchema,
  updateBusinessContactsSchema,
} from "@/contracts/meta";
import { metaBillingUrl } from "@/lib/meta-links";

describe("contratos Meta", () => {
  it("normaliza o @ do Instagram, WhatsApp e aceita campo vazio", () => {
    const parsed = linkPageSchema.parse({
      page_url: "facebook.com/x1",
      instagram_username: "@Padaria.Joao",
      whatsapp_phone: "(11) 98765-4321",
    });
    expect(parsed.instagram_username).toBe("padaria.joao");
    expect(parsed.whatsapp_phone).toBe("+5511987654321");
    expect(
      linkPageSchema.parse({ page_url: "facebook.com/x1", instagram_username: "" }).instagram_username,
    ).toBeUndefined();
    expect(linkPageSchema.safeParse({ page_url: "facebook.com/x1", instagram_username: "com espaço" }).success).toBe(
      false,
    );
  });

  it("valida sincronização de WhatsApp e Instagram do negócio", () => {
    const ok = updateBusinessContactsSchema.parse({
      whatsapp_phone: "11999998888",
      instagram_username: "@MeuNegocio",
    });
    expect(ok.whatsapp_phone).toBe("+5511999998888");
    expect(ok.instagram_username).toBe("meunegocio");
    expect(updateBusinessContactsSchema.safeParse({ whatsapp_phone: "123" }).success).toBe(false);
  });

  it("valida e-mail do convite e IDs de conta", () => {
    expect(sendInviteSchema.safeParse({ email: "dono@padaria.com" }).success).toBe(true);
    expect(sendInviteSchema.safeParse({ email: "dono" }).success).toBe(false);
    expect(registerPoolAccountsSchema.safeParse({ ad_account_ids: ["act_123456"] }).success).toBe(true);
    expect(registerPoolAccountsSchema.safeParse({ ad_account_ids: ["123456"] }).success).toBe(false);
  });

  it("monta o link de pagamento com o número da conta", () => {
    expect(metaBillingUrl("act_123456")).toContain("asset_id=123456");
  });
});
