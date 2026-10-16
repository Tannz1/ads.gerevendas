import Link from "next/link";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Strategy } from "@/contracts/strategy";
import type { DesignFacts } from "@/lib/creative/defaults";
import { ConceptGallery, type CreatePiece, type GalleryConcept } from "./concept-gallery";
import { formatDateTime } from "./messages";
import { PageHeader, SimulationNotice, SparkIcon } from "./page-states";
import { StrategyOverview } from "./strategy-overview";

/** Tela com a estratégia pronta (mesma apresentação no modo Supabase e na demonstração). */
export function StrategyReady({
  strategy,
  version,
  createdAt,
  isSimulation,
  simulationText,
  concepts,
  facts,
  onCreate,
  onRegenerate,
  regenerating,
  regenerateDisabled,
  status,
  notices,
}: {
  strategy: Strategy;
  version: number;
  createdAt: string;
  isSimulation: boolean;
  simulationText?: string;
  concepts: GalleryConcept[];
  facts: DesignFacts;
  onCreate: CreatePiece;
  onRegenerate: () => void;
  regenerating: boolean;
  regenerateDisabled?: boolean;
  status?: ReactNode;
  notices?: ReactNode;
}) {
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Estratégia"
        badges={isSimulation && <Badge tone="demo">Simulação</Badge>}
        description={
          <p className="text-sm">
            Versão {version} · gerada em {formatDateTime(createdAt)}
          </p>
        }
        actions={
          <div className="flex flex-col items-start gap-1.5 sm:items-end">
            <Button
              variant="secondary"
              onClick={onRegenerate}
              disabled={regenerating || regenerateDisabled}
              aria-busy={regenerating}
            >
              <SparkIcon className="size-4.5" />
              {regenerating ? "Gerando…" : "Gerar nova versão"}
            </Button>
            <p className="text-xs text-ink-faint">As peças já criadas continuam salvas.</p>
          </div>
        }
      />
      {isSimulation && <SimulationNotice className="mt-5">{simulationText}</SimulationNotice>}
      {notices}
      {status && <div className="mt-5">{status}</div>}

      <div className="mt-6">
        <StrategyOverview strategy={strategy} />
      </div>

      <div className="mt-12">
        <ConceptGallery concepts={concepts} facts={facts} onCreate={onCreate} />
      </div>

      <div className="mt-10 flex flex-col gap-3 rounded-2xl border border-line bg-surface px-5 py-4 text-sm text-ink-soft sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p>
          Depois de criar, ajuste e aprove as peças. Aprovar não publica nada: a publicação na Meta chega numa próxima
          fase.
        </p>
        <Link href="/app/criativos" className="shrink-0 font-semibold text-brand underline-offset-2 hover:underline">
          Ver peças criadas
        </Link>
      </div>
    </div>
  );
}
