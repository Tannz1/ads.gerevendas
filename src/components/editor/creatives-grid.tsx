"use client";

import Link from "next/link";
import { EmptyState, ImagesIcon, PageHeader, SimulationNotice } from "@/components/strategy/page-states";
import { formatDateTime } from "@/components/strategy/messages";
import { FormatGlyph } from "@/components/strategy/strategy-overview";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { FORMAT_SPECS, type CreativeDesign } from "@/contracts/creative";
import { FittedCanvas } from "./fitted-canvas";

export type CreativeListItem = {
  id: string;
  design: CreativeDesign;
  status: "draft" | "approved";
  updated_at: string;
};

export function StatusBadge({ status }: { status: CreativeListItem["status"] }) {
  return status === "approved" ? <Badge tone="success">Aprovada</Badge> : <Badge>Rascunho</Badge>;
}

/** Lista de peças (mesma apresentação no modo Supabase e na demonstração). */
export function CreativesScreen({
  items,
  simulation,
  limitReached,
}: {
  items: CreativeListItem[];
  simulation?: boolean;
  limitReached?: boolean;
}) {
  const approved = items.filter((i) => i.status === "approved").length;
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Criativos"
        badges={simulation && <Badge tone="demo">Simulação</Badge>}
        description={
          items.length > 0 ? (
            <p>
              {items.length === 1 ? "1 peça" : `${items.length} peças`} · {approved}{" "}
              {approved === 1 ? "aprovada" : "aprovadas"}. Aprovar não publica nada.
            </p>
          ) : (
            "Suas peças editáveis para o feed e os stories."
          )
        }
        actions={
          items.length > 0 && (
            <ButtonLink href="/app/estrategia" variant="secondary">
              Criar a partir da estratégia
            </ButtonLink>
          )
        }
      />
      {simulation && (
        <SimulationNotice className="mt-5">
          Peças de demonstração, feitas a partir de uma estratégia de exemplo. Ficam só neste navegador.
        </SimulationNotice>
      )}

      {items.length === 0 ? (
        <EmptyState
          className="mt-8"
          icon={<ImagesIcon className="size-7" />}
          title="Nenhuma peça ainda"
          action={{ href: "/app/estrategia", label: "Ir para a estratégia" }}
        >
          Gere a estratégia e escolha um conceito para criar sua primeira peça no formato do feed ou dos stories.
        </EmptyState>
      ) : (
        <div className="@container mt-8">
          <ul className="grid grid-cols-2 gap-4 @2xl:grid-cols-3 @2xl:gap-5 @5xl:grid-cols-4">
            {items.map((item) => (
              <li key={item.id} className="flex">
                <CreativeCard item={item} />
              </li>
            ))}
          </ul>
          {limitReached && (
            <p className="mt-6 text-sm text-ink-faint">Mostrando as 50 peças alteradas mais recentemente.</p>
          )}
        </div>
      )}

      <p className="mt-10 text-sm text-ink-faint">
        A publicação na Meta chega numa próxima fase. Por enquanto, baixe o PNG das peças aprovadas.
      </p>
    </div>
  );
}

function CreativeCard({ item }: { item: CreativeListItem }) {
  const brand = /^#[0-9A-Fa-f]{6}$/.test(item.design.brand_color) ? item.design.brand_color : "#2A45E8";
  return (
    <Link href={`/app/criativos/${item.id}`} className="group flex w-full rounded-2xl focus-visible:outline-offset-4">
      <Card className="flex w-full flex-col overflow-hidden transition-shadow group-hover:shadow-[var(--shadow-lift)]">
        <div
          aria-hidden
          className="px-3 py-4 sm:px-5 sm:py-5"
          style={{
            background: `linear-gradient(165deg, color-mix(in srgb, ${brand} 14%, var(--canvas)) 0%, var(--surface-muted) 100%)`,
          }}
        >
          <FittedCanvas
            design={item.design}
            maxWidth={240}
            boxAspect={1.25}
            canvasClassName="rounded-md shadow-[0_12px_28px_-14px_rgb(16_24_40/0.45)] ring-1 ring-black/5"
          />
        </div>
        <div className="flex flex-1 flex-col gap-2 p-3.5 sm:p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-soft">
              <FormatGlyph format={item.design.format} />
              {FORMAT_SPECS[item.design.format].label}
            </span>
            <StatusBadge status={item.status} />
          </div>
          <p className="line-clamp-2 text-[15px] leading-snug font-semibold break-words text-ink group-hover:text-brand-strong">
            {item.design.headline}
          </p>
          <p className="mt-auto text-xs text-ink-faint">Atualizada em {formatDateTime(item.updated_at)}</p>
        </div>
      </Card>
    </Link>
  );
}

export function CreativesSkeleton() {
  return (
    <div aria-busy className="mx-auto max-w-6xl">
      <Skeleton className="h-9 w-48" />
      <Skeleton className="mt-3 h-5 w-72 max-w-full" />
      <div className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-80 rounded-2xl" />
        ))}
      </div>
    </div>
  );
}
