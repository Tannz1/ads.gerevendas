import type { Metadata } from "next";
import { cookies } from "next/headers";
import { META_DISCOVERED_COOKIE } from "@/app/api/meta/oauth/callback/route";
import { MetaConnectionPanel } from "@/components/campaigns/meta-connection-panel";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { serverEnv } from "@/lib/env";
import { resolveFlags } from "@/lib/flags";
import { buildSimulatedDiscoveredAssets, type DiscoveredMetaAssets } from "@/lib/meta-oauth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadMetaConnection } from "@/server/campaigns-data";
import { getAppContext } from "@/server/context";
import { readDiscovery } from "@/server/meta-discovery";

export const metadata: Metadata = { title: "Conexões Meta" };

type PageProps = {
  searchParams: Promise<{ oauth?: string }>;
};

export default async function ConnectionsPage({ searchParams }: PageProps) {
  const ctx = await getAppContext();
  const env = serverEnv();
  const flags = resolveFlags(env);
  const { oauth } = await searchParams;

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
  const [connection, bizRes, jar] = await Promise.all([
    loadMetaConnection(ctx.organization.id),
    supabase
      .from("businesses")
      .select("name, whatsapp_e164")
      .eq("organization_id", ctx.organization.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    cookies(),
  ]);

  const biz = bizRes.data as { name: string; whatsapp_e164: string | null } | null;
  const businessName = biz?.name ?? ctx.organization.name;
  const defaultWhatsapp = biz?.whatsapp_e164 ?? null;
  const canManage = ctx.organization.role === "owner" || ctx.organization.role === "admin";
  const hasRealMetaOAuthApp = Boolean(env.META_APP_ID && env.META_APP_SECRET);

  let discoveredAssets: DiscoveredMetaAssets | null = null;
  if (oauth === "simulated") {
    discoveredAssets = buildSimulatedDiscoveredAssets(businessName, defaultWhatsapp);
  } else {
    discoveredAssets = readDiscovery(jar.get(META_DISCOVERED_COOKIE)?.value, ctx.organization.id);
  }

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
        hasRealMetaOAuthApp={hasRealMetaOAuthApp}
        oauthStatus={oauth ?? null}
        discoveredAssets={discoveredAssets}
        defaultBusinessName={businessName}
        defaultWhatsapp={defaultWhatsapp}
      />
    </div>
  );
}
