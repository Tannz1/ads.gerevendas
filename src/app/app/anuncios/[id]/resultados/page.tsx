import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";
import { z } from "zod";
import { ProductThumb, StatusPill, WhatsAppIcon } from "@/components/simple/product-card";
import { CampaignControls, SalesBox } from "@/components/simple/results-actions";
import { ScreenHeader, SimpleShell, SimulationTag } from "@/components/simple/shell";
import { formatCents } from "@/lib/money";
import { getAppContext } from "@/server/context";
import { loadProductFlow, loadSales, type SalesSummary } from "@/server/products-data";

export const metadata: Metadata = { title: "Resultados do anúncio" };

const numbers = new Intl.NumberFormat("pt-BR");

export default async function ProductResultsPage({ params }: PageProps<"/app/anuncios/[id]/resultados">) {
  const { id } = await params;
  const ctx = await getAppContext();
  if (ctx.mode !== "supabase" || !ctx.organization || !z.uuid().safeParse(id).success) notFound();

  const flow = await loadProductFlow(ctx.organization.id, id);
  if (!flow) notFound();
  const c = flow.campaign;
  if (!c) redirect(`/app/anuncios/${id}`);

  let sales: SalesSummary = { quantity: 0, amount_cents: 0, records: [] };
  let salesFailed = false;
  try {
    sales = await loadSales(c.id);
  } catch {
    salesFailed = true;
  }

  const role = ctx.organization.role;
  const thumb = flow.creatives.creatives.find((x) => x.angle_key === "oferta") ?? flow.creatives.creatives[0];
  const m = c.insights;
  const money = (v: number) => formatCents(v, c.currency);
  const perConversation = m && m.conversations > 0 ? money(Math.round(m.spend_cents / m.conversations)) : "—";

  return (
    <SimpleShell>
      <ScreenHeader title="Seu anúncio em números" back="/app" aside={c.simulated ? <SimulationTag /> : undefined} />

      <div className="flex items-center gap-4">
        <ProductThumb url={thumb?.image_url ?? flow.photo_url} name={flow.name} className="size-16" />
        <p className="min-w-0 flex-1 truncate font-display text-lg font-bold">{flow.name}</p>
        <StatusPill status={c.status} />
      </div>

      <dl className="mt-5 grid grid-cols-3 gap-3">
        <Tile icon={<CoinsIcon />} label="Investido" value={m ? money(m.spend_cents) : "—"} />
        <Tile
          icon={<WhatsAppIcon className="size-6 text-brand" />}
          label="Conversas"
          value={m ? numbers.format(m.conversations) : "—"}
        />
        <Tile icon={<TagIcon />} label="Por conversa" value={perConversation} />
      </dl>
      <p className="mt-2 text-xs text-ink-faint">
        {c.simulated
          ? "Simulação: o anúncio não roda na Meta, então não há gasto nem conversas."
          : m
            ? `Dados da Meta de ${new Date(m.fetched_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" })}.`
            : "Os números aparecem quando a Meta enviar os primeiros dados."}
        {m && m.conversations === 0 && m.clicks > 0 && ` A Meta contou ${numbers.format(m.clicks)} cliques no anúncio.`}
      </p>

      {c.status === "active" && (
        <div className="mt-5 flex items-center gap-3 rounded-2xl bg-brand-soft px-4 py-3">
          <SparkIcon />
          <p className="text-[15px] font-semibold text-ink">
            Estamos testando {flow.creatives.creatives.length} versões do anúncio
          </p>
        </div>
      )}

      {c.status === "draft" && (
        <p className="mt-5 rounded-2xl bg-warning-soft px-4 py-3 text-sm text-warning">
          A publicação parou no meio.{" "}
          <Link href={`/app/campanhas/${c.id}`} className="font-semibold underline">
            Ver e retomar
          </Link>
        </p>
      )}

      {salesFailed ? (
        <p role="alert" className="mt-6 rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">
          Não foi possível carregar as vendas registradas. Recarregue a página.
        </p>
      ) : (
        <SalesBox campaignId={c.id} sales={sales} />
      )}

      <CampaignControls
        campaignId={c.id}
        status={c.status}
        dailyBudgetCents={c.daily_budget_cents}
        durationDays={c.duration_days}
        currency={c.currency}
        simulated={c.simulated}
        canPause={role === "owner" || role === "admin"}
        canActivate={role === "owner"}
        awaitingPayment={!c.simulated && flow.meta.shared_account}
      />

      <p className="mt-8 text-center text-sm">
        <Link href={`/app/campanhas/${c.id}`} className="font-semibold text-ink-soft underline">
          Ver detalhes da campanha
        </Link>
      </p>
    </SimpleShell>
  );
}

function Tile({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-line px-2 py-4 text-center">
      <span className="text-ink-soft">{icon}</span>
      <dd className="mt-2 font-display text-xl font-bold tracking-tight">{value}</dd>
      <dt className="text-xs text-ink-soft">{label}</dt>
    </div>
  );
}

function CoinsIcon() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="1.8">
      <ellipse cx="12" cy="6" rx="7" ry="2.5" />
      <path d="M5 6v4c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5V6M5 10v4c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5v-4" />
    </svg>
  );
}

function TagIcon() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path
        d="M20.6 13.4l-7.2 7.2a2 2 0 01-2.8 0L3 13V3h10l7.6 7.6a2 2 0 010 2.8zM7.5 7.5h.01"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SparkIcon() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="size-7 shrink-0 text-brand" fill="currentColor">
      <path d="M10 2l1.8 5.4L17 9l-5.2 1.6L10 16l-1.8-5.4L3 9l5.2-1.6zM18 13l.9 2.6 2.6.9-2.6.9L18 20l-.9-2.6-2.6-.9 2.6-.9z" />
    </svg>
  );
}
