import type { Metadata } from "next";
import { OnboardingWizard } from "@/components/onboarding/wizard";
import { serverEnv } from "@/lib/env";
import { resolveFlags } from "@/lib/flags";
import { getAppContext } from "@/server/context";
import { loadOnboardingDraft } from "@/server/drafts";
import { loadMetaOnboarding } from "@/server/meta/data";
import { resolveMetaBusinessMode } from "@/server/meta/mode";

export const metadata: Metadata = { title: "Meu negócio" };

export default async function OnboardingPage() {
  const ctx = await getAppContext();
  if (ctx.mode === "demo") return <OnboardingWizard mode="demo" />;
  if (!ctx.organization) return null;

  const env = serverEnv();
  const mode = resolveMetaBusinessMode(env, resolveFlags(env));
  const [draft, connection] = await Promise.all([
    loadOnboardingDraft(ctx.organization.id),
    loadMetaOnboarding(ctx.organization.id),
  ]);
  return (
    <OnboardingWizard
      mode="supabase"
      initial={draft}
      meta={{
        connection,
        shared: Boolean(env.META_SHARED_AD_ACCOUNT_ID),
        canManage: ctx.organization.role === "owner",
        simulated: mode.kind !== "real",
        disabled: mode.kind === "disabled",
        businessId: mode.kind === "real" ? mode.businessId : null,
      }}
    />
  );
}
