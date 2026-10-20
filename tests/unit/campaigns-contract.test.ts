import { describe, expect, it } from "vitest";
import { activateCampaignSchema, connectMetaAssetsSchema, createPausedCampaignSchema } from "@/contracts/campaigns";

describe("campaigns and Meta contracts (Milestone 3)", () => {
  it("valida conexão de ativos Meta com ID de conta act_*", () => {
    const ok = connectMetaAssetsSchema.safeParse({
      ad_account_id: "act_123456789",
      ad_account_name: "Padaria Exemplo Ads",
      page_id: "987654321",
      page_name: "Padaria Exemplo",
      whatsapp_phone_e164: "+5519999990000",
      billing_verified_on_meta: true,
    });
    expect(ok.success).toBe(true);

    const badAccount = connectMetaAssetsSchema.safeParse({
      ad_account_id: "123456", // falta prefixo act_
      ad_account_name: "Padaria",
      page_id: "987",
      page_name: "Padaria",
    });
    expect(badAccount.success).toBe(false);
  });

  it("exige confirmação de orçamento pelo owner e limites em centavos para criar campanha pausada", () => {
    const valid = createPausedCampaignSchema.safeParse({
      strategy_id: "11111111-1111-4111-8111-111111111111",
      name: "Campanha Café da Manhã",
      objective: "mensagens_whatsapp",
      daily_budget_cents: 2500,
      currency: "BRL",
      duration_days: 7,
      creative_ids: ["22222222-2222-4222-8222-222222222222"],
      spend_confirmed_by_owner: true,
      idempotency_key: "idemp_1234567890",
    });
    expect(valid.success).toBe(true);

    // Orçamento abaixo de R$ 10,00 (1000 centavos) é rejeitado
    expect(
      createPausedCampaignSchema.safeParse({
        strategy_id: "11111111-1111-4111-8111-111111111111",
        name: "Campanha Barata",
        objective: "mensagens_whatsapp",
        daily_budget_cents: 500,
        currency: "BRL",
        duration_days: 7,
        creative_ids: ["22222222-2222-4222-8222-222222222222"],
        spend_confirmed_by_owner: true,
        idempotency_key: "idemp_1234567890",
      }).success,
    ).toBe(false);

    // Sem confirmação explícita do owner é rejeitado
    expect(
      createPausedCampaignSchema.safeParse({
        strategy_id: "11111111-1111-4111-8111-111111111111",
        name: "Campanha Sem Consentimento",
        objective: "mensagens_whatsapp",
        daily_budget_cents: 2500,
        currency: "BRL",
        duration_days: 7,
        creative_ids: ["22222222-2222-4222-8222-222222222222"],
        spend_confirmed_by_owner: false,
        idempotency_key: "idemp_1234567890",
      }).success,
    ).toBe(false);
  });

  it("exige segunda confirmação explícita do owner para ativar campanha", () => {
    expect(
      activateCampaignSchema.safeParse({
        campaign_id: "11111111-1111-4111-8111-111111111111",
        confirmed_daily_budget_cents: 2500,
        confirmed_duration_days: 7,
        owner_activation_confirmed: true,
        idempotency_key: "act_1234567890",
      }).success,
    ).toBe(true);

    expect(
      activateCampaignSchema.safeParse({
        campaign_id: "11111111-1111-4111-8111-111111111111",
        confirmed_daily_budget_cents: 2500,
        confirmed_duration_days: 7,
        owner_activation_confirmed: false,
        idempotency_key: "act_1234567890",
      }).success,
    ).toBe(false);
  });
});
