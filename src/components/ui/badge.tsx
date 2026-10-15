import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

type Tone = "neutral" | "brand" | "success" | "warning" | "danger" | "demo";

const tones: Record<Tone, string> = {
  neutral: "bg-surface-muted text-ink-soft",
  brand: "bg-brand-soft text-brand-strong",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
  demo: "bg-accent-soft text-warning ring-1 ring-accent/60",
};

export function Badge({
  tone = "neutral",
  children,
  className,
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold tracking-wide whitespace-nowrap",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
