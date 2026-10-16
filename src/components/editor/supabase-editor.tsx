"use client";

import { useRouter } from "next/navigation";
import { useMemo } from "react";
import type { DesignOfferFacts } from "@/components/creative";
import { approveCreative, saveCreative } from "@/server/creatives";
import { CreativeEditor, type EditorBackend, type EditorCreative } from "./creative-editor";

/** Editor no modo Supabase: salva e aprova pelas server actions (RPCs com concorrência otimista). */
export function SupabaseCreativeEditor({
  creative,
  offer,
  ctaOptions,
}: {
  creative: EditorCreative;
  offer: DesignOfferFacts;
  ctaOptions: string[];
}) {
  const router = useRouter();
  const backend = useMemo<EditorBackend>(
    () => ({
      async save(design, version) {
        const res = await saveCreative({ creative_id: creative.id, version, design });
        return res.ok ? { ok: true, data: res.data } : { ok: false, error: res.error };
      },
      async approve(version) {
        const res = await approveCreative({ creative_id: creative.id, version });
        return res.ok ? { ok: true, data: { approved_at: new Date().toISOString() } } : { ok: false, error: res.error };
      },
      // A página usa `id:versão` como chave: dados novos do servidor remontam o editor.
      reload: () => router.refresh(),
    }),
    [creative.id, router],
  );
  return <CreativeEditor creative={creative} offer={offer} ctaOptions={ctaOptions} backend={backend} />;
}
