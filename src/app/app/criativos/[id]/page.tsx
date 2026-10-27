import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { CreativeEditor } from "@/components/creatives/creative-editor";
import { VideoSection } from "@/components/creatives/video-section";
import { Badge } from "@/components/ui/badge";
import { TEMPLATE_LABELS, type AngleKey } from "@/contracts/creatives";
import { formatCents } from "@/lib/money";
import { getAppContext } from "@/server/context";
import { serverEnv } from "@/lib/env";
import { MAX_SCRIPT_CHARS } from "@/server/ai/elevenlabs";
import { selectImageProvider, selectVoiceVideoProvider } from "@/server/ai/provider";
import { loadCreative, loadImageJob, loadVideoJob, loadVideoUrl } from "@/server/creatives-data";

export const metadata: Metadata = { title: "Editar peça" };

export default async function CreativeEditorPage({ params }: PageProps<"/app/criativos/[id]">) {
  const { id } = await params;
  const ctx = await getAppContext();
  if (ctx.mode !== "supabase" || !z.uuid().safeParse(id).success) notFound();
  const [view, imageJob, videoJob] = await Promise.all([loadCreative(id), loadImageJob(id), loadVideoJob(id)]);
  if (!view) notFound();
  const env = serverEnv();
  const videoSrc = view.video ? await loadVideoUrl(view.video.path) : null;

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
        aiImagesEnabled={selectImageProvider(env) !== null}
        imageJob={imageJob}
      />
      <VideoSection
        creativeId={view.id}
        defaultScript={`${view.content.headline}. ${view.content.body}`}
        maxScript={MAX_SCRIPT_CHARS}
        voices={env.ELEVENLABS_VOICE_IDS}
        enabled={selectVoiceVideoProvider(env) !== null && env.ELEVENLABS_VOICE_IDS.length > 0}
        videoSrc={videoSrc}
        job={videoJob}
      />
    </div>
  );
}
