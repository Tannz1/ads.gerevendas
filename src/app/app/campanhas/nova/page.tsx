import type { Metadata } from "next";
import Link from "next/link";
import { NewCampaignForm } from "@/components/campaigns/new-campaign-form";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { Objective } from "@/contracts/onboarding";
import { serverEnv } from "@/lib/env";
import { resolveFlags } from "@/lib/flags";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadMetaConnection } from "@/server/campaigns-data";
import { getAppContext } from "@/server/context";
import { loadCreativesOverview } from "@/server/creatives-data";

export const metadata: Metadata = { title: "Nova Campanha" };

export default async function NewCampaignPage() {
  const ctx = await getAppContext();
  const flags = resolveFlags(serverEnv());

  if (ctx.mode === "demo" || !ctx.organization) {
    return (
      <div className="mx-auto max-w-3xl">
        <h1 className="font-display text-3xl font-bold tracking-tight">Nova campanha</h1>
        <Card className="mt-8 p-6">
          <p className="text-[15px] text-ink-soft">Disponível no piloto com conta conectada.</p>
        </Card>
      </div>
    );
  }

  const supabase = await createSupabaseServerClient();
  const [overview, metaConn, briefRes] = await Promise.all([
    loadCreativesOverview(ctx.organization.id),
    loadMetaConnection(ctx.organization.id),
    supabase
      .from("briefs")
      .select("objective, offers(name)")
      .eq("organization_id", ctx.organization.id)
      .eq("status", "submitted")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (overview.state !== "ready" || !overview.strategy) {
    return (
      <div className="mx-auto max-w-3xl">
        <h1 className="font-display text-3xl font-bold tracking-tight">Nova campanha</h1>
        <Card className="mt-8 p-6">
          <p className="text-[15px] text-ink-soft">
            Gere uma estratégia e aprove pelo menos 1 peça em{" "}
            <Link href="/app/criativos" className="font-semibold text-brand underline">
              Criativos
            </Link>{" "}
            antes de configurar a campanha.
          </p>
        </Card>
      </div>
    );
  }

  const approved = overview.creatives.filter((c) => c.status === "approved");
  if (approved.length === 0) {
    return (
      <div className="mx-auto max-w-3xl">
        <h1 className="font-display text-3xl font-bold tracking-tight">Nova campanha</h1>
        <Card className="mt-8 p-6">
          <p className="text-[15px] text-ink-soft">
            Nenhuma peça está aprovada ainda. Entre em{" "}
            <Link href="/app/criativos" className="font-semibold text-brand underline">
              Criativos
            </Link>{" "}
            e aprove as peças que deseja veicular.
          </p>
        </Card>
      </div>
    );
  }

  const brief = briefRes.data as unknown as {
    objective: Objective;
    offers: { name: string } | null;
  } | null;

  const simulated = !flags.realPublishing || flags.metaMode === "mock";

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/app/campanhas" className="text-sm font-medium text-ink-soft hover:text-ink">
            ← Voltar para Campanhas
          </Link>
          <h1 className="mt-1 font-display text-3xl font-bold tracking-tight">Publicar campanha pausada</h1>
        </div>
        {simulated && <Badge tone="demo">Simulação</Badge>}
      </div>

      <NewCampaignForm
        strategyId={overview.strategy.id}
        defaultName={`Campanha — ${brief?.offers?.name ?? "Oferta Principal"}`}
        objective={brief?.objective ?? "mensagens_whatsapp"}
        approvedCreatives={approved}
        isOwner={ctx.organization.role === "owner"}
        metaConnected={metaConn?.status === "connected"}
        simulated={simulated}
      />
    </div>
  );
}
