import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ONBOARDING_STEPS } from "@/contracts/onboarding";

export type OnboardingStatus = { state: "not_started" | "in_progress" | "done"; step: number };

export function HomeStatus({ status, demo }: { status: OnboardingStatus; demo: boolean }) {
  const total = ONBOARDING_STEPS.length;
  const progress = status.state === "done" ? total : status.state === "in_progress" ? status.step - 1 : 0;

  return (
    <div className="mx-auto max-w-5xl">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-display text-3xl font-bold tracking-tight">Início</h1>
        {demo && <Badge tone="demo">DEMO</Badge>}
      </div>
      <p className="mt-1.5 text-ink-soft">Acompanhe o que falta para seu primeiro anúncio.</p>

      <div className="mt-8 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
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
              ? "Tudo certo. Essas informações serão a base da estratégia e das peças."
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
          {status.state !== "done" ? (
            <ButtonLink href="/app/onboarding" className="mt-5">
              {status.state === "in_progress" ? "Continuar cadastro" : "Começar cadastro"}
            </ButtonLink>
          ) : (
            !demo && (
              <ButtonLink href="/app/criativos" className="mt-5">
                Criar meus anúncios
              </ButtonLink>
            )
          )}
        </Card>

        <Card className="p-6 sm:p-7">
          <h2 className="font-display text-lg font-bold">Próximas fases do piloto</h2>
          <ul className="mt-4 grid gap-3 text-[15px]">
            <li className="flex items-start justify-between gap-3">
              <span>Estratégia e peças editáveis</span>
              {demo ? <Badge>Com conta</Badge> : <Badge tone="success">Disponível</Badge>}
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
