import type { Metadata } from "next";
import { CreativesScreen } from "@/components/editor/creatives-grid";
import { DemoCreativesPage } from "@/components/editor/demo-creatives";
import { ErrorNotice, PageHeader } from "@/components/strategy/page-states";
import { getAppContext } from "@/server/context";
import { listCreatives } from "@/server/creatives";
import { CREATIVES_LIST_LIMIT } from "@/server/strategy-data";

export const metadata: Metadata = { title: "Criativos" };

export default async function CreativesPage() {
  const ctx = await getAppContext();
  if (ctx.mode === "demo") return <DemoCreativesPage />;
  if (!ctx.organization) return null;

  const res = await listCreatives();
  if (!res.ok) {
    return (
      <div className="mx-auto max-w-6xl">
        <PageHeader title="Criativos" />
        <ErrorNotice
          className="mt-8"
          title={res.error.code === "forbidden" ? "Sem acesso às peças" : "Não foi possível carregar as peças"}
          message={res.error.message}
          correlationId={res.error.correlation_id}
        />
      </div>
    );
  }

  return (
    <CreativesScreen
      items={res.data.map((c) => ({ id: c.id, design: c.design, status: c.status, updated_at: c.updated_at }))}
      limitReached={res.data.length >= CREATIVES_LIST_LIMIT}
    />
  );
}
