import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { apiError } from "@/contracts/api";
import { billingWebhookPayloadSchema } from "@/contracts/billing";
import { CORRELATION_HEADER, ensureCorrelationId } from "@/lib/correlation";
import { serverEnv } from "@/lib/env";
import { log } from "@/lib/logger";
import { verifyWebhookHmac } from "@/lib/webhook-signature";

/**
 * Webhook de cobrança assinado via HMAC-SHA256 e idempotente por (provider, event_id).
 */
export async function POST(request: Request) {
  const correlationId = ensureCorrelationId(request.headers.get(CORRELATION_HEADER));
  const env = serverEnv();

  const rawBody = await request.text();
  const signature = request.headers.get("x-webhook-signature");

  if (!verifyWebhookHmac(rawBody, signature, env.BILLING_WEBHOOK_SECRET)) {
    log("warn", "billing.webhook_invalid_signature", { correlation_id: correlationId });
    return NextResponse.json(apiError("forbidden", "Assinatura do webhook inválida.", correlationId), { status: 401 });
  }

  let json: unknown;
  try {
    json = JSON.parse(rawBody);
  } catch {
    return NextResponse.json(apiError("validation_failed", "JSON inválido.", correlationId), { status: 400 });
  }

  const parsed = billingWebhookPayloadSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(apiError("validation_failed", "Payload do webhook inválido.", correlationId), {
      status: 400,
    });
  }

  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json(apiError("feature_disabled", "Persistência de webhook não configurada.", correlationId), {
      status: 503,
    });
  }

  const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await supabase.rpc("process_billing_event", {
    p_org: parsed.data.organization_id,
    p_provider: parsed.data.provider,
    p_event_id: parsed.data.event_id,
    p_event_type: parsed.data.event_type,
    p_amount_cents: parsed.data.amount_cents,
    p_simulated: parsed.data.simulated,
    p_correlation_id: correlationId,
  });

  if (error) {
    log("error", "billing.webhook_failed", { correlation_id: correlationId, code: error.code });
    return NextResponse.json(apiError("internal", "Erro ao processar evento de cobrança.", correlationId), {
      status: 500,
    });
  }

  return NextResponse.json({ ok: true, data, correlation_id: correlationId });
}
