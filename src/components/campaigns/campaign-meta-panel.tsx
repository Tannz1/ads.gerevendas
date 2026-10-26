"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { CampaignStatus } from "@/contracts/campaigns";
import { formatCents } from "@/lib/money";
import { resumeRealPublication, syncCampaignFromMeta } from "@/server/campaigns";
import type { CampaignDetailView } from "@/server/campaigns-data";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

type Props = {
  campaignId: string;
  status: CampaignStatus;
  simulated: boolean;
  isOwner: boolean;
  currency: string;
  insights: CampaignDetailView["insights"];
  justFailed: boolean;
};

const number = new Intl.NumberFormat("pt-BR");

/** Publicação incompleta (retomar), métricas lidas da Meta e atualização manual. */
export function CampaignMetaPanel({ campaignId, status, simulated, isOwner, currency, insights, justFailed }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ tone: "success" | "danger" | "info" | "warning"; text: string } | null>(
    justFailed
      ? { tone: "warning", text: "A campanha foi salva, mas a publicação na Meta parou no meio. Tente retomar." }
      : null,
  );
  const live = !simulated && status !== "draft";

  // Ao abrir, busca revisão e métricas (o servidor limita a 1 leitura por minuto por campanha).
  useEffect(() => {
    if (!live) return;
    let cancelled = false;
    void syncCampaignFromMeta(campaignId)
      .then((res) => {
        if (cancelled) return;
        if (res.ok && res.data.synced) router.refresh();
        if (!res.ok) setMessage({ tone: "warning", text: res.error.message });
      })
      .catch(() => {
        if (!cancelled) setMessage({ tone: "warning", text: "Não foi possível atualizar os dados. Tente novamente." });
      });
    return () => {
      cancelled = true;
    };
  }, [live, campaignId, router]);

  function resume() {
    setMessage(null);
    start(async () => {
      const res = await resumeRealPublication(campaignId).catch(() => null);
      if (!res) {
        setMessage({
          tone: "warning",
          text: "Não foi possível confirmar a publicação. Recarregue os detalhes antes de tentar novamente.",
        });
        return;
      }
      if (!res.ok) {
        setMessage({ tone: "danger", text: res.error.message });
        return;
      }
      setMessage(
        res.data.completed
          ? {
              tone: "success",
              text: "Publicação concluída. A campanha está pausada. A revisão será consultada na Meta.",
            }
          : { tone: "warning", text: res.data.warning ?? "A publicação ainda não terminou. Tente de novo." },
      );
      router.refresh();
    });
  }

  function sync() {
    setMessage(null);
    start(async () => {
      const res = await syncCampaignFromMeta(campaignId).catch(() => null);
      if (!res) {
        setMessage({ tone: "danger", text: "Não foi possível atualizar os dados. Tente novamente." });
        return;
      }
      if (!res.ok) {
        setMessage({ tone: "danger", text: res.error.message });
        return;
      }
      setMessage(
        res.data.synced
          ? { tone: "success", text: "Dados atualizados com a Meta." }
          : { tone: "info", text: "Os dados foram atualizados há menos de 1 minuto." },
      );
      router.refresh();
    });
  }

  if (!simulated && status === "draft") {
    return (
      <Card className="p-5 sm:p-6">
        <h2 className="font-display text-lg font-bold">Publicação incompleta</h2>
        <p className="mt-2 text-sm text-ink-soft">
          Parte da campanha ainda não foi concluída. Retomar usa as etapas confirmadas. Se houver uma resposta incerta
          da Meta, o suporte precisará conferir os objetos antes de continuar.
        </p>
        {isOwner ? (
          <Button className="mt-4" onClick={resume} disabled={pending}>
            {pending ? "Retomando…" : "Retomar publicação"}
          </Button>
        ) : (
          <Alert tone="info" className="mt-4">
            Apenas o proprietário pode retomar a publicação.
          </Alert>
        )}
        {message && (
          <Alert tone={message.tone} className="mt-4">
            {message.text}
          </Alert>
        )}
      </Card>
    );
  }

  return (
    <Card className="p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-lg font-bold">Resultados na Meta</h2>
        {live && (
          <Button variant="secondary" size="sm" onClick={sync} disabled={pending}>
            {pending ? "Atualizando…" : "Atualizar dados da Meta"}
          </Button>
        )}
      </div>
      {simulated ? (
        <p className="mt-2 text-sm text-ink-soft">Não há resultados em modo Simulação: nada foi veiculado.</p>
      ) : insights ? (
        <>
          <dl className="mt-4 grid gap-4 sm:grid-cols-4">
            <Metric label="Investido" value={formatCents(insights.spend_cents, currency)} />
            <Metric label="Pessoas alcançadas" value={number.format(insights.reach)} />
            <Metric label="Vezes exibido" value={number.format(insights.impressions)} />
            <Metric label="Cliques" value={number.format(insights.clicks)} />
          </dl>
          {insights.conversations > 0 && (
            <p className="mt-3 text-sm text-ink-soft">
              Conversas iniciadas: <strong>{number.format(insights.conversations)}</strong>
            </p>
          )}
          <p className="mt-3 text-xs text-ink-faint">
            Dados da Meta atualizados em {new Date(insights.fetched_at).toLocaleString("pt-BR")}. A Meta pode levar
            algumas horas para consolidar os números.
          </p>
        </>
      ) : (
        <p className="mt-2 text-sm text-ink-soft">
          Ainda sem dados da Meta. Eles aparecem depois que a campanha é ativada e começa a veicular.
        </p>
      )}
      {message && (
        <Alert tone={message.tone} className="mt-4">
          {message.text}
        </Alert>
      )}
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold tracking-wider text-ink-soft uppercase">{label}</dt>
      <dd className="mt-1 font-display text-xl font-bold">{value}</dd>
    </div>
  );
}
