"use client";

import { useEffect, useMemo, useState } from "react";
import {
  approveDemoCreative,
  demoOfferFrom,
  readDemoCreative,
  readDemoStrategy,
  saveDemoCreative,
  type DemoCreative,
  type DemoWriteResult,
} from "@/components/demo/demo-store";
import { EmptyState, ImagesIcon } from "@/components/strategy/page-states";
import { Skeleton } from "@/components/ui/skeleton";
import type { BriefFacts } from "@/contracts/strategy";
import { CreativeEditor, type BackendError, type EditorBackend } from "./creative-editor";
import { ctaOptionsFor } from "./cta";

const WRITE_ERRORS: Record<Exclude<DemoWriteResult, { ok: true }>["reason"], BackendError> = {
  conflict: {
    code: "conflict",
    message: "Esta peça foi alterada em outra aba ou dispositivo.",
  },
  not_found: { code: "not_found", message: "Esta peça não existe mais neste navegador." },
  invalid: { code: "validation_failed", message: "Revise os campos destacados." },
  storage: {
    code: "internal",
    message: "Não foi possível salvar neste navegador (armazenamento cheio ou bloqueado).",
  },
};

type Loaded = { creative: DemoCreative | null; facts: BriefFacts | null };

/** Editor no modo demonstração: a peça fica só neste navegador (sempre Simulação). */
export function DemoCreativeEditorPage({ id }: { id: string }) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [reloads, setReloads] = useState(0);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- leitura de localStorage após a hidratação
    setLoaded({ creative: readDemoCreative(id), facts: readDemoStrategy()?.facts ?? null });
  }, [id, reloads]);

  const backend = useMemo<EditorBackend>(
    () => ({
      async save(design, version) {
        const res = saveDemoCreative(id, version, design);
        return res.ok
          ? { ok: true, data: { version: res.creative.version } }
          : { ok: false, error: WRITE_ERRORS[res.reason] };
      },
      async approve(version) {
        const res = approveDemoCreative(id, version);
        return res.ok
          ? { ok: true, data: { approved_at: res.creative.approved_at ?? new Date().toISOString() } }
          : { ok: false, error: WRITE_ERRORS[res.reason] };
      },
      reload: () => setReloads((n) => n + 1),
    }),
    [id],
  );

  if (!loaded) return <EditorSkeleton />;
  const { creative, facts } = loaded;
  if (!creative) {
    return (
      <EmptyState
        icon={<ImagesIcon className="size-7" />}
        title="Peça não encontrada"
        action={{ href: "/app/criativos", label: "Ver criativos" }}
      >
        Esta peça não existe neste navegador. Na demonstração, as peças ficam só no navegador em que foram criadas.
      </EmptyState>
    );
  }

  return (
    <CreativeEditor
      key={`${creative.id}:${creative.version}:${reloads}`}
      creative={creative}
      offer={demoOfferFrom(facts)}
      ctaOptions={ctaOptionsFor(facts?.objective ?? null, creative.design.cta)}
      backend={backend}
      simulation
    />
  );
}

export function EditorSkeleton() {
  return (
    <div aria-busy className="mx-auto max-w-6xl">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="mt-3 h-9 w-64" />
      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_440px]">
        <Skeleton className="h-[720px] rounded-2xl lg:order-2" />
        <Skeleton className="h-[720px] rounded-2xl lg:order-1" />
      </div>
    </div>
  );
}
