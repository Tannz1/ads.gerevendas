import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

type Tone = "info" | "success" | "warning" | "danger";
const tones: Record<Tone, string> = {
  info: "border-brand/20 bg-brand-soft text-brand-strong",
  success: "border-success/20 bg-success-soft text-success",
  warning: "border-accent/50 bg-accent-soft text-warning",
  danger: "border-danger/20 bg-danger-soft text-danger",
};

export function Alert({
  tone = "info",
  title,
  children,
  className,
}: {
  tone?: Tone;
  title?: string;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className={cn("rounded-xl border px-4 py-3 text-sm", tones[tone], className)}
    >
      {title && <p className="font-semibold">{title}</p>}
      {children && <div className={cn(title && "mt-0.5", "text-ink-soft")}>{children}</div>}
    </div>
  );
}
