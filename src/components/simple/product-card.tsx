import Link from "next/link";
import type { CampaignStatus } from "@/contracts/campaigns";
import { cn } from "@/lib/cn";
import type { ProductSummary } from "@/server/products-data";

/** Foto do produto em miniatura; sem foto, um quadro neutro com a inicial. */
export function ProductThumb({ url, name, className }: { url: string | null; name: string; className?: string }) {
  return (
    <div className={cn("shrink-0 overflow-hidden rounded-xl bg-surface-muted", className)}>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element -- URL assinada temporária do Storage privado
        <img src={url} alt="" className="size-full object-cover" />
      ) : (
        <span className="grid size-full place-items-center font-display text-xl font-bold text-ink-faint">
          {name.slice(0, 1).toUpperCase()}
        </span>
      )}
    </div>
  );
}

const STATUS: Record<CampaignStatus, { label: string; tone: string }> = {
  active: { label: "Ativo", tone: "bg-brand-soft text-brand-strong" },
  paused: { label: "Pausado", tone: "bg-surface-muted text-ink-soft" },
  draft: { label: "Publicação incompleta", tone: "bg-warning-soft text-warning" },
  ended: { label: "Encerrado", tone: "bg-surface-muted text-ink-soft" },
};

export function StatusPill({ status }: { status: CampaignStatus | "rascunho" }) {
  const s = status === "rascunho" ? { label: "Rascunho", tone: "bg-surface-muted text-ink-soft" } : STATUS[status];
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold", s.tone)}>
      {status === "active" && <span aria-hidden className="size-1.5 rounded-full bg-brand" />}
      {s.label}
    </span>
  );
}

/** Para onde o cartão leva: resultados se já tem campanha, senão continua de onde parou. */
export function productHref(p: Pick<ProductSummary, "brief_id" | "campaign">) {
  return p.campaign ? `/app/anuncios/${p.brief_id}/resultados` : `/app/anuncios/${p.brief_id}`;
}

export function ProductCard({ product }: { product: ProductSummary }) {
  const c = product.campaign;
  const conversations = c?.insights?.conversations ?? null;
  return (
    <Link
      href={productHref(product)}
      className="flex items-center gap-4 rounded-2xl border border-line bg-white p-3 shadow-[var(--shadow-card)] transition-colors hover:border-line-strong"
    >
      <ProductThumb url={product.photo_url} name={product.name} className="size-20" />
      <div className="min-w-0 flex-1">
        <p className="truncate font-display text-lg font-bold">{product.name}</p>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-ink-soft">
          <StatusPill status={c?.status ?? "rascunho"} />
          {c?.simulated && <span className="text-xs font-semibold text-warning">Simulação</span>}
          {conversations !== null && (
            <span className="inline-flex items-center gap-1">
              <WhatsAppIcon className="size-4 text-brand" />
              {conversations} {conversations === 1 ? "conversa" : "conversas"}
            </span>
          )}
        </div>
      </div>
      <svg aria-hidden viewBox="0 0 24 24" className="size-5 shrink-0 text-ink-faint" fill="none" stroke="currentColor">
        <path d="M9 6l6 6-6 6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </Link>
  );
}

export function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className={className} fill="currentColor">
      <path d="M12 2a10 10 0 00-8.6 15.1L2 22l5-1.3A10 10 0 1012 2zm0 18.2a8.2 8.2 0 01-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1112 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 01-3.3-2.9c-.3-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 00-.7.3 3 3 0 00-.9 2.2 5.2 5.2 0 001.1 2.7 11.8 11.8 0 004.5 4c1.7.7 2.4.8 3.2.6.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.1-.3-.2-.5-.3z" />
    </svg>
  );
}
