"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { simulateBillingEvent } from "@/server/billing";
import type { BillingEventType } from "@/contracts/billing";
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

  if (!canManage) return null;

  return (
    <div className="mt-5 space-y-3 border-t border-line pt-4">
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
        <Button type="button" variant="secondary" onClick={() => trigger("invoice.payment_failed")} disabled={pending}>
          Simular atraso (past_due)
        </Button>
        <Button type="button" variant="secondary" onClick={() => trigger("subscription.canceled")} disabled={pending}>
          Cancelar assinatura (Simulação)
        </Button>
      </div>
      {message && <Alert tone={message.tone}>{message.text}</Alert>}
    </div>
  );
}
