import { DemoHome } from "@/components/home/demo-home";
import { HomeStatus } from "@/components/home/home-status";
import { getAppContext } from "@/server/context";
import { loadOnboardingDraft } from "@/server/drafts";

export default async function AppHome() {
  const ctx = await getAppContext();
  if (ctx.mode === "demo") return <DemoHome />;
  if (!ctx.organization) return null;

  const draft = await loadOnboardingDraft(ctx.organization.id);
  const state = draft.completed ? "done" : draft.touched ? "in_progress" : "not_started";
  return <HomeStatus status={{ state, step: draft.step }} demo={false} />;
}
