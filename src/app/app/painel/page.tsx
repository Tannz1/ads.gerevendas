import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { DashboardRefresh } from "@/components/campaigns/dashboard-refresh";
import { summarizeMetrics } from "@/lib/campaign-metrics";
import { formatCents } from "@/lib/money";
import { getAppContext } from "@/server/context";
import { loadDashboard } from "@/server/dashboard-data";

export const metadata: Metadata = { title: "Resultados" };
const compact = new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 });
const numbers = new Intl.NumberFormat("pt-BR");
const statuses = { draft: "Incompleta", paused: "Pausada", active: "Ativa", ended: "Encerrada" };
const date = (value: string) =>
  new Date(value).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });

export default async function DashboardPage() {
  const ctx = await getAppContext();
  const demo = ctx.mode === "demo";
  let data: Awaited<ReturnType<typeof loadDashboard>> = { account: null, campaigns: [] };
  let failed = false;
  if (ctx.mode === "supabase" && ctx.organization) {
    try {
      data = await loadDashboard(ctx.organization.id);
    } catch {
      failed = true;
    }
  }
  const real = data.campaigns.filter((c) => !c.simulated);
  const measured = real.filter((c) => c.campaign_insights !== null && c.currency === "BRL");
  const totals = summarizeMetrics(measured.map((c) => c.campaign_insights!));
  const oldest = measured.map((c) => c.campaign_insights!.fetched_at).sort()[0];
  const maxSpend = Math.max(1, ...measured.map((c) => c.campaign_insights!.spend_cents));
  const dash = "—";

  const tiles: Array<[string, string]> = [
    ["Exibições", totals ? compact.format(totals.impressions) : dash],
    ["Cliques", totals ? compact.format(totals.clicks) : dash],
    ["Conversas", totals ? compact.format(totals.conversations) : dash],
    ["Custo por clique", totals?.cpc_cents != null ? formatCents(totals.cpc_cents, "BRL") : dash],
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-display text-3xl font-bold tracking-tight">Resultados</h1>
        <div className="flex items-center gap-3">
          {demo && <Badge tone="demo">Demonstração</Badge>}
          {!demo && real.some((c) => c.status !== "draft") && <DashboardRefresh />}
          {!demo && <ButtonLink href="/app/campanhas/nova">Nova campanha</ButtonLink>}
        </div>
      </div>

      {failed && <Alert tone="danger">Não foi possível carregar os dados. Recarregue a página.</Alert>}

      <section aria-label="Resumo" className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <Card className="flex flex-col justify-between p-6">
          <p className="text-sm text-ink-soft">Investido</p>
          <p className="mt-3 text-5xl font-semibold tracking-tight">
            {totals ? formatCents(totals.spend_cents, "BRL") : dash}
          </p>
          <p className="mt-4 text-sm text-ink-faint">
            {totals ? `Atualizado em ${date(oldest)}` : "Aparece quando a primeira campanha rodar."}
          </p>
        </Card>
        <dl className="grid grid-cols-2 gap-4">
          {tiles.map(([label, value]) => (
            <Card key={label} className="p-5">
              <dt className="text-sm text-ink-soft">{label}</dt>
              <dd className="mt-2 text-2xl font-semibold">{value}</dd>
            </Card>
          ))}
        </dl>
      </section>

      <section aria-labelledby="campaigns-title">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="campaigns-title" className="font-display text-xl font-bold">
            Campanhas
          </h2>
          <Link className="text-sm font-semibold text-brand underline" href="/app/campanhas">
            Gerenciar
          </Link>
        </div>
        {data.campaigns.length ? (
          <div className="mt-4 overflow-x-auto rounded-2xl border border-line bg-surface">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="text-left text-ink-soft">
                <tr className="border-b border-line">
                  <th className="px-5 py-3 font-medium">Campanha</th>
                  <th className="px-3 py-3 font-medium">Investido</th>
                  <th className="px-3 py-3 text-right font-medium">Cliques</th>
                  <th className="px-3 py-3 text-right font-medium">Conversas</th>
                  <th className="px-5 py-3 text-right font-medium">Custo por clique</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line tabular-nums">
                {data.campaigns.map((c) => {
                  const m = c.simulated ? null : c.campaign_insights;
                  const cpc = m && m.clicks > 0 ? formatCents(Math.round(m.spend_cents / m.clicks), c.currency) : dash;
                  return (
                    <tr key={c.id} className="align-top">
                      <td className="px-5 py-4">
                        <Link className="font-semibold text-ink hover:text-brand" href={`/app/campanhas/${c.id}`}>
                          {c.name}
                        </Link>
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          <Badge>{statuses[c.status]}</Badge>
                          {c.simulated && <Badge tone="demo">Simulação</Badge>}
                        </div>
                        {c.execution_started_at && (
                          <p className="mt-2 text-xs text-warning">
                            Operação em andamento desde {date(c.execution_started_at)}. Se não terminar, fale com o
                            suporte.
                          </p>
                        )}
                      </td>
                      <td className="px-3 py-4">
                        {m ? (
                          <div
                            className="flex min-w-40 items-center gap-2"
                            title={formatCents(m.spend_cents, c.currency)}
                          >
                            <span className="h-2 flex-1 rounded-full bg-brand-soft">
                              <span
                                className="block h-2 rounded-full bg-brand"
                                style={{ width: `${Math.max(2, (m.spend_cents / maxSpend) * 100)}%` }}
                              />
                            </span>
                            <span>{formatCents(m.spend_cents, c.currency)}</span>
                          </div>
                        ) : (
                          <span className="text-ink-faint">{c.simulated ? "Simulação" : "Sem dados ainda"}</span>
                        )}
                      </td>
                      <td className="px-3 py-4 text-right">{m ? numbers.format(m.clicks) : dash}</td>
                      <td className="px-3 py-4 text-right">{m ? numbers.format(m.conversations) : dash}</td>
                      <td className="px-5 py-4 text-right">{cpc}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <Card className="mt-4 flex flex-wrap items-center justify-between gap-4 p-6">
            <p className="text-ink-soft">Nenhuma campanha ainda.</p>
            {!demo && (
              <ButtonLink href="/app/criativos" variant="secondary">
                Ver meus anúncios
              </ButtonLink>
            )}
          </Card>
        )}
        {real.length > 0 && (
          <p className="mt-3 text-xs text-ink-faint">
            Totais em reais, só de campanhas reais com dados da Meta. Campanhas em Simulação não entram.
          </p>
        )}
      </section>
    </div>
  );
}
