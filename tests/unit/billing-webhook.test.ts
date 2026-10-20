import { describe, expect, it } from "vitest";
import { billingWebhookPayloadSchema, submitPilotFeedbackSchema } from "@/contracts/billing";
import { computeWebhookHmac, verifyWebhookHmac } from "@/lib/webhook-signature";

describe("billing contracts and HMAC verification (Milestone 4 & 5)", () => {
  it("valida assinatura HMAC-SHA256 correta e rejeita assinatura adulterada", () => {
    const secret = "segredo_webhook_teste_123456";
    const body = JSON.stringify({
      provider: "gateway_br",
      event_id: "evt_998877",
      event_type: "invoice.paid",
      organization_id: "11111111-1111-4111-8111-111111111111",
    });

    const sig = computeWebhookHmac(body, secret);
    expect(verifyWebhookHmac(body, sig, secret)).toBe(true);
    expect(verifyWebhookHmac(body, `sha256=${sig}`, secret)).toBe(true);
    expect(verifyWebhookHmac(body, sig, "outro_segredo")).toBe(false);
    expect(verifyWebhookHmac(`${body}x`, sig, secret)).toBe(false);
    expect(verifyWebhookHmac(body, null, secret)).toBe(false);
  });

  it("valida payload do webhook de cobrança", () => {
    const ok = billingWebhookPayloadSchema.safeParse({
      provider: "asaas_sandbox",
      event_id: "evt_001",
      event_type: "subscription.activated",
      organization_id: "11111111-1111-4111-8111-111111111111",
    });
    expect(ok.success).toBe(true);
    if (ok.success) {
      expect(ok.data.amount_cents).toBe(19_900);
      expect(ok.data.currency).toBe("BRL");
    }
  });

  it("valida feedback do piloto", () => {
    expect(
      submitPilotFeedbackSchema.safeParse({
        stage: "strategy",
        rating: "helpful",
        comment: "Propostas muito claras!",
      }).success,
    ).toBe(true);
  });
});
