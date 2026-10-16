import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { errorRef } from "./messages";

const STEPS = ["Na fila", "Criando", "Pronto"] as const;

/**
 * Painel de andamento da geração. Reflete só o status real do job (fila → criando → pronto);
 * não simula etapas intermediárias.
 */
export function GenerationPanel({
  tone,
  title,
  text,
  step,
  correlationId,
  actions,
  className,
}: {
  tone: "progress" | "success" | "error" | "warning";
  title: string;
  text?: ReactNode;
  /** Índice da etapa atual (0 fila, 1 criando, 2 pronto); omitido em erros. */
  step?: 0 | 1 | 2;
  correlationId?: string | null;
  actions?: ReactNode;
  className?: string;
}) {
  const ref = errorRef(correlationId);
  return (
    <div
      className={cn(
        "rounded-2xl border px-5 py-4 sm:px-6 sm:py-5",
        tone === "error"
          ? "border-danger/25 bg-danger-soft"
          : tone === "warning"
            ? "border-accent/50 bg-accent-soft"
            : tone === "success"
              ? "border-success/25 bg-success-soft"
              : "border-brand/20 bg-brand-soft/70",
        className,
      )}
    >
      <div className="flex items-start gap-3.5">
        <StatusIcon tone={tone} />
        <div className="min-w-0 flex-1">
          <div role={tone === "error" ? "alert" : "status"} aria-live={tone === "error" ? "assertive" : "polite"}>
            <p
              className={cn(
                "font-semibold",
                tone === "error" ? "text-danger" : tone === "warning" ? "text-warning" : "text-ink",
              )}
            >
              {title}
            </p>
            {text && <div className="mt-1 text-sm leading-relaxed text-ink-soft">{text}</div>}
            {ref && <p className="mt-1 text-xs text-ink-faint">Código para o suporte: {ref}</p>}
          </div>
          {step !== undefined && (
            <ol
              aria-label="Andamento"
              className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-2 text-xs font-semibold"
            >
              {STEPS.map((label, i) => {
                const state = i < step ? "done" : i === step ? "current" : "todo";
                return (
                  <li key={label} className="flex items-center gap-2">
                    <span
                      aria-current={state === "current" ? "step" : undefined}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1",
                        state === "done" && "bg-success-soft text-success",
                        state === "current" && "bg-brand text-white",
                        state === "todo" && "bg-surface text-ink-faint ring-1 ring-line",
                      )}
                    >
                      {state === "done" && <span aria-hidden>✓</span>}
                      {label}
                    </span>
                    {i < STEPS.length - 1 && <span aria-hidden className="h-px w-4 bg-line-strong" />}
                  </li>
                );
              })}
            </ol>
          )}
          {actions && <div className="mt-4 flex flex-wrap gap-3">{actions}</div>}
        </div>
      </div>
      {tone === "progress" && (
        <div aria-hidden className="mt-4 h-1 overflow-hidden rounded-full bg-brand/10">
          <div className="h-full w-full animate-pulse rounded-full bg-brand/60" />
        </div>
      )}
    </div>
  );
}

function StatusIcon({ tone }: { tone: "progress" | "success" | "error" | "warning" }) {
  if (tone === "progress") {
    return (
      <span aria-hidden className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-surface">
        <span className="size-4 animate-spin rounded-full border-2 border-brand/25 border-t-brand" />
      </span>
    );
  }
  const color = tone === "success" ? "text-success" : tone === "warning" ? "text-warning" : "text-danger";
  return (
    <span aria-hidden className={cn("mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-surface", color)}>
      <svg viewBox="0 0 24 24" className="size-4.5" fill="none" stroke="currentColor" strokeWidth="2.4">
        {tone === "success" ? (
          <path d="M5 12.5l4.5 4.5L19 7.5" strokeLinecap="round" strokeLinejoin="round" />
        ) : (
          <path d="M12 7v6M12 17h.01" strokeLinecap="round" />
        )}
      </svg>
    </span>
  );
}
