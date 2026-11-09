"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addMediaBalanceAction, simulateBillingEvent } from "@/server/billing";
import { MEDIA_TOPUP_PRESETS_CENTS, type BillingEventType } from "@/contracts/billing";
import { formatCents } from "@/lib/money";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export function BillingSandboxControls({ canManage }: { canManage: boolean }) {
  const router = useRouter();
  const [message, setMessage] = useState<{ tone: "success" | "info" | "danger"; text: string } | null>(null);
  const [pending, start] = useTransition();

  function trigger(eventType: BillingEventType) {
    setMessage(null);
    start(async () => {
      const eventId = `sim_evt_${Date.now()}`;
      const res = await simulateBillingEvent({ event_type: eventType, event_id: eventId });
      if (!res.ok) {
        setMessage({ tone: "danger", text: res.error.message });
        return;
      }
      setMessage({
        tone: "success",
        text: `Evento simulado (${eventType}) processado com sucesso.`,
      });
      router.refresh();
    });
  }

  function addMediaTopup(amountCents: number) {
    setMessage(null);
    start(async () => {
      const res = await addMediaBalanceAction({
        amount_cents: amountCents,
        external_reference: `sim_topup_${Date.now()}`,
      });
      if (!res.ok) {
        setMessage({ tone: "danger", text: res.error.message });
        return;
      }
      const fundedMsg =
        res.data.funded_campaigns > 0
          ? ` (${res.data.funded_campaigns} campanha(s) financiada(s) automaticamente)`
          : "";
      setMessage({
        tone: "success",
        text: `Saldo de mídia de ${formatCents(amountCents)} adicionado${fundedMsg}.`,
      });
      router.refresh();
    });
  }

  if (!canManage) return null;

  return (
    <div className="mt-5 space-y-4 border-t border-line pt-4">
      <div className="space-y-2">
        <p className="text-xs font-semibold tracking-wider text-ink-soft uppercase">
          Adicionar saldo de mídia (Simulação)
        </p>
        <div className="flex flex-wrap gap-2">
          {MEDIA_TOPUP_PRESETS_CENTS.map((preset) => (
            <Button
              key={preset}
              type="button"
              variant="secondary"
              onClick={() => addMediaTopup(preset)}
              disabled={pending}
            >
              + {formatCents(preset)}
            </Button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-semibold tracking-wider text-ink-soft uppercase">
          Ações de teste do piloto (Simulação / Sandbox)
        </p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={() => trigger("subscription.activated")} disabled={pending}>
            Ativar assinatura (Simulação)
          </Button>
          <Button type="button" variant="secondary" onClick={() => trigger("invoice.paid")} disabled={pending}>
            Registrar pagamento mensal (Simulação)
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => trigger("invoice.payment_failed")}
            disabled={pending}
          >
            Simular atraso (past_due)
          </Button>
          <Button type="button" variant="secondary" onClick={() => trigger("subscription.canceled")} disabled={pending}>
            Cancelar assinatura (Simulação)
          </Button>
        </div>
      </div>
      {message && <Alert tone={message.tone}>{message.text}</Alert>}
    </div>
  );
}
