import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ONBOARDING_STEPS } from "@/contracts/onboarding";

export type OnboardingStatus = { state: "not_started" | "in_progress" | "done"; step: number };

/** Resumo da fase 2; null quando não foi possível carregar (estado parcial). */
export type Phase2Status = {
  strategyVersion: number | null;
  creatives: { total: number; approved: number };
} | null;

export function HomeStatus({
  status,
  demo,
  phase2,
}: {
  status: OnboardingStatus;
  demo: boolean;
  phase2: Phase2Status;
}) {
  const total = ONBOARDING_STEPS.length;
  const progress = status.state === "done" ? total : status.state === "in_progress" ? status.step - 1 : 0;

  return (
    <div className="mx-auto max-w-5xl">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-display text-3xl font-bold tracking-tight">Início</h1>
        {demo && <Badge tone="demo">DEMO</Badge>}
      </div>
      <p className="mt-1.5 text-ink-soft">Acompanhe o que falta para seu primeiro anúncio.</p>

      <div className="mt-8 grid gap-4 lg:grid-cols-[1.4fr_1fr] lg:items-start">
        <div className="grid gap-4">
          <Card className="p-6 sm:p-7">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold tracking-wider text-ink-faint uppercase">Passo 1</p>
                <h2 className="mt-1 font-display text-xl font-bold">Cadastro do negócio</h2>
              </div>
              {status.state === "done" ? (
                <Badge tone="success">Concluído</Badge>
              ) : status.state === "in_progress" ? (
                <Badge tone="brand">Em andamento</Badge>
              ) : (
                <Badge>Não iniciado</Badge>
              )}
            </div>
            <p className="mt-3 text-[15px] text-ink-soft">
              {status.state === "done"
                ? "Tudo certo. Essas informações são a base da estratégia e das peças."
                : "Seis etapas curtas sobre o que você vende, para quem e como quer aparecer."}
            </p>
            <div className="mt-5" aria-hidden>
              <div className="h-2 overflow-hidden rounded-full bg-surface-muted">
                <div className="h-full rounded-full bg-brand" style={{ width: `${(progress / total) * 100}%` }} />
              </div>
            </div>
            <p className="mt-2 text-sm text-ink-faint">
              {progress} de {total} etapas
            </p>
            {status.state !== "done" && (
              <ButtonLink href="/app/onboarding" className="mt-5">
                {status.state === "in_progress" ? "Continuar cadastro" : "Começar cadastro"}
              </ButtonLink>
            )}
          </Card>

          <StrategyStepCard ready={status.state === "done"} demo={demo} phase2={phase2} />
        </div>

        <Card className="p-6 sm:p-7">
          <h2 className="font-display text-lg font-bold">Fases do piloto</h2>
          <ul className="mt-4 grid gap-3 text-[15px]">
            <li className="flex items-start justify-between gap-3">
              <span>Estratégia e conceitos com IA</span>
              <Badge tone="success">Disponível</Badge>
            </li>
            <li className="flex items-start justify-between gap-3">
              <span>Editor de criativos</span>
              <Badge tone="success">Disponível</Badge>
            </li>
            <li className="flex items-start justify-between gap-3">
              <span>Conexão com a Meta</span>
              <Badge>Em breve</Badge>
            </li>
          </ul>
          <p className="mt-5 text-sm text-ink-faint">
            Nenhum anúncio é criado ou publicado nesta fase.{" "}
            <Link href="/app/conta" className="font-medium text-brand underline-offset-2 hover:underline">
              Ver status da conta
            </Link>
          </p>
        </Card>
      </div>
    </div>
  );
}

function StrategyStepCard({ ready, demo, phase2 }: { ready: boolean; demo: boolean; phase2: Phase2Status }) {
  const hasStrategy = Boolean(phase2?.strategyVersion);
  return (
    <Card className="p-6 sm:p-7">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold tracking-wider text-ink-faint uppercase">Passo 2</p>
          <h2 className="mt-1 font-display text-xl font-bold">Estratégia e peças</h2>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          {demo && hasStrategy && <Badge tone="demo">Simulação</Badge>}
          {!ready ? (
            <Badge>Aguardando passo 1</Badge>
          ) : hasStrategy ? (
            <Badge tone="brand">Versão {phase2?.strategyVersion}</Badge>
          ) : (
            <Badge tone="brand">Pronto para começar</Badge>
          )}
        </div>
      </div>
      <p className="mt-3 text-[15px] text-ink-soft">
        {!ready
          ? "Disponível quando o cadastro estiver concluído. A IA usa só o que você confirmar nele."
          : hasStrategy
            ? "Sua estratégia está pronta. Crie peças a partir dos conceitos, ajuste no editor e aprove."
            : "Gere a estratégia e os conceitos de anúncio a partir do seu cadastro. Você revisa e edita tudo."}
      </p>
      {ready && phase2 && (
        <dl className="mt-5 grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-canvas px-4 py-3">
            <dt className="text-xs font-semibold text-ink-faint">Peças</dt>
            <dd className="mt-0.5 font-display text-2xl font-bold">{phase2.creatives.total}</dd>
          </div>
          <div className="rounded-xl bg-canvas px-4 py-3">
            <dt className="text-xs font-semibold text-ink-faint">Aprovadas</dt>
            <dd className="mt-0.5 font-display text-2xl font-bold">{phase2.creatives.approved}</dd>
          </div>
        </dl>
      )}
      {ready && !phase2 && (
        <p role="status" className="mt-4 text-sm text-ink-faint">
          Não foi possível carregar o resumo das peças agora.
        </p>
      )}
      {ready && (
        <div className="mt-5 flex flex-wrap gap-3">
          <ButtonLink href="/app/estrategia">{hasStrategy ? "Ver estratégia" : "Gerar estratégia"}</ButtonLink>
          {phase2 && phase2.creatives.total > 0 && (
            <ButtonLink href="/app/criativos" variant="secondary">
              Ver criativos
            </ButtonLink>
          )}
        </div>
      )}
    </Card>
  );
}
