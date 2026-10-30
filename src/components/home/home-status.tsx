import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ONBOARDING_STEPS } from "@/contracts/onboarding";

export type OnboardingStatus = { state: "not_started" | "in_progress" | "done"; step: number };

const NEXT_STEPS = [
  { title: "Criar os anúncios", href: "/app/criativos" },
  { title: "Conectar sua Página", href: "/app/conexoes" },
  { title: "Publicar e acompanhar", href: "/app/painel" },
];

export function HomeStatus({ status, demo }: { status: OnboardingStatus; demo: boolean }) {
  const total = ONBOARDING_STEPS.length;
  const progress = status.state === "done" ? total : status.state === "in_progress" ? status.step - 1 : 0;
  const done = status.state === "done";

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-display text-3xl font-bold tracking-tight">Início</h1>
        {demo && <Badge tone="demo">DEMO</Badge>}
      </div>

      <Card className="mt-8 divide-y divide-line">
        <div className="p-6">
          <div className="flex items-center justify-between gap-4">
            <h2 className="font-display text-lg font-bold">1. Cadastro do negócio</h2>
            {done ? (
              <Badge tone="success">Concluído</Badge>
            ) : (
              <span className="text-sm text-ink-faint">
                {progress} de {total}
              </span>
            )}
          </div>
          {!done && (
            <>
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-surface-muted" aria-hidden>
                <div className="h-full rounded-full bg-brand" style={{ width: `${(progress / total) * 100}%` }} />
              </div>
              <ButtonLink href="/app/onboarding" className="mt-5">
                {status.state === "in_progress" ? "Continuar cadastro" : "Começar cadastro"}
              </ButtonLink>
            </>
          )}
        </div>
        {NEXT_STEPS.map((step, i) => (
          <div key={step.href} className="flex items-center justify-between gap-4 p-6">
            <h2 className={done ? "font-display text-lg font-bold" : "font-display text-lg font-bold text-ink-faint"}>
              {i + 2}. {step.title}
            </h2>
            {done && !demo && i === 0 ? (
              <ButtonLink href={step.href}>Criar meus anúncios</ButtonLink>
            ) : (
              done && (
                <Link href={step.href} className="text-sm font-semibold text-brand hover:underline">
                  Abrir
                </Link>
              )
            )}
          </div>
        ))}
      </Card>
    </div>
  );
}
