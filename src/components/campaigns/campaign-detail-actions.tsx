"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatCents } from "@/lib/money";
import { activatePausedCampaign, pauseActiveCampaign } from "@/server/campaigns";
import type { CampaignStatus } from "@/contracts/campaigns";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

type Props = {
  campaignId: string;
  status: CampaignStatus;
  dailyBudgetCents: number;
  durationDays: number;
  currency: string;
  simulated: boolean;
  isOwner: boolean;
  canPause: boolean;
};

export function CampaignDetailActions({
  campaignId,
  status,
  dailyBudgetCents,
  durationDays,
  currency,
  simulated,
  isOwner,
  canPause,
}: Props) {
  const router = useRouter();
  const [confirmActivate, setConfirmActivate] = useState(false);
  const [idempotencyKey] = useState(() => `act_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`);
  const [message, setMessage] = useState<{ tone: "success" | "danger" | "info"; text: string } | null>(null);
  const [pending, start] = useTransition();

  const totalCents = dailyBudgetCents * durationDays;

  function handleActivate() {
    setMessage(null);
    start(async () => {
      const res = await activatePausedCampaign({
        campaign_id: campaignId,
        confirmed_daily_budget_cents: dailyBudgetCents,
        confirmed_duration_days: durationDays,
        owner_activation_confirmed: confirmActivate,
        idempotency_key: idempotencyKey,
      });
      if (!res.ok) {
        setMessage({ tone: "danger", text: res.error.message });
        return;
      }
      setConfirmActivate(false);
      setMessage({
        tone: "success",
        text: simulated ? "Campanha ativada em modo Simulação." : "Campanha ativada e enviada para veiculação.",
      });
      router.refresh();
    });
  }

  function handlePause() {
    setMessage(null);
    start(async () => {
      const res = await pauseActiveCampaign(campaignId);
      if (!res.ok) {
        setMessage({ tone: "danger", text: res.error.message });
        return;
      }
      setMessage({ tone: "info", text: "Campanha pausada com sucesso." });
      router.refresh();
    });
  }

  return (
    <Card className="p-5 sm:p-6">
      <h2 className="font-display text-lg font-bold">Controle de veiculação</h2>

      {status === "paused" && (
        <div className="mt-3 space-y-4">
          <p className="text-sm text-ink-soft">
            Esta campanha está <strong>PAUSADA</strong> (nenhum valor está sendo gasto). Para iniciar a veiculação, o
            proprietário precisa confirmar o orçamento abaixo:
          </p>

          {isOwner ? (
            <>
              <label className="flex items-start gap-2.5 rounded-xl border border-line bg-surface-muted p-4 text-sm">
                <input
                  type="checkbox"
                  checked={confirmActivate}
                  disabled={pending}
                  onChange={(e) => setConfirmActivate(e.target.checked)}
                  className="mt-1 size-4 accent-[var(--color-brand)]"
                />
                <span>
                  Segunda confirmação: autorizo ativar esta campanha agora com orçamento diário de{" "}
                  <strong>{formatCents(dailyBudgetCents, currency)}</strong> por <strong>{durationDays} dias</strong>{" "}
                  (total estimado de <strong>{formatCents(totalCents, currency)}</strong>).
                </span>
              </label>

              <Button type="button" onClick={handleActivate} disabled={pending || !confirmActivate}>
                {pending
                  ? "Ativando…"
                  : simulated
                    ? "Confirmar e ativar campanha (Simulação)"
                    : "Confirmar e ativar campanha"}
              </Button>
            </>
          ) : (
            <Alert tone="warning">Apenas o proprietário da empresa pode ativar uma campanha pausada.</Alert>
          )}
        </div>
      )}

      {status === "active" && (
        <div className="mt-3 space-y-4">
          <p className="text-sm text-ink-soft">
            Esta campanha está <strong>ATIVA</strong> com orçamento diário de{" "}
            <strong>{formatCents(dailyBudgetCents, currency)}</strong>.
          </p>
          {canPause && (
            <Button type="button" variant="secondary" onClick={handlePause} disabled={pending}>
              {pending ? "Pausando…" : "Pausar campanha"}
            </Button>
          )}
        </div>
      )}

      {message && (
        <div className="mt-4">
          <Alert tone={message.tone}>{message.text}</Alert>
        </div>
      )}
    </Card>
  );
}
