import Link from "next/link";
import { AdPreview } from "@/components/creatives/ad-preview";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { CampaignStatus, MetaReviewStatus } from "@/contracts/campaigns";
import type { summarizeMetrics } from "@/lib/campaign-metrics";
import { cn } from "@/lib/cn";
import { formatCents } from "@/lib/money";
import type { DashboardCampaign } from "@/server/dashboard-data";

const compact = new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 });
const numbers = new Intl.NumberFormat("pt-BR");
export const dashboardDate = (value: string) =>
  new Date(value).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });
const date = dashboardDate;

const STATUS: Record<CampaignStatus, { label: string; dot: string }> = {
  active: { label: "Rodando", dot: "bg-success" },
  paused: { label: "Pausada", dot: "bg-ink-faint" },
  draft: { label: "Publicação incompleta", dot: "bg-warning" },
  ended: { label: "Encerrada", dot: "bg-ink-faint" },
};
const REVIEW: Partial<Record<MetaReviewStatus, string>> = {
  pending_review: "Em revisão na Meta",
  approved: "Aprovada pela Meta",
  rejected: "Recusada pela Meta",
};

/** Sem métricas da Meta ainda: o que é verdade hoje (contagens e verba confirmada), nunca números inventados. */
export function StatusSummary({ campaigns }: { campaigns: DashboardCampaign[] }) {
  const active = campaigns.filter((c) => c.status === "active");
  const paused = campaigns.filter((c) => c.status === "paused").length;
  const daily = active.reduce((sum, c) => sum + c.daily_budget_cents, 0);
  const onlySimulated = campaigns.every((c) => c.simulated);
  const figures: Array<[string, string]> = [
    ["Rodando", numbers.format(active.length)],
    ["Pausadas", numbers.format(paused)],
    ["Verba/dia rodando", formatCents(daily, "BRL")],
  ];
  return (
    <Card className="overflow-hidden">
      <dl className="grid grid-cols-3 divide-x divide-line">
        {figures.map(([label, value]) => (
          <div key={label} className="px-4 py-4 sm:px-6 sm:py-5">
            <dt className="text-xs text-ink-soft sm:text-sm">{label}</dt>
            <dd className="mt-1 text-xl font-semibold tracking-tight sm:text-3xl">{value}</dd>
          </div>
        ))}
      </dl>
      <div className="flex flex-wrap items-center gap-2 border-t border-line bg-surface-muted/50 px-6 py-3 text-sm text-ink-soft">
        {onlySimulated && <Badge tone="demo">Simulação</Badge>}
        {onlySimulated
          ? "Campanhas em Simulação não rodam na Meta, então não geram cliques nem gasto."
          : "Investimento, cliques e conversas aparecem aqui quando a Meta enviar os primeiros dados."}
      </div>
    </Card>
  );
}

export function MetricsSummary({
  totals,
  updatedAt,
}: {
  totals: NonNullable<ReturnType<typeof summarizeMetrics>>;
  updatedAt: string;
}) {
  const tiles: Array<[string, string]> = [
    ["Exibições", compact.format(totals.impressions)],
    ["Cliques", compact.format(totals.clicks)],
    ["Conversas", compact.format(totals.conversations)],
    ["Custo por clique", totals.cpc_cents != null ? formatCents(totals.cpc_cents, "BRL") : "—"],
  ];
  return (
    <section aria-label="Resumo" className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
      <div className="flex flex-col justify-between rounded-2xl bg-ink p-6 text-white shadow-[var(--shadow-card)]">
        <p className="text-sm text-white/70">Investido</p>
        <p className="mt-3 text-5xl font-semibold tracking-tight">{formatCents(totals.spend_cents, "BRL")}</p>
        <p className="mt-4 text-sm text-white/60">Atualizado em {date(updatedAt)}</p>
      </div>
      <dl className="grid grid-cols-2 gap-4">
        {tiles.map(([label, value]) => (
          <Card key={label} className="p-5">
            <dt className="text-sm text-ink-soft">{label}</dt>
            <dd className="mt-2 text-2xl font-semibold">{value}</dd>
          </Card>
        ))}
      </dl>
    </section>
  );
}

export function CampaignCard({ campaign: c }: { campaign: DashboardCampaign }) {
  const m = c.simulated ? null : c.campaign_insights;
  const status = STATUS[c.status];
  const review = c.simulated ? null : REVIEW[c.meta_review_status];
  return (
    <Card className="flex h-full gap-4 p-4 sm:gap-5 sm:p-5">
      <div className="shrink-0">
        {c.creative ? (
          <AdPreview
            width={104}
            label={`Anúncio: ${c.creative.content.headline}`}
            content={c.creative.content}
            format="feed"
            businessName={c.creative.business_name}
            priceLabel={
              c.creative.price_cents === null ? null : formatCents(c.creative.price_cents, c.creative.currency)
            }
            imageSrc={c.creative.image_url}
          />
        ) : (
          <div aria-hidden className="h-[130px] w-[104px] rounded-xl bg-surface-muted" />
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-sm font-semibold">
            <span aria-hidden className={cn("size-2 rounded-full", status.dot)} />
            {status.label}
          </span>
          {c.simulated && <Badge tone="demo">Simulação</Badge>}
        </div>
        <Link
          href={`/app/campanhas/${c.id}`}
          className="mt-1.5 line-clamp-2 font-display text-[17px] leading-snug font-bold text-ink hover:text-brand"
        >
          {c.creative?.content.headline ?? c.name}
        </Link>
        <p className="mt-1 text-sm text-ink-soft">
          {formatCents(c.daily_budget_cents, c.currency)} por dia · {c.duration_days}{" "}
          {c.duration_days === 1 ? "dia" : "dias"}
          {review && ` · ${review}`}
        </p>
        <div className="mt-auto pt-3">
          {m ? (
            <dl className="flex flex-wrap gap-x-6 gap-y-2 border-t border-line pt-3 text-sm">
              <div>
                <dt className="text-ink-faint">Investido</dt>
                <dd className="font-semibold">{formatCents(m.spend_cents, c.currency)}</dd>
              </div>
              <div>
                <dt className="text-ink-faint">Cliques</dt>
                <dd className="font-semibold">{numbers.format(m.clicks)}</dd>
              </div>
              <div>
                <dt className="text-ink-faint">Conversas</dt>
                <dd className="font-semibold">{numbers.format(m.conversations)}</dd>
              </div>
            </dl>
          ) : (
            <p className="border-t border-line pt-3 text-sm text-ink-faint">
              {c.simulated
                ? "Simulação: não roda na Meta."
                : c.status === "active"
                  ? "Aguardando os primeiros dados da Meta."
                  : "Os resultados aparecem quando a campanha rodar."}
            </p>
          )}
          {c.execution_started_at && (
            <p className="mt-2 text-xs text-warning">
              Operação em andamento desde {date(c.execution_started_at)}. Se não terminar, fale com o suporte.
            </p>
          )}
        </div>
      </div>
    </Card>
  );
}
