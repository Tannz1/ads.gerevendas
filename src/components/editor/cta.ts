import type { Objective } from "@/contracts/onboarding";
import { ALL_CTAS, CTA_BY_OBJECTIVE } from "@/contracts/strategy";

/** Botões do objetivo do brief + o botão atual da peça (sem objetivo conhecido: todos). */
export function ctaOptionsFor(objective: Objective | null, current: string): string[] {
  const base = objective ? CTA_BY_OBJECTIVE[objective] : ALL_CTAS;
  return [...new Set([...base, current].filter(Boolean))];
}
