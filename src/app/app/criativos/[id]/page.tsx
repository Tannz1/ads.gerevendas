import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { CreativeEditor } from "@/components/creatives/creative-editor";
import { Badge } from "@/components/ui/badge";
import { TEMPLATE_LABELS, type AngleKey } from "@/contracts/creatives";
import { formatCents } from "@/lib/money";
import { getAppContext } from "@/server/context";
import { serverEnv } from "@/lib/env";
import { selectImageProvider } from "@/server/ai/provider";
import { loadCreative, loadImageJob } from "@/server/creatives-data";

export const metadata: Metadata = { title: "Editar peça" };

export default async function CreativeEditorPage({ params }: PageProps<"/app/criativos/[id]">) {
  const { id } = await params;
  const ctx = await getAppContext();
  if (ctx.mode !== "supabase" || !z.uuid().safeParse(id).success) notFound();
  const [view, imageJob] = await Promise.all([loadCreative(id), loadImageJob(id)]);
  if (!view) notFound();

  return (
    <div className="mx-auto max-w-6xl">
      <Link href="/app/criativos" className="text-sm font-medium text-ink-soft hover:text-ink">
        ← Criativos
      </Link>
      <div className="mt-2 mb-8 flex flex-wrap items-center gap-3">
        <h1 className="font-display text-3xl font-bold tracking-tight">
          {TEMPLATE_LABELS[view.angle_key as AngleKey]}
        </h1>
        {view.simulated && <Badge tone="demo">Simulação</Badge>}
      </div>
      <CreativeEditor
        id={view.id}
        initial={view.content}
        status={view.status}
        businessName={view.business_name}
        priceLabel={view.price_cents === null ? null : formatCents(view.price_cents, view.currency)}
        imageSrc={view.image_url}
        aiImagesEnabled={selectImageProvider(serverEnv()) !== null}
        imageJob={imageJob}
      />
    </div>
  );
}
