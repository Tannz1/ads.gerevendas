"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  createDemoCreative,
  designFactsFrom,
  readDemoStrategy,
  saveDemoStrategy,
  type DemoStrategy,
} from "@/components/demo/demo-store";
import { readDemoDraft, type DemoDraft } from "@/components/onboarding/demo-storage";
import { hydrateForm, toPayload } from "@/components/onboarding/form-state";
import { Button } from "@/components/ui/button";
import { designFromConcept } from "@/lib/creative/defaults";
import { generateStrategyDemo } from "@/server/generation";
import type { CreatePiece } from "./concept-gallery";
import { GenerateHero } from "./generate-hero";
import { GenerationPanel } from "./generation-panel";
import { EmptyState, GallerySkeleton, PageHeader, SimulationNotice } from "./page-states";
import { StrategyReady } from "./strategy-ready";
import { OFFLINE_ERROR, type ErrorInfo } from "./use-strategy-generation";

const DEMO_SIMULATION_TEXT =
  "Conteúdo de exemplo gerado sem IA real, só com as informações do cadastro de demonstração. Fica apenas neste navegador.";

type Loaded = { draft: DemoDraft | null; strategy: DemoStrategy | null };

/** Estratégia no modo demonstração: sempre Simulação, guardada só no navegador. */
export function DemoStrategyPage() {
  const router = useRouter();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<ErrorInfo | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- leitura única de localStorage após a hidratação
    setLoaded({ draft: readDemoDraft(), strategy: readDemoStrategy() });
  }, []);

  const strategy = loaded?.strategy ?? null;
  const facts = useMemo(() => (strategy ? designFactsFrom(strategy.facts) : null), [strategy]);

  if (!loaded) return <GallerySkeleton />;

  if (!loaded.draft?.completed) {
    return (
      <div className="mx-auto max-w-6xl">
        <PageHeader title="Estratégia" />
        <EmptyState
          className="mt-8"
          title="Primeiro, conte sobre o seu negócio"
          action={{ href: "/app/onboarding", label: loaded.draft ? "Continuar cadastro" : "Começar cadastro" }}
        >
          A estratégia é montada só com as informações que você confirmar no cadastro. Conclua as seis etapas para gerar
          a sua.
        </EmptyState>
      </div>
    );
  }

  const draft = loaded.draft;

  async function generate() {
    setGenerating(true);
    setError(null);
    try {
      const res = await generateStrategyDemo(toPayload(hydrateForm(draft.data)));
      if (!res.ok) {
        setError(res.error);
        return;
      }
      const saved = saveDemoStrategy(res.data.generated, res.data.facts);
      if (!saved) {
        setError({
          code: "internal",
          message: "Não foi possível guardar a simulação neste navegador (armazenamento cheio ou bloqueado).",
          correlation_id: res.correlation_id,
        });
        return;
      }
      setLoaded((l) => (l ? { ...l, strategy: saved } : l));
    } catch {
      setError(OFFLINE_ERROR);
    } finally {
      setGenerating(false);
    }
  }

  const status = generating ? (
    <GenerationPanel
      tone="progress"
      title="Criando sua estratégia (simulação)…"
      text="Montando a estratégia de exemplo a partir do seu cadastro."
      step={1}
    />
  ) : error ? (
    <GenerationPanel
      tone="error"
      title={error.code === "validation_failed" ? "Revise o cadastro" : "Não foi possível gerar a simulação"}
      text={
        <>
          {error.message}
          {error.code === "validation_failed" && (
            <>
              {" "}
              <Link href="/app/onboarding" className="font-semibold text-brand underline-offset-2 hover:underline">
                Ir para o cadastro
              </Link>
            </>
          )}
        </>
      }
      correlationId={error.correlation_id}
      actions={
        error.code === "validation_failed" ? undefined : (
          <Button size="sm" onClick={generate}>
            Tentar de novo
          </Button>
        )
      }
    />
  ) : null;

  if (!strategy || !facts) {
    return (
      <div className="mx-auto max-w-6xl">
        <PageHeader
          title="Estratégia"
          description="O segundo passo: a estratégia e os conceitos de anúncio do seu negócio."
        />
        <SimulationNotice className="mt-5">
          Na demonstração não há IA real: a estratégia sai como Simulação, um conteúdo de exemplo montado só com o seu
          cadastro, e fica apenas neste navegador.
        </SimulationNotice>
        <div className="mt-8">
          <GenerateHero
            buttonLabel="Gerar estratégia (simulação)"
            busy={generating}
            onGenerate={generate}
            simulation
            note="Na demonstração nada é enviado a serviços de IA nem salvo em servidores."
          >
            {status}
          </GenerateHero>
        </div>
      </div>
    );
  }

  const create: CreatePiece = async (key, format) => {
    const index = Number(key);
    const concept = strategy.generated.concepts[index];
    if (!concept) return { message: "Conceito não encontrado. Gere a estratégia de novo." };
    const created = createDemoCreative({
      concept_index: index,
      design: designFromConcept(concept, facts, format),
    });
    if (!created)
      return { message: "Não foi possível guardar a peça neste navegador (armazenamento cheio ou bloqueado)." };
    router.push(`/app/criativos/${created.id}`);
    return null;
  };

  return (
    <StrategyReady
      strategy={strategy.generated.strategy}
      version={strategy.version}
      createdAt={strategy.created_at}
      isSimulation
      simulationText={DEMO_SIMULATION_TEXT}
      concepts={strategy.generated.concepts.map((concept, i) => ({ key: String(i), concept }))}
      facts={facts}
      onCreate={create}
      onRegenerate={generate}
      regenerating={generating}
      status={status}
    />
  );
}
