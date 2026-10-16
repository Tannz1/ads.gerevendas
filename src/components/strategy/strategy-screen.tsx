"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { DAILY_GENERATION_LIMIT, type GenerationJob, type StrategyView } from "@/contracts/strategy";
import type { DesignFacts } from "@/lib/creative/defaults";
import { createCreativeFromConcept } from "@/server/creatives";
import type { CreatePiece } from "./concept-gallery";
import { GenerateHero } from "./generate-hero";
import { GenerationPanel } from "./generation-panel";
import { JOB_ERROR_MESSAGES, REQUEST_ERROR_TITLES } from "./messages";
import { PageHeader, SimulationNotice } from "./page-states";
import { StrategyReady } from "./strategy-ready";
import { useStrategyGeneration, type GenerationState } from "./use-strategy-generation";

export type AiAvailabilityView = { state: "available"; simulation: boolean } | { state: "unavailable" };

const UNAVAILABLE_TEXT =
  "A geração com IA está indisponível no momento (desligada ou sem configuração). Suas informações continuam salvas; tente mais tarde.";

/** Tela de estratégia no modo Supabase (dados do servidor + geração assíncrona com job). */
export function StrategyScreen({
  facts,
  strategy,
  activeJob,
  availability,
}: {
  facts: DesignFacts;
  strategy: StrategyView | null;
  activeJob: GenerationJob | null;
  availability: AiAvailabilityView;
}) {
  const router = useRouter();
  const generation = useStrategyGeneration(activeJob);
  const unavailable = availability.state === "unavailable";
  const simulationMode = availability.state === "available" && availability.simulation;

  const create: CreatePiece = async (conceptId, format) => {
    const res = await createCreativeFromConcept({ concept_id: conceptId, format });
    if (!res.ok) return { message: res.error.message, correlation_id: res.error.correlation_id };
    router.push(`/app/criativos/${res.data.creative_id}`);
    return null;
  };

  const status = (
    <GenerationStatus state={generation.state} onRetry={generation.start} onCheckAgain={generation.checkAgain} />
  );
  const unavailableNotice = unavailable && (
    <Alert tone="warning" title="Geração indisponível" className="mt-5">
      {UNAVAILABLE_TEXT}
    </Alert>
  );

  if (!strategy) {
    return (
      <div className="mx-auto max-w-6xl">
        <PageHeader
          title="Estratégia"
          description="O segundo passo: a estratégia e os conceitos de anúncio do seu negócio."
        />
        {unavailableNotice}
        {simulationMode && (
          <SimulationNotice className="mt-5">
            A IA real não está ligada neste ambiente: a estratégia sai como Simulação, um conteúdo de exemplo montado só
            com as informações confirmadas no seu cadastro.
          </SimulationNotice>
        )}
        <div className="mt-8">
          <GenerateHero
            buttonLabel="Gerar estratégia"
            busy={generation.busy}
            disabled={unavailable}
            onGenerate={generation.start}
            simulation={simulationMode}
            note={`Limite de ${DAILY_GENERATION_LIMIT} gerações a cada 24 horas por empresa.`}
          >
            {generation.state.phase !== "idle" && status}
          </GenerateHero>
        </div>
      </div>
    );
  }

  return (
    <StrategyReady
      strategy={strategy.content}
      version={strategy.version}
      createdAt={strategy.created_at}
      isSimulation={strategy.is_simulation}
      concepts={strategy.concepts.map((c) => ({ key: c.id, concept: c.content }))}
      facts={facts}
      onCreate={create}
      onRegenerate={generation.start}
      regenerating={generation.busy}
      regenerateDisabled={unavailable}
      notices={unavailableNotice}
      status={generation.state.phase !== "idle" ? status : null}
    />
  );
}

const NO_RETRY = new Set(["quota_exceeded", "feature_disabled", "forbidden", "brief_not_ready"]);

/** Traduz o estado da geração para o painel (mensagens por status e por código de erro). */
function GenerationStatus({
  state,
  onRetry,
  onCheckAgain,
}: {
  state: GenerationState;
  onRetry: () => void;
  onCheckAgain: () => void;
}) {
  const retry = (
    <Button size="sm" onClick={onRetry}>
      Tentar de novo
    </Button>
  );
  const checkAgain = (
    <Button size="sm" variant="secondary" onClick={onCheckAgain}>
      Verificar de novo
    </Button>
  );

  switch (state.phase) {
    case "idle":
      return null;
    case "requesting":
      return <GenerationPanel tone="progress" title="Enviando pedido…" step={0} />;
    case "tracking": {
      const { job } = state;
      if (job.status === "running") {
        const attempt = job.attempts && job.max_attempts ? ` (tentativa ${job.attempts} de ${job.max_attempts})` : "";
        return (
          <GenerationPanel
            tone="progress"
            title={`Criando sua estratégia…${attempt}`}
            text="A IA está escrevendo a estratégia e os conceitos a partir do seu cadastro. Pode levar até alguns minutos; você pode sair desta tela."
            step={1}
          />
        );
      }
      return (
        <GenerationPanel
          tone="progress"
          title="Na fila…"
          text="Seu pedido foi recebido e começa em instantes."
          step={0}
        />
      );
    }
    case "succeeded":
      return <GenerationPanel tone="success" title="Estratégia pronta. Carregando…" step={2} />;
    case "failed": {
      const code = state.job.error_code ?? "internal";
      const message = JOB_ERROR_MESSAGES[code];
      return (
        <GenerationPanel
          tone="error"
          title={message.title}
          text={message.text}
          actions={NO_RETRY.has(code) ? undefined : retry}
        />
      );
    }
    case "timeout":
      return (
        <GenerationPanel
          tone="warning"
          title="Está demorando mais que o normal"
          text="A geração ainda não terminou depois de 5 minutos. Verifique de novo ou volte mais tarde; nada se perde."
          actions={checkAgain}
        />
      );
    case "poll_failed":
      return (
        <GenerationPanel
          tone="error"
          title="Não foi possível acompanhar a geração"
          text={state.error?.message}
          correlationId={state.error?.correlation_id}
          actions={checkAgain}
        />
      );
    case "request_failed": {
      const { error } = state;
      return (
        <GenerationPanel
          tone="error"
          title={REQUEST_ERROR_TITLES[error.code] ?? "Não foi possível pedir a geração"}
          text={
            <>
              {error.message}
              {error.code === "brief_not_ready" && (
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
          actions={NO_RETRY.has(error.code) ? undefined : retry}
        />
      );
    }
  }
}
