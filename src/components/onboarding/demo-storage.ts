import { ONBOARDING_STEPS } from "@/contracts/onboarding";

/** Rascunho do modo demonstração. Fica só no navegador; nunca vai ao servidor. */
export const DEMO_STORAGE_KEY = "gv-ads:onboarding:v1";

export type DemoDraft = { step: number; data: unknown; completed: boolean; saved_at?: string };

export function readDemoDraft(): DemoDraft | null {
  try {
    const raw = localStorage.getItem(DEMO_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<DemoDraft>;
    const step = Number(parsed.step);
    return {
      step: Number.isInteger(step) && step >= 1 && step <= ONBOARDING_STEPS.length ? step : 1,
      data: parsed.data,
      completed: parsed.completed === true,
      saved_at: parsed.saved_at,
    };
  } catch {
    return null;
  }
}

export function writeDemoDraft(draft: DemoDraft): boolean {
  try {
    localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify({ ...draft, saved_at: new Date().toISOString() }));
    return true;
  } catch {
    return false;
  }
}
