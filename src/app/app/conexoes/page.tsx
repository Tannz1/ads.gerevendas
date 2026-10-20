import type { Metadata } from "next";
import { MetaConnectionPanel } from "@/components/campaigns/meta-connection-panel";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { serverEnv } from "@/lib/env";
import { resolveFlags } from "@/lib/flags";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadMetaConnection } from "@/server/campaigns-data";
import { getAppContext } from "@/server/context";

export const metadata: Metadata = { title: "Conexões Meta" };

export default async function ConnectionsPage() {
  const ctx = await getAppContext();
  const flags = resolveFlags(serverEnv());

  if (ctx.mode === "demo" || !ctx.organization) {
    return (
      <div className="mx-auto max-w-3xl">
        <div className="flex items-center gap-3">
          <h1 className="font-display text-3xl font-bold tracking-tight">Conexões Meta</h1>
          <Badge tone="demo">Demonstração</Badge>
        </div>
        <Card className="mt-8 p-6">
          <p className="text-[15px] text-ink-soft">
            A conexão de Conta de Anúncios, Página do Facebook, Instagram e WhatsApp está disponível no piloto com conta
            conectada.
          </p>
        </Card>
      </div>
    );
  }

  const supabase = await createSupabaseServerClient();
  const [connection, bizRes] = await Promise.all([
    loadMetaConnection(ctx.organization.id),
    supabase
      .from("businesses")
      .select("name, whatsapp_e164")
      .eq("organization_id", ctx.organization.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const biz = bizRes.data as { name: string; whatsapp_e164: string | null } | null;
  const canManage = ctx.organization.role === "owner" || ctx.organization.role === "admin";

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight">Conexões Meta</h1>
          <p className="mt-1 text-[15px] text-ink-soft">
            Vincule os ativos da sua empresa para preparar publicações no Facebook e Instagram.
          </p>
        </div>
        {flags.metaMode === "mock" && <Badge tone="demo">Modo Simulação</Badge>}
      </div>

      <MetaConnectionPanel
        connection={connection}
        canManage={canManage}
        metaMode={flags.metaMode}
        defaultBusinessName={biz?.name ?? ctx.organization.name}
        defaultWhatsapp={biz?.whatsapp_e164 ?? null}
      />
    </div>
  );
}
