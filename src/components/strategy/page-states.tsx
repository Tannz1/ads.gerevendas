import type { ReactNode } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/cn";
import { errorRef } from "./messages";

/** Cabeçalho padrão das telas da fase 2. */
export function PageHeader({
  title,
  badges,
  description,
  actions,
}: {
  title: string;
  badges?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-display text-3xl font-bold tracking-tight">{title}</h1>
          {badges}
        </div>
        {description && <div className="mt-1.5 text-ink-soft">{description}</div>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-3">{actions}</div>}
    </div>
  );
}

/** Rótulo obrigatório de conteúdo simulado (nunca apresentado como IA real). */
export function SimulationNotice({ className, children }: { className?: string; children?: ReactNode }) {
  return (
    <div
      role="note"
      className={cn(
        "flex flex-col items-start gap-2 rounded-xl border border-accent/50 bg-accent-soft px-4 py-3 text-sm text-ink-soft sm:flex-row sm:items-center sm:gap-3",
        className,
      )}
    >
      <Badge tone="demo">Simulação</Badge>
      <p>
        {children ??
          "Conteúdo de exemplo gerado sem IA real, só com as informações confirmadas no seu cadastro. Revise tudo antes de usar."}
      </p>
    </div>
  );
}

/** Estado vazio com ícone, explicação e uma ação real. */
export function EmptyState({
  icon,
  title,
  children,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  children?: ReactNode;
  action?: { href: string; label: string };
  className?: string;
}) {
  return (
    <Card className={cn("mx-auto max-w-2xl px-6 py-10 text-center sm:px-10 sm:py-14", className)}>
      <span aria-hidden className="mx-auto grid size-14 place-items-center rounded-2xl bg-brand-soft text-brand">
        {icon ?? <SparkIcon className="size-7" />}
      </span>
      <h2 className="mt-5 font-display text-2xl font-bold tracking-tight">{title}</h2>
      {children && <div className="mx-auto mt-2 max-w-md text-[15px] leading-relaxed text-ink-soft">{children}</div>}
      {action && (
        <ButtonLink href={action.href} size="lg" className="mt-7">
          {action.label}
        </ButtonLink>
      )}
    </Card>
  );
}

/** Erro da API com a mensagem e a referência curta do correlation id. */
export function ErrorNotice({
  title = "Não foi possível carregar",
  message,
  correlationId,
  className,
  children,
}: {
  title?: string;
  message: string;
  correlationId?: string | null;
  className?: string;
  children?: ReactNode;
}) {
  const ref = errorRef(correlationId);
  return (
    <Alert tone="danger" title={title} className={className}>
      <p>
        {message}
        {ref && <span className="text-ink-faint"> (código {ref})</span>}
      </p>
      {children}
    </Alert>
  );
}

export function GallerySkeleton() {
  return (
    <div aria-busy className="mx-auto max-w-6xl">
      <Skeleton className="h-9 w-56" />
      <Skeleton className="mt-3 h-5 w-80 max-w-full" />
      <Skeleton className="mt-8 h-64" />
      <div className="mt-8 grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-[560px] rounded-2xl" />
        ))}
      </div>
    </div>
  );
}

export function SparkIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3z" />
      <path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15z" />
    </svg>
  );
}

export function ImagesIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="5" width="14" height="16" rx="2" />
      <path d="M7 3h12a2 2 0 012 2v12" />
      <path d="M3 16l4-4 3 3 2-2 5 5" />
    </svg>
  );
}
