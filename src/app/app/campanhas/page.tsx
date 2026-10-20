import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { formatCents } from "@/lib/money";
import { loadCampaignsList, loadMetaConnection } from "@/server/campaigns-data";
import { getAppContext } from "@/server/context";
import { loadCreativesOverview } from "@/server/creatives-data";

export const metadata: Metadata = { title: "Campanhas" };

const STATUS_LABELS = {
  draft: "Rascunho",
  paused: "Pausada",
  active: "Ativa",
  ended: "Encerrada",
} as const;

export default async function CampaignsPage() {
  const ctx = await getAppContext();

  if (ctx.mode === "demo" || !ctx.organization) {
    return (
      <div className="mx-auto max-w-4xl">
        <div className="flex items-center gap-3">
          <h1 className="font-display text-3xl font-bold tracking-tight">Campanhas</h1>
          <Badge tone="demo">Demonstração</Badge>
        </div>
        <Card className="mt-8 p-6">
          <p className="text-[15px] text-ink-soft">
            A criação e o acompanhamento de campanhas estão disponíveis no piloto com conta conectada.
          </p>
        </Card>
      </div>
    );
  }

  const [campaigns, metaConn, overview] = await Promise.all([
    loadCampaignsList(ctx.organization.id),
    loadMetaConnection(ctx.organization.id),
    loadCreativesOverview(ctx.organization.id),
  ]);

  const approvedCount =
    overview.state === "ready" ? overview.creatives.filter((c) => c.status === "approved").length : 0;
  const metaConnected = metaConn?.status === "connected";

  return (
    <div className="mx-auto max-w-4xl">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight">Campanhas</h1>
          <p className="mt-1 text-[15px] text-ink-soft">
            Toda campanha é criada inicialmente PAUSADA e só entra no ar após confirmação explícita do proprietário.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/app/conexoes"
            className="inline-flex h-10 items-center rounded-xl border border-line-strong bg-surface px-4 text-sm font-semibold text-ink hover:bg-surface-muted"
          >
            {metaConnected ? "Ativos Meta conectados" : "Conectar Meta"}
          </Link>
          <Link
            href="/app/campanhas/nova"
            className="inline-flex h-10 items-center rounded-xl bg-brand px-4 text-sm font-semibold text-white hover:bg-brand-strong"
          >
            Nova campanha
          </Link>
        </div>
      </div>

      {!metaConnected && (
        <Card className="mt-6 border-accent/40 bg-accent-soft/40 p-5">
          <p className="text-sm font-semibold text-ink">1º passo: conecte seus ativos da Meta</p>
          <p className="mt-1 text-sm text-ink-soft">
            Vincule a conta de anúncios e a Página do Facebook em{" "}
            <Link href="/app/conexoes" className="font-semibold text-brand underline">
              Conexões Meta
            </Link>
            .
          </p>
        </Card>
      )}

      {approvedCount === 0 && (
        <Card className="mt-6 p-5">
          <p className="text-sm font-semibold text-ink">Aprove pelo menos 1 peça antes de publicar</p>
          <p className="mt-1 text-sm text-ink-soft">
            Vá em{" "}
            <Link href="/app/criativos" className="font-semibold text-brand underline">
              Criativos
            </Link>{" "}
            para revisar e aprovar os anúncios gerados.
          </p>
        </Card>
      )}

      {campaigns.length === 0 ? (
        <Card className="mt-8 p-8 text-center">
          <h2 className="font-display text-lg font-bold">Nenhuma campanha criada ainda</h2>
          <p className="mt-2 text-sm text-ink-soft">
            Quando suas peças estiverem aprovadas e a conta Meta conectada, crie sua primeira campanha pausada.
          </p>
        </Card>
      ) : (
        <div className="mt-8 space-y-4">
          {campaigns.map((c) => (
            <Card key={c.id} className="flex flex-wrap items-center justify-between gap-4 p-5">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={`/app/campanhas/${c.id}`} className="font-display text-lg font-bold hover:text-brand">
                    {c.name}
                  </Link>
                  <Badge tone={c.status === "active" ? "success" : c.status === "paused" ? "warning" : "neutral"}>
                    {STATUS_LABELS[c.status]}
                  </Badge>
                  {c.simulated && <Badge tone="demo">Simulação</Badge>}
                </div>
                <p className="mt-1 text-sm text-ink-soft">
                  Orçamento: <strong>{formatCents(c.daily_budget_cents, c.currency)}/dia</strong> por{" "}
                  <strong>{c.duration_days} dias</strong> · Total autorizado:{" "}
                  <strong>{formatCents(c.daily_budget_cents * c.duration_days, c.currency)}</strong>
                </p>
              </div>
              <Link
                href={`/app/campanhas/${c.id}`}
                className="inline-flex h-9 items-center rounded-lg border border-line-strong px-3.5 text-sm font-semibold hover:bg-surface-muted"
              >
                Ver detalhes →
              </Link>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
