import type { Metadata } from "next";
import { OnboardingWizard } from "@/components/onboarding/wizard";
import { getAppContext } from "@/server/context";
import { loadOnboardingDraft } from "@/server/drafts";

export const metadata: Metadata = { title: "Meu negócio" };

export default async function OnboardingPage() {
  const ctx = await getAppContext();
  if (ctx.mode === "demo") return <OnboardingWizard mode="demo" />;
  if (!ctx.organization) return null;

  const draft = await loadOnboardingDraft(ctx.organization.id);
  return <OnboardingWizard mode="supabase" initial={draft} />;
}
