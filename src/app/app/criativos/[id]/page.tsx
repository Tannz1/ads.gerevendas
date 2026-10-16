import type { Metadata } from "next";
import { ctaOptionsFor } from "@/components/editor/cta";
import { DemoCreativeEditorPage } from "@/components/editor/demo-editor";
import { SupabaseCreativeEditor } from "@/components/editor/supabase-editor";
import { EmptyState, ErrorNotice, ImagesIcon, PageHeader } from "@/components/strategy/page-states";
import { getAppContext } from "@/server/context";
import { getCreative } from "@/server/creatives";
import { readCreativeObjective } from "@/server/strategy-page";

export const metadata: Metadata = { title: "Editar peça" };

function NotFoundState() {
  return (
    <EmptyState
      icon={<ImagesIcon className="size-7" />}
      title="Peça não encontrada"
      action={{ href: "/app/criativos", label: "Ver criativos" }}
    >
      Ela pode ter sido apagada ou o link está incompleto.
    </EmptyState>
  );
}

export default async function CreativeEditorPage({ params }: PageProps<"/app/criativos/[id]">) {
  const { id } = await params;
  const ctx = await getAppContext();
  if (ctx.mode === "demo") return <DemoCreativeEditorPage id={id} />;
  if (!ctx.organization) return null;

  const res = await getCreative(id);
  if (!res.ok) {
    if (res.error.code === "not_found" || res.error.code === "validation_failed") return <NotFoundState />;
    return (
      <div className="mx-auto max-w-6xl">
        <PageHeader title="Editar peça" />
        <ErrorNotice
          className="mt-8"
          title={res.error.code === "forbidden" ? "Sem acesso a esta peça" : "Não foi possível abrir a peça"}
          message={res.error.message}
          correlationId={res.error.correlation_id}
        />
      </div>
    );
  }

  const { creative, offer } = res.data;
  const objective = await readCreativeObjective(ctx.organization.id, creative.concept_id);
  return (
    <SupabaseCreativeEditor
      key={`${creative.id}:${creative.version}`}
      creative={{
        id: creative.id,
        status: creative.status,
        version: creative.version,
        design: creative.design,
        updated_at: creative.updated_at,
        approved_at: creative.approved_at,
      }}
      offer={offer}
      ctaOptions={ctaOptionsFor(objective, creative.design.cta)}
    />
  );
}
