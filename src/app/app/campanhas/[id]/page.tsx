import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { CampaignDetailActions } from "@/components/campaigns/campaign-detail-actions";
import { CampaignMetaPanel } from "@/components/campaigns/campaign-meta-panel";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { TEMPLATE_LABELS, type AngleKey } from "@/contracts/creatives";
import { formatCents } from "@/lib/money";
import { loadCampaignDetail } from "@/server/campaigns-data";
import { getAppContext } from "@/server/context";

export const metadata: Metadata = { title: "Detalhe da Campanha" };

const STATUS_LABELS = {
  draft: "Publicação incompleta",
  paused: "Pausada",
  active: "Ativa",
  ended: "Encerrada",
} as const;

const REVIEW_LABELS = {
  not_submitted: "Não enviada",
  pending_review: "Em análise na Meta",
  approved: "Aprovada",
  rejected: "Rejeitada",
} as const;

export default async function CampaignDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ publicacao?: string }>;
}) {
  const { id } = await params;
  const { publicacao } = await searchParams;
  if (!z.uuid().safeParse(id).success) notFound();

  const ctx = await getAppContext();
  if (ctx.mode !== "supabase" || !ctx.organization) notFound();

  const campaign = await loadCampaignDetail(id);
  if (!campaign) notFound();

  const isOwner = ctx.organization.role === "owner";
  const canPause = isOwner || ctx.organization.role === "admin";
  const totalBudget = campaign.daily_budget_cents * campaign.duration_days;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <Link href="/app/campanhas" className="text-sm font-medium text-ink-soft hover:text-ink">
          ← Voltar para Campanhas
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="font-display text-3xl font-bold tracking-tight">{campaign.name}</h1>
          <Badge tone={campaign.status === "active" ? "success" : campaign.status === "paused" ? "warning" : "neutral"}>
            {STATUS_LABELS[campaign.status]}
          </Badge>
          <Badge>{REVIEW_LABELS[campaign.meta_review_status]}</Badge>
          {campaign.simulated && <Badge tone="demo">Simulação</Badge>}
        </div>
      </div>

      {/* KPIs reais / aviso honesto de métricas */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="p-4">
          <p className="text-xs font-semibold tracking-wider text-ink-soft uppercase">Orçamento diário</p>
          <p className="mt-1 font-display text-2xl font-bold">
            {formatCents(campaign.daily_budget_cents, campaign.currency)}
          </p>
          <p className="mt-1 text-xs text-ink-soft">Duração: {campaign.duration_days} dias</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-semibold tracking-wider text-ink-soft uppercase">Limite autorizado no período</p>
          <p className="mt-1 font-display text-2xl font-bold">{formatCents(totalBudget, campaign.currency)}</p>
          <p className="mt-1 text-xs text-ink-soft">Pago diretamente à Meta</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-semibold tracking-wider text-ink-soft uppercase">Revisão da Meta</p>
          <p className="mt-1 font-display text-lg font-bold">{REVIEW_LABELS[campaign.meta_review_status]}</p>
          <p className="mt-1 text-xs text-ink-soft">Anúncio enviado não é o mesmo que anúncio aprovado.</p>
        </Card>
      </div>

      <CampaignMetaPanel
        campaignId={campaign.id}
        status={campaign.status}
        simulated={campaign.simulated}
        isOwner={isOwner}
        currency={campaign.currency}
        insights={campaign.insights}
        justFailed={publicacao === "incompleta"}
      />

      <CampaignDetailActions
        campaignId={campaign.id}
        status={campaign.status}
        dailyBudgetCents={campaign.daily_budget_cents}
        durationDays={campaign.duration_days}
        currency={campaign.currency}
        simulated={campaign.simulated}
        isOwner={isOwner}
        canPause={canPause}
      />

      <Card className="p-5 sm:p-6">
        <h2 className="font-display text-lg font-bold">Peças vinculadas ({campaign.creatives.length})</h2>
        <ul className="mt-3 divide-y divide-line">
          {campaign.creatives.map((c) => (
            <li key={c.creative_id} className="flex items-center justify-between py-3 text-sm">
              <div>
                <span className="font-semibold">{TEMPLATE_LABELS[c.angle_key as AngleKey] ?? c.angle_key}</span>
                <span className="ml-2 text-ink-soft">— {c.headline}</span>
              </div>
              <Link
                href={`/app/criativos/${c.creative_id}`}
                className="text-xs font-semibold text-brand hover:underline"
              >
                Ver peça
              </Link>
            </li>
          ))}
        </ul>
      </Card>

      <Card className="p-5 sm:p-6">
        <h2 className="font-display text-lg font-bold">Histórico de operações auditadas</h2>
        <ul className="mt-3 divide-y divide-line text-sm">
          {campaign.operations.map((op) => (
            <li key={op.id} className="flex items-center justify-between py-2.5">
              <span>
                {op.operation === "publish_paused"
                  ? "Campanha criada inicialmente PAUSADA"
                  : op.operation === "activate"
                    ? "Ativação autorizada pelo proprietário"
                    : "Campanha pausada"}
              </span>
              <div className="flex items-center gap-2">
                {op.simulated && <Badge tone="demo">Simulação</Badge>}
                <span className="text-xs text-ink-faint">{new Date(op.created_at).toLocaleString("pt-BR")}</span>
              </div>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
