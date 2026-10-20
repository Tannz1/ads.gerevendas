"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CAMPAIGN_BUDGET_LIMITS } from "@/contracts/campaigns";
import { TEMPLATE_LABELS, type AngleKey } from "@/contracts/creatives";
import type { Objective } from "@/contracts/onboarding";
import { formatCents } from "@/lib/money";
import { publishPausedCampaign } from "@/server/campaigns";
import type { CreativeView } from "@/server/creatives-data";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/field";

type Props = {
  strategyId: string;
  defaultName: string;
  objective: Objective;
  approvedCreatives: CreativeView[];
  isOwner: boolean;
  metaConnected: boolean;
  simulated: boolean;
};

export function NewCampaignForm({
  strategyId,
  defaultName,
  objective,
  approvedCreatives,
  isOwner,
  metaConnected,
  simulated,
}: Props) {
  const router = useRouter();
  const [name, setName] = useState(defaultName);
  const [dailyReais, setDailyReais] = useState("25");
  const [durationDays, setDurationDays] = useState(7);
  const [selectedIds, setSelectedIds] = useState<string[]>(() => approvedCreatives.map((c) => c.id));
  const [spendConfirmed, setSpendConfirmed] = useState(false);
  const [idempotencyKey] = useState(() => `pub_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const dailyCents = Math.round((Number(dailyReais.replace(",", ".")) || 0) * 100);
  const totalMediaCents = dailyCents * durationDays;

  function toggleCreative(id: string) {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const res = await publishPausedCampaign({
        strategy_id: strategyId,
        name,
        objective,
        daily_budget_cents: dailyCents,
        currency: "BRL",
        duration_days: durationDays,
        creative_ids: selectedIds,
        spend_confirmed_by_owner: spendConfirmed,
        idempotency_key: idempotencyKey,
      });
      if (!res.ok) {
        setError(res.error.message);
        return;
      }
      router.push(`/app/campanhas/${res.data.campaign_id}`);
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="mt-8 space-y-6">
      {/* Box persistente de separação de livros financeiros (docs/02_UX_UI.md Tela I) */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="border-line p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold tracking-wider text-ink-soft uppercase">Assinatura do Software</span>
            <Badge tone="brand">GereVendas Ads</Badge>
          </div>
          <p className="mt-2 font-display text-2xl font-bold">R$ 199,00/mês</p>
          <p className="mt-1 text-xs text-ink-soft">
            Inclui geração de estratégias, criativos e gestão. Não inclui verba de anúncios.
          </p>
        </Card>

        <Card className="border-brand/30 bg-brand-soft/40 p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold tracking-wider text-brand-strong uppercase">
              Mídia Meta Autorizada
            </span>
            {simulated ? <Badge tone="demo">Simulação</Badge> : <Badge tone="warning">Pago à Meta</Badge>}
          </div>
          <p className="mt-2 font-display text-2xl font-bold text-ink">
            {dailyCents > 0 ? formatCents(totalMediaCents, "BRL") : "R$ 0,00"}{" "}
            <span className="text-sm font-normal text-ink-soft">
              ({dailyCents > 0 ? formatCents(dailyCents, "BRL") : "R$ 0,00"}/dia × {durationDays} dias)
            </span>
          </p>
          <p className="mt-1 text-xs text-ink-soft">Cobrado diretamente pela Meta no seu Gerenciador de Anúncios.</p>
        </Card>
      </div>

      <Card className="space-y-5 p-5 sm:p-6">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-bold">Configuração da campanha</h2>
          <Badge>Nasce PAUSADA</Badge>
        </div>

        <Field id="campaign_name" label="Nome da campanha">
          <Input
            id="campaign_name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={!isOwner || pending}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            id="daily_budget"
            label="Orçamento diário (R$)"
            hint={`Mínimo ${formatCents(CAMPAIGN_BUDGET_LIMITS.min_daily_cents)} / Máximo ${formatCents(CAMPAIGN_BUDGET_LIMITS.max_daily_cents)}`}
          >
            <Input
              id="daily_budget"
              type="number"
              min={10}
              max={500}
              step={1}
              value={dailyReais}
              onChange={(e) => setDailyReais(e.target.value)}
              disabled={!isOwner || pending}
            />
          </Field>

          <Field id="duration_days" label="Duração (dias)" hint="De 1 a 30 dias">
            <Input
              id="duration_days"
              type="number"
              min={1}
              max={30}
              value={durationDays}
              onChange={(e) => setDurationDays(Number(e.target.value) || 1)}
              disabled={!isOwner || pending}
            />
          </Field>
        </div>

        <div>
          <p className="text-sm font-semibold">Peças aprovadas para publicar ({selectedIds.length})</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {approvedCreatives.map((c) => {
              const checked = selectedIds.includes(c.id);
              return (
                <label
                  key={c.id}
                  className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-line p-3 text-sm"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={!isOwner || pending}
                    onChange={() => toggleCreative(c.id)}
                    className="mt-1 size-4 accent-[var(--color-brand)]"
                  />
                  <div>
                    <p className="font-semibold">{TEMPLATE_LABELS[c.angle_key as AngleKey] ?? c.angle_key}</p>
                    <p className="text-xs text-ink-soft">{c.content.headline}</p>
                  </div>
                </label>
              );
            })}
          </div>
        </div>

        <label className="flex items-start gap-2.5 rounded-xl border border-line bg-surface-muted p-4 text-sm">
          <input
            type="checkbox"
            checked={spendConfirmed}
            disabled={!isOwner || pending}
            onChange={(e) => setSpendConfirmed(e.target.checked)}
            className="mt-1 size-4 accent-[var(--color-brand)]"
          />
          <span>
            Autorizo a criação desta campanha inicialmente <strong>PAUSADA</strong> com orçamento de{" "}
            <strong>{formatCents(Math.max(0, dailyCents), "BRL")}/dia</strong> por <strong>{durationDays} dias</strong>{" "}
            ({formatCents(Math.max(0, totalMediaCents), "BRL")} no período). Estou ciente de que a ativação exigirá uma
            segunda confirmação e que a mídia é paga diretamente à Meta.
          </span>
        </label>

        {error && <Alert tone="danger">{error}</Alert>}

        {!isOwner ? (
          <Alert tone="warning">
            Apenas o proprietário (owner) da empresa pode autorizar orçamento e publicar campanhas.
          </Alert>
        ) : !metaConnected ? (
          <Alert tone="warning">Conecte os ativos da Meta em Conexões antes de criar a campanha.</Alert>
        ) : (
          <Button type="submit" disabled={pending || !spendConfirmed || selectedIds.length === 0}>
            {pending
              ? "Criando campanha pausada…"
              : simulated
                ? "Criar campanha PAUSADA (Simulação)"
                : "Criar campanha PAUSADA"}
          </Button>
        )}
      </Card>
    </form>
  );
}
