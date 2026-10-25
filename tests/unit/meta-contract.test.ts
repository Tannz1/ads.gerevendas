import { describe, expect, it } from "vitest";
import { linkPageSchema, registerPoolAccountsSchema, sendInviteSchema } from "@/contracts/meta";
import { metaBillingUrl } from "@/lib/meta-links";

describe("contratos Meta", () => {
  it("normaliza o @ do Instagram e aceita campo vazio", () => {
    expect(
      linkPageSchema.parse({ page_url: "facebook.com/x1", instagram_username: "@Padaria.Joao" }).instagram_username,
    ).toBe("padaria.joao");
    expect(
      linkPageSchema.parse({ page_url: "facebook.com/x1", instagram_username: "" }).instagram_username,
    ).toBeUndefined();
    expect(linkPageSchema.safeParse({ page_url: "facebook.com/x1", instagram_username: "com espaço" }).success).toBe(
      false,
    );
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
