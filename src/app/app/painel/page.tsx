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

export const metadata: Metadata = { title: "Painel de resultados" };
const numbers = new Intl.NumberFormat("pt-BR");
const statuses = { draft: "Publicação incompleta", paused: "Pausada", active: "Ativa", ended: "Encerrada" };
const date = (value: string) => new Date(value).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });

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
  const currency = data.account?.currency ?? "BRL";
  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight">Painel de resultados</h1>
          <p className="mt-2 text-ink-soft">Acompanhe a conta e as campanhas da sua empresa.</p>
        </div>
        {demo ? (
          <Badge tone="demo">Demonstração</Badge>
        ) : (
          <ButtonLink href="/app/campanhas/nova">Nova campanha</ButtonLink>
        )}
      </div>
      {failed && (
        <Alert tone="danger">Não foi possível carregar os dados. Recarregue a página para tentar novamente.</Alert>
      )}
      <Card className="border-brand/20 p-5 sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="font-display text-lg font-bold">Sua conta de anúncios</h2>
            {data.account ? (
              <>
                <p className="mt-3 text-xl font-semibold break-words">{data.account.name}</p>
                <p className="mt-1 text-sm break-all text-ink-soft">Identificador: {data.account.ad_account_id}</p>
                <p className="mt-1 text-sm text-ink-soft">
                  Moeda: {currency}
                  {data.account.assigned_at ? ` · Atribuída em ${date(data.account.assigned_at)}` : ""}
                </p>
              </>
            ) : (
              <p className="mt-3 text-sm text-ink-soft">
                {demo
                  ? "Entre com sua conta para ver a conta atribuída à sua empresa."
                  : failed
                    ? "Conta indisponível no momento."
                    : "Sua empresa ainda não recebeu uma conta de anúncios. Acompanhe a preparação em Conexões."}
              </p>
            )}
          </div>
          {data.account?.simulated && <Badge tone="demo">Simulação</Badge>}
          <ButtonLink href="/app/conexoes" variant="secondary">
            Ver conexões
          </ButtonLink>
        </div>
        <p className="mt-5 border-t border-line pt-4 text-sm text-ink-soft">
          Os membros da sua empresa veem esta conta. Somente o proprietário pode autorizar a publicação e a ativação de
          campanhas.
        </p>
      </Card>
      <section aria-labelledby="metrics-title" className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 id="metrics-title" className="font-display text-xl font-bold">
              Resultados das campanhas
            </h2>
            <p className="mt-1 text-sm text-ink-soft">
              Acumulado de toda a veiculação, conforme os últimos dados recebidos da Meta.
            </p>
          </div>
          {!demo && real.some((c) => c.status !== "draft") && <DashboardRefresh />}
        </div>
        {totals ? (
          <>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-5 rounded-2xl border border-line bg-surface p-5 sm:grid-cols-3 sm:p-7">
              {[
                ["Investido", formatCents(totals.spend_cents, "BRL")],
                ["Exibições", numbers.format(totals.impressions)],
                ["Cliques", numbers.format(totals.clicks)],
                ["Conversas informadas pela Meta", numbers.format(totals.conversations)],
                ["Taxa de cliques", totals.ctr === null ? "—" : `${numbers.format(totals.ctr)}%`],
                ["Custo por clique", totals.cpc_cents === null ? "—" : formatCents(totals.cpc_cents, "BRL")],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-sm text-ink-soft">{label}</dt>
                  <dd className="mt-2 font-display text-2xl font-bold tabular-nums sm:text-3xl">{value}</dd>
                </div>
              ))}
            </dl>
            <p className="text-sm text-ink-soft">
              {measured.length} de {real.length} campanhas reais com métricas. Atualização mais antiga: {date(oldest)}.
              Os totais estão em reais; outras moedas aparecem por campanha. Campanhas em Simulação ficam fora dos
              totais. O alcance aparece por campanha para evitar contar a mesma pessoa duas vezes.
            </p>
          </>
        ) : (
          <Card className="p-7">
            <h3 className="font-semibold">Ainda não há métricas disponíveis</h3>
            <p className="mt-2 max-w-2xl text-sm text-ink-soft">
              {demo
                ? "A demonstração não apresenta resultados inventados. Os dados aparecem após a conexão e a sincronização de campanhas reais."
                : "Depois de publicar, atualize os dados da Meta. Campanhas em Simulação não geram resultados."}
            </p>
          </Card>
        )}
      </section>
      <section aria-labelledby="campaigns-title">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="campaigns-title" className="font-display text-xl font-bold">
            Suas campanhas
          </h2>
          <Link className="text-sm font-semibold text-brand underline" href="/app/campanhas">
            Gerenciar campanhas
          </Link>
        </div>
        {data.campaigns.length ? (
          <div className="mt-4 divide-y divide-line rounded-2xl border border-line bg-surface px-5">
            {data.campaigns.map((c) => (
              <article key={c.id} className="py-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <Link className="font-semibold text-brand hover:underline" href={`/app/campanhas/${c.id}`}>
                    {c.name}
                  </Link>
                  <div className="flex gap-2">
                    <Badge>{statuses[c.status]}</Badge>
                    {c.simulated && <Badge tone="demo">Simulação</Badge>}
                  </div>
                </div>
                <p className="mt-3 text-sm text-ink-soft">
                  {c.simulated
                    ? "Sem veiculação em Simulação."
                    : c.campaign_insights
                      ? `${formatCents(c.campaign_insights.spend_cents, c.currency)} investidos · ${numbers.format(c.campaign_insights.clicks)} cliques · ${numbers.format(c.campaign_insights.reach)} pessoas alcançadas`
                      : "Métricas ainda não sincronizadas."}
                </p>
                {c.execution_started_at && (
                  <Alert tone="warning" className="mt-3">
                    Esta campanha tem uma operação em andamento desde {date(c.execution_started_at)}. Se a operação não
                    terminar, fale com o suporte. Para interromper uma veiculação urgente, confira e pause na Meta.
                  </Alert>
                )}
              </article>
            ))}
          </div>
        ) : (
          <p className="mt-4 text-sm text-ink-soft">
            Nenhuma campanha disponível. Comece revisando e aprovando suas peças em Criativos.
          </p>
        )}
      </section>
    </div>
  );
}
