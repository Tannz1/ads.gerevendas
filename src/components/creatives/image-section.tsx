"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { generateImage, removeImage, uploadPhoto } from "@/server/creatives";
import { JOB_ERRORS, JobProgress } from "./generation-controls";

type Props = {
  creativeId: string;
  hasImage: boolean;
  aiEnabled: boolean;
  job: { id: string; status: string; error_code: string | null } | null;
};

/** Imagem de fundo da peça: foto do cliente ou gerada pela IA. Trocar não mexe no texto. */
export function ImageSection({ creativeId, hasImage, aiEnabled, job }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const running = job?.status === "running" || job?.status === "queued";
  const failed = job?.status === "failed" ? job : null;

  const run = (
    fn: () => Promise<{ ok: boolean; error?: { message: string; field_errors?: Record<string, string[]> } }>,
  ) =>
    start(async () => {
      setError(null);
      const res = await fn();
      if (!res.ok && res.error) {
        const field = Object.values(res.error.field_errors ?? {})[0]?.[0];
        setError(field ?? res.error.message);
        return;
      }
      router.refresh();
    });

  return (
    <section aria-labelledby="img-title" className="flex flex-col gap-4 border-t border-line pt-5">
      <h3 id="img-title" className="text-sm font-semibold">
        Imagem de fundo
      </h3>

      {running && job ? (
        <JobProgress jobId={job.id} label="Gerando a imagem. Pode levar até um minuto." />
      ) : (
        failed && (
          <Alert tone="danger">
            {JOB_ERRORS[failed.error_code ?? ""] ?? JOB_ERRORS.internal} O texto da peça não foi alterado.
          </Alert>
        )
      )}

      <form className="flex flex-col gap-3" action={(fd) => run(() => uploadPhoto(fd))} aria-describedby="photo-hint">
        <input type="hidden" name="creative_id" value={creativeId} />
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Foto do seu negócio (JPG ou PNG, até 5 MB)
          <input
            type="file"
            name="file"
            accept="image/jpeg,image/png"
            required
            className="text-sm file:mr-3 file:rounded-lg file:border file:border-line-strong file:bg-surface file:px-3 file:py-2 file:text-sm file:font-medium"
          />
        </label>
        <label className="flex items-start gap-2.5 text-sm">
          <input type="checkbox" name="rights" required className="mt-0.5 size-4 accent-[var(--color-brand)]" />
          Tenho direito de usar esta imagem em anúncios (foto própria ou com autorização).
        </label>
        <p id="photo-hint" className="text-sm text-ink-faint">
          Fotos reais do seu produto ou serviço costumam funcionar melhor que imagens geradas.
        </p>
        <Button type="submit" variant="secondary" disabled={pending || running}>
          Enviar foto
        </Button>
      </form>

      <div className="flex flex-wrap gap-3">
        <Button
          variant="secondary"
          disabled={pending || running || !aiEnabled}
          onClick={() => run(() => generateImage(creativeId))}
        >
          {hasImage ? "Gerar outra imagem com IA" : "Gerar imagem com IA"}
        </Button>
        {hasImage && (
          <Button variant="ghost" disabled={pending || running} onClick={() => run(() => removeImage(creativeId))}>
            Remover imagem
          </Button>
        )}
      </div>
      {!aiEnabled && (
        <p className="text-sm text-ink-faint">A geração de imagens com IA ainda não está ativada nesta conta.</p>
      )}
      {error && <Alert tone="danger">{error}</Alert>}
    </section>
  );
}
