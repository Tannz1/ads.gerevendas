import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { TabBarLinks } from "./tab-bar";

/**
 * Casca das telas do fluxo simples (ADR 0010): coluna de celular, tema verde e, no celular, a barra
 * inferior Início / Anúncios / Conta. No computador a navegação continua na barra lateral.
 */
export function SimpleShell({ children, tabs = true }: { children: ReactNode; tabs?: boolean }) {
  return (
    <div className="theme-zap -mx-4 -my-8 min-h-[calc(100dvh-4rem)] bg-canvas px-4 pt-6 pb-28 sm:-mx-8 sm:-my-10 sm:px-8 lg:pb-12">
      <div className="mx-auto max-w-md">{children}</div>
      {tabs && (
        <nav
          aria-label="Atalhos"
          className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
        >
          <Suspense fallback={<TabBarFallback />}>
            <TabBarLinks />
          </Suspense>
        </nav>
      )}
    </div>
  );
}

function TabBarFallback() {
  return <div className="h-16" aria-hidden />;
}

/** Título da tela com "voltar" e, opcionalmente, a etapa ("2 de 7"). */
export function ScreenHeader({
  title,
  back,
  step,
  aside,
}: {
  title: string;
  back?: string | (() => void);
  step?: string;
  aside?: ReactNode;
}) {
  const arrow = (
    <svg aria-hidden viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M19 12H5m6-6l-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
  const backClass = "-ml-2 grid size-10 place-items-center rounded-full text-ink hover:bg-surface-muted";
  return (
    <header className="mb-6">
      <div className="flex min-h-10 items-center justify-between gap-3">
        {typeof back === "string" ? (
          <Link href={back} aria-label="Voltar" className={backClass}>
            {arrow}
          </Link>
        ) : back ? (
          <button type="button" onClick={back} aria-label="Voltar" className={backClass}>
            {arrow}
          </button>
        ) : (
          <span />
        )}
        <div className="flex items-center gap-2">
          {aside}
          {step && <span className="text-sm font-medium text-ink-faint">{step}</span>}
        </div>
      </div>
      <h1 className="mt-3 font-display text-[28px] leading-tight font-bold tracking-tight text-ink">{title}</h1>
    </header>
  );
}

/** Botão principal largo, verde, como nas telas do celular. */
export const bigButton =
  "inline-flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-brand px-5 text-[17px] font-bold text-white shadow-[0_6px_16px_-8px_rgb(26_138_60/0.7)] transition-colors hover:bg-brand-strong disabled:cursor-not-allowed disabled:opacity-50";

export const outlineButton =
  "inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-line-strong bg-white px-5 text-[15px] font-semibold text-ink transition-colors hover:bg-surface-muted disabled:opacity-50";

/** Opção selecionável em cartão (verba por dia, alcance, destaque). */
export function choiceClasses(selected: boolean, className?: string) {
  return cn(
    "relative rounded-2xl border-2 bg-white text-left transition-colors focus-within:ring-4 focus-within:ring-brand/15",
    selected ? "border-brand bg-brand-soft" : "border-line hover:border-line-strong",
    className,
  );
}

export function CheckBadge() {
  return (
    <span className="absolute -top-2.5 -right-2.5 grid size-6 place-items-center rounded-full bg-brand text-white shadow">
      <svg aria-hidden viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="3">
        <path d="M5 12l5 5 9-10" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

export function SimulationTag() {
  return (
    <span className="inline-flex items-center rounded-full bg-accent-soft px-2.5 py-0.5 text-xs font-semibold text-warning ring-1 ring-accent/60">
      Simulação
    </span>
  );
}
