import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { GenerateButton, JOB_ERRORS, JobProgress } from "@/components/creatives/generation-controls";
import { LaunchFlow, type LaunchStep } from "@/components/simple/launch-flow";
import { ProductThumb } from "@/components/simple/product-card";
import { ScreenHeader, SimpleShell } from "@/components/simple/shell";
import { reachFromRadius } from "@/contracts/products";
import { serverEnv } from "@/lib/env";
import { resolveFlags } from "@/lib/flags";
import { getAppContext } from "@/server/context";
import { resolveMetaBusinessMode } from "@/server/meta/mode";
import { loadProductFlow } from "@/server/products-data";

export const metadata: Metadata = { title: "Meu anúncio" };

const STEPS: LaunchStep[] = ["previa", "regiao", "investimento", "publicar"];

export default async function ProductFlowPage({ params, searchParams }: PageProps<"/app/anuncios/[id]">) {
  const { id } = await params;
  const { etapa } = await searchParams;
  const ctx = await getAppContext();
  if (ctx.mode !== "supabase" || !ctx.organization || !z.uuid().safeParse(id).success) notFound();

  const flow = await loadProductFlow(ctx.organization.id, id);
  if (!flow) notFound();
  if (flow.campaign) redirect(`/app/anuncios/${id}/resultados`);

  const { job, strategy, creatives } = flow.creatives;
  if (!strategy || creatives.length === 0) {
    const running = job?.status === "running" || job?.status === "queued";
    const failed = job?.status === "failed";
    return (
      <SimpleShell tabs={false}>
        <ScreenHeader title={running ? "Criando seu anúncio…" : "Vamos criar seu anúncio"} back="/app/anuncios" />
        <div className="flex items-center gap-4">
          <ProductThumb url={flow.photo_url} name={flow.name} className="size-20" />
          <p className="font-display text-lg font-bold">{flow.name}</p>
        </div>
        <div className="mt-8">
          {running && job ? (
            <JobProgress
              jobId={job.id}
              label="Estamos escrevendo 5 versões do anúncio com a sua foto. Leva cerca de um minuto."
            />
          ) : (
            <div className="space-y-4">
              {failed && (
                <p role="alert" className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">
                  {JOB_ERRORS[job?.error_code ?? ""] ?? "A criação não terminou."} Tente de novo.
                </p>
              )}
              <GenerateButton briefId={flow.brief_id} label={failed ? "Tentar de novo" : "Criar as versões"} />
            </div>
          )}
        </div>
      </SimpleShell>
    );
  }

  const env = serverEnv();
  const flags = resolveFlags(env);
  const simulated = !(flags.realPublishing && resolveMetaBusinessMode(env, flags).kind === "real");
  const role = ctx.organization.role;
  const step = STEPS.includes(etapa as LaunchStep) ? (etapa as LaunchStep) : "previa";
  // Só passa da prévia com as versões aprovadas (editar uma peça volta ela para rascunho).
  const initialStep = creatives.every((c) => c.status === "approved") ? step : "previa";

  return (
    <SimpleShell tabs={false}>
      <LaunchFlow
        initialStep={initialStep}
        briefId={flow.brief_id}
        strategyId={strategy.id}
        creatives={creatives}
        product={{
          name: flow.name,
          price_cents: flow.price_cents,
          currency: flow.currency,
          highlights: flow.highlights,
          photo_url: flow.photo_url,
        }}
        business={flow.business}
        initialReach={reachFromRadius(flow.radius_km)}
        canApprove={role === "owner" || role === "admin"}
        isOwner={role === "owner"}
        meta={flow.meta}
        simulated={simulated}
      />
    </SimpleShell>
  );
}
