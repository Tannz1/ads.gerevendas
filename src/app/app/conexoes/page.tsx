import type { Metadata } from "next";
import { ConnectionSteps } from "@/components/meta/connection-steps";
import { Badge } from "@/components/ui/badge";
import { serverEnv } from "@/lib/env";
import { resolveFlags } from "@/lib/flags";
import { getAppContext } from "@/server/context";
import { loadMetaOnboarding } from "@/server/meta/data";
import { resolveMetaBusinessMode } from "@/server/meta/mode";

export const metadata: Metadata = { title: "Conexões Meta" };

export default async function ConnectionsPage() {
  const ctx = await getAppContext();
  const demo = ctx.mode === "demo" || !ctx.organization;
  const env = serverEnv();
  const mode = resolveMetaBusinessMode(env, resolveFlags(env));
  const connection =
    demo || ctx.mode !== "supabase" || !ctx.organization ? null : await loadMetaOnboarding(ctx.organization.id);

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight">Conexões Meta</h1>
          <p className="mt-1 text-[15px] text-ink-soft">
            Quatro passos para seus anúncios rodarem no Facebook e no Instagram.
          </p>
        </div>
        {demo ? (
          <Badge tone="demo">Demonstração</Badge>
        ) : (
          mode.kind === "mock" && <Badge tone="demo">Modo Simulação</Badge>
        )}
      </div>

      <ConnectionSteps
        connection={connection}
        canManage={ctx.mode === "supabase" && ctx.organization?.role === "owner"}
        demo={demo}
        simulated={mode.kind !== "real"}
        disabledReason={mode.kind === "disabled" ? mode.reason : null}
        businessId={mode.kind === "real" ? mode.businessId : null}
        defaultInviteEmail={ctx.mode === "supabase" ? (ctx.user.email ?? "") : ""}
      />
    </div>
  );
}
