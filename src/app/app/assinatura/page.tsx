import type { Metadata } from "next";
import { BillingSandboxControls } from "@/components/billing/billing-sandbox-controls";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { PLAN_MONTHLY_PRICE_CENTS } from "@/contracts/billing";
import { formatCents } from "@/lib/money";
import { loadBillingOverview } from "@/server/billing-data";
import { getAppContext } from "@/server/context";
import { loadCreditSummary } from "@/server/creatives-data";

export const metadata: Metadata = { title: "Assinatura" };

const STATUS_LABELS = {
  trialing: "Período de avaliação (Piloto)",
  active: "Ativa",
  past_due: "Pagamento pendente",
  canceled: "Cancelada",
  suspended: "Suspensa",
} as const;

export default async function BillingPage() {
  const ctx = await getAppContext();

  if (ctx.mode === "demo" || !ctx.organization) {
    return (
      <div className="mx-auto max-w-3xl">
        <div className="flex items-center gap-3">
          <h1 className="font-display text-3xl font-bold tracking-tight">Assinatura</h1>
          <Badge tone="demo">Demonstração</Badge>
        </div>
        <Card className="mt-8 p-6">
          <p className="text-[15px] text-ink-soft">
            Plano GereVendas Ads: <strong>R$ 199,00/mês</strong> por empresa (até 4 estratégias e 20 imagens com IA por
            mês). A verba de anúncios é paga diretamente à Meta.
          </p>
        </Card>
      </div>
    );
  }

  const canManage = ctx.organization.role === "owner" || ctx.organization.role === "admin";
  const [{ subscription, events }, credits] = await Promise.all([
    loadBillingOverview(ctx.organization.id, canManage),
    loadCreditSummary(ctx.organization.id),
  ]);

  const status = subscription?.status ?? "trialing";

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight">Assinatura e Créditos</h1>
          <p className="mt-1 text-[15px] text-ink-soft">
            Acompanhe o plano da empresa <strong>{ctx.organization.name}</strong> e o uso mensal de IA.
          </p>
        </div>
        <Badge tone="demo">Simulação</Badge>
      </div>

      <Alert tone="info" title="Dois livros financeiros independentes">
        A mensalidade de <strong>R$ 199,00/mês</strong> remunera exclusivamente o software GereVendas Ads. A verba de
        mídia dos anúncios é paga diretamente pela sua empresa no ambiente oficial da Meta.
      </Alert>

      <Card className="p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold tracking-wider text-ink-soft uppercase">Plano atual</p>
            <h2 className="mt-1 font-display text-2xl font-bold">
              GereVendas Ads — {formatCents(subscription?.amount_cents ?? PLAN_MONTHLY_PRICE_CENTS, "BRL")}/mês
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <Badge
              tone={
                status === "active" ? "success" : status === "past_due" || status === "suspended" ? "warning" : "brand"
              }
            >
              {STATUS_LABELS[status]}
            </Badge>
          </div>
        </div>

        {credits && (
          <div className="mt-6 grid gap-4 border-t border-line pt-5 sm:grid-cols-2">
            <div className="rounded-xl border border-line bg-surface-muted p-4">
              <p className="text-xs font-semibold tracking-wider text-ink-soft uppercase">
                Estratégias no ciclo ({credits.period})
              </p>
              <p className="mt-1 font-display text-xl font-bold">
                {credits.strategy.used} de {credits.strategy.limit} usadas
              </p>
            </div>
            <div className="rounded-xl border border-line bg-surface-muted p-4">
              <p className="text-xs font-semibold tracking-wider text-ink-soft uppercase">
                Imagens-base IA ({credits.period})
              </p>
              <p className="mt-1 font-display text-xl font-bold">
                {credits.image.used} de {credits.image.limit} usadas
              </p>
            </div>
          </div>
        )}

        <BillingSandboxControls canManage={canManage} />
      </Card>

      {canManage && (
        <Card className="p-5 sm:p-6">
          <h2 className="font-display text-lg font-bold">Histórico de eventos de cobrança</h2>
          {events.length === 0 ? (
            <p className="mt-2 text-sm text-ink-soft">Nenhum evento de cobrança registrado ainda.</p>
          ) : (
            <ul className="mt-3 divide-y divide-line text-sm">
              {events.map((ev) => (
                <li key={ev.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                  <div>
                    <span className="font-medium">{ev.event_type}</span>{" "}
                    <span className="text-xs text-ink-soft">
                      ({formatCents(ev.amount_cents, ev.currency)} · {ev.event_id})
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {ev.simulated && <Badge tone="demo">Simulação</Badge>}
                    <span className="text-xs text-ink-faint">{new Date(ev.created_at).toLocaleString("pt-BR")}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
    </div>
  );
}
