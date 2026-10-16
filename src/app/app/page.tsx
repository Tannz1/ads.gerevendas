import { DemoHome } from "@/components/home/demo-home";
import { HomeStatus, type Phase2Status } from "@/components/home/home-status";
import { log } from "@/lib/logger";
import { getAppContext, getCorrelationId } from "@/server/context";
import { loadOnboardingDraft } from "@/server/drafts";
import { loadPhase2Summary } from "@/server/strategy-page";

export default async function AppHome() {
  const ctx = await getAppContext();
  if (ctx.mode === "demo") return <DemoHome />;
  if (!ctx.organization) return null;

  const draft = await loadOnboardingDraft(ctx.organization.id);
  const state = draft.completed ? "done" : draft.touched ? "in_progress" : "not_started";

  // Resumo da fase 2 é opcional: se falhar, o início abre mesmo assim (estado parcial).
  let phase2: Phase2Status = { strategyVersion: null, creatives: { total: 0, approved: 0 } };
  if (draft.completed) {
    try {
      phase2 = await loadPhase2Summary(ctx.organization.id);
    } catch (error) {
      log("warn", "home.phase2_summary_failed", {
        correlation_id: await getCorrelationId(),
        organization_id: ctx.organization.id,
        error_name: error instanceof Error ? error.name : "unknown",
      });
      phase2 = null;
    }
  }
  return <HomeStatus status={{ state, step: draft.step }} phase2={phase2} demo={false} />;
}
