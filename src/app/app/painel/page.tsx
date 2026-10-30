import type { Metadata } from "next";
import Link from "next/link";
import { CampaignCard, MetricsSummary, StatusSummary } from "@/components/campaigns/dashboard-cards";
import { DashboardRefresh } from "@/components/campaigns/dashboard-refresh";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { summarizeMetrics } from "@/lib/campaign-metrics";
import { getAppContext } from "@/server/context";
import { loadDashboard } from "@/server/dashboard-data";

export const metadata: Metadata = { title: "Resultados" };

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

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-display text-3xl font-bold tracking-tight">Resultados</h1>
        <div className="flex items-center gap-3">
          {demo && <Badge tone="demo">Demonstração</Badge>}
          {!demo && real.some((c) => c.status !== "draft") && <DashboardRefresh />}
          {!demo && <ButtonLink href="/app/campanhas/nova">Nova campanha</ButtonLink>}
        </div>
      </div>

      {failed && <Alert tone="danger">Não foi possível carregar os dados. Recarregue a página.</Alert>}

      {totals ? (
        <MetricsSummary totals={totals} updatedAt={oldest} />
      ) : (
        data.campaigns.length > 0 && <StatusSummary campaigns={data.campaigns} />
      )}

      <section aria-labelledby="campaigns-title">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="campaigns-title" className="font-display text-xl font-bold">
            Suas campanhas
          </h2>
          {data.campaigns.length > 0 && (
            <Link className="text-sm font-semibold text-brand hover:underline" href="/app/campanhas">
              Gerenciar
            </Link>
          )}
        </div>
        {data.campaigns.length ? (
          <ul className="mt-4 grid gap-4 md:grid-cols-2">
            {data.campaigns.map((c) => (
              <li key={c.id}>
                <CampaignCard campaign={c} />
              </li>
            ))}
          </ul>
        ) : (
          <Card className="mt-4 flex flex-col items-start gap-4 p-8">
            <p className="font-display text-lg font-bold">Nenhuma campanha ainda</p>
            <p className="max-w-md text-ink-soft">
              Escolha um dos seus anúncios, defina a verba por dia e publique. Os resultados aparecem aqui.
            </p>
            {!demo && <ButtonLink href="/app/campanhas/nova">Criar campanha</ButtonLink>}
          </Card>
        )}
      </section>
    </div>
  );
}
