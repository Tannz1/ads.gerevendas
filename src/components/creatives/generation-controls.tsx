"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { generateStrategy, getJobStatus } from "@/server/creatives";

export const JOB_ERRORS: Record<string, string> = {
  facts_violation:
    "A IA sugeriu algo que você não confirmou no cadastro (preço, desconto ou promessa). Nada foi salvo.",
  invalid_output: "A resposta da IA veio incompleta. Nada foi salvo.",
  external_unavailable: "O serviço de IA não respondeu.",
  timeout: "A geração demorou demais e foi interrompida.",
  internal: "Não conseguimos salvar o resultado.",
};

/** Pede a geração e atualiza a página (que passa a mostrar o progresso). */
export function GenerateButton({ briefId, label }: { briefId: string; label: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-col items-start gap-3">
      <Button
        size="lg"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError(null);
            const res = await generateStrategy(briefId);
            if (!res.ok) setError(`${res.error.message} (código ${res.error.correlation_id.slice(0, 8)})`);
            else router.refresh();
          })
        }
      >
        {pending ? "Começando…" : label}
      </Button>
      {error && (
        <Alert tone="danger" className="max-w-xl">
          {error}
        </Alert>
      )}
    </div>
  );
}

/** Acompanha o job a cada 2 s e atualiza a página quando termina. */
export function JobProgress({ jobId }: { jobId: string }) {
  const router = useRouter();
  useEffect(() => {
    let stop = false;
    const tick = async () => {
      if (stop) return;
      const res = await getJobStatus(jobId);
      if (res.ok && (res.data.status === "succeeded" || res.data.status === "failed")) router.refresh();
      else setTimeout(tick, 2000);
    };
    const t = setTimeout(tick, 1500);
    return () => {
      stop = true;
      clearTimeout(t);
    };
  }, [jobId, router]);

  return (
    <div role="status" aria-live="polite" className="flex items-center gap-3 text-[15px] text-ink-soft">
      <span aria-hidden className="size-5 animate-spin rounded-full border-2 border-brand border-t-transparent" />
      Criando a estratégia e as 5 peças. Leva menos de um minuto.
    </div>
  );
}
