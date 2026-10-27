"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { checkVideoJob, removeVideo, startAvatarVideo } from "@/server/videos";
import { JOB_ERRORS } from "./generation-controls";

const VIDEO_ERRORS: Record<string, string> = {
  ...JOB_ERRORS,
  moderated: "O serviço de vídeo recusou a foto ou o roteiro. Tente outra foto ou outro texto.",
  external_failed: "O serviço de vídeo não conseguiu gerar este vídeo.",
  external_unavailable: "O serviço de vídeo não respondeu.",
  invalid_output: "O vídeo veio em um formato que não conseguimos usar.",
};

type Props = {
  creativeId: string;
  defaultScript: string;
  maxScript: number;
  /** voice_id da ElevenLabs (não são segredo). */
  voices: string[];
  enabled: boolean;
  videoSrc: string | null;
  job: { id: string; status: string; error_code: string | null } | null;
};

/** Consulta a cada 10 s; a própria consulta conclui o vídeo quando a ElevenLabs termina. */
function VideoProgress({ jobId }: { jobId: string }) {
  const router = useRouter();
  useEffect(() => {
    let stop = false;
    let t: ReturnType<typeof setTimeout>;
    const tick = async () => {
      if (stop) return;
      const res = await checkVideoJob(jobId);
      if (res.ok && (res.data.status === "succeeded" || res.data.status === "failed")) router.refresh();
      else t = setTimeout(tick, 10_000);
    };
    t = setTimeout(tick, 5_000);
    return () => {
      stop = true;
      clearTimeout(t);
    };
  }, [jobId, router]);

  return (
    <div role="status" aria-live="polite" className="flex items-center gap-3 text-[15px] text-ink-soft">
      <span aria-hidden className="size-5 animate-spin rounded-full border-2 border-brand border-t-transparent" />
      Gerando o vídeo. Leva alguns minutos; pode sair desta página e voltar depois.
    </div>
  );
}

/** Vídeo com avatar falante: foto do rosto + roteiro + voz (ADR 0008). */
export function VideoSection({ creativeId, defaultScript, maxScript, voices, enabled, videoSrc, job }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [script, setScript] = useState(defaultScript.slice(0, maxScript));
  const running = job?.status === "running" || job?.status === "queued";
  const failed = job?.status === "failed" ? job : null;

  const run = (
    fn: () => Promise<{ ok: boolean; error?: { message: string; field_errors?: Record<string, string[]> } }>,
  ) =>
    start(async () => {
      setError(null);
      setErrors({});
      const res = await fn();
      if (!res.ok && res.error) {
        setErrors(res.error.field_errors ?? {});
        setError(res.error.message);
        return;
      }
      router.refresh();
    });
  const fieldError = (k: string) =>
    errors[k]?.[0] ? (
      <p role="alert" className="text-sm text-danger">
        {errors[k][0]}
      </p>
    ) : null;

  return (
    <Card className="mt-8 flex flex-col gap-4 p-6">
      <section aria-labelledby="video-title" className="flex flex-col gap-4">
        <div>
          <h2 id="video-title" className="font-display text-xl font-bold">
            Vídeo com avatar
          </h2>
          <p className="mt-1 text-sm text-ink-soft">
            Uma pessoa real (você ou alguém autorizado) fala o roteiro a partir de uma foto. Com vídeo, esta peça é
            publicada como vídeo na Meta, com a arte atual como capa.
          </p>
        </div>

        {videoSrc && (
          <video src={videoSrc} controls playsInline className="max-h-[480px] w-full rounded-xl bg-black">
            <track kind="captions" />
          </video>
        )}

        {running && job ? (
          <VideoProgress jobId={job.id} />
        ) : (
          failed && <Alert tone="danger">{VIDEO_ERRORS[failed.error_code ?? ""] ?? VIDEO_ERRORS.internal}</Alert>
        )}

        {!enabled ? (
          <p className="text-sm text-ink-faint">O vídeo com avatar ainda não está ativado nesta conta.</p>
        ) : (
          <form className="flex flex-col gap-3" action={(fd) => run(() => startAvatarVideo(fd))}>
            <input type="hidden" name="creative_id" value={creativeId} />
            <label className="flex flex-col gap-1.5 text-sm font-semibold">
              Roteiro (o que o avatar vai falar)
              <textarea
                name="script"
                value={script}
                onChange={(e) => setScript(e.target.value)}
                maxLength={maxScript}
                rows={4}
                required
                aria-invalid={Boolean(errors.script)}
                className="w-full rounded-xl border border-line-strong bg-surface px-3.5 py-2.5 text-[15px] font-normal"
              />
              <span className="font-normal text-ink-faint">
                {script.length}/{maxScript} caracteres (cerca de 40 segundos). Sem preço, desconto ou promessa que você
                não confirmou.
              </span>
            </label>
            {fieldError("script")}

            <label className="flex flex-col gap-1.5 text-sm font-semibold">
              Voz
              {/* ponytail: rótulo "Voz N"; buscar nome e amostra na ElevenLabs se o cliente pedir para ouvir antes. */}
              <select
                name="voice_id"
                className="w-full rounded-xl border border-line-strong bg-surface px-3.5 py-2.5 text-[15px] font-normal"
              >
                {voices.map((v, i) => (
                  <option key={v} value={v}>
                    Voz {i + 1}
                  </option>
                ))}
              </select>
            </label>
            {fieldError("voice_id")}

            <label className="flex flex-col gap-1.5 text-sm font-semibold">
              Foto do rosto (JPG ou PNG, até 5 MB)
              <input
                type="file"
                name="file"
                accept="image/jpeg,image/png"
                required
                className="text-sm font-normal file:mr-3 file:rounded-lg file:border file:border-line-strong file:bg-surface file:px-3 file:py-2 file:text-sm file:font-medium"
              />
              <span className="font-normal text-ink-faint">De frente, rosto inteiro visível, boa luz.</span>
            </label>
            {fieldError("file")}

            <label className="flex items-start gap-2.5 text-sm">
              <input type="checkbox" name="rights" required className="mt-0.5 size-4 accent-[var(--color-brand)]" />
              Tenho direito de usar esta foto em anúncios.
            </label>
            {fieldError("rights")}
            <label className="flex items-start gap-2.5 text-sm">
              <input type="checkbox" name="likeness" required className="mt-0.5 size-4 accent-[var(--color-brand)]" />O
              rosto é meu, ou a pessoa da foto autorizou por escrito que a imagem e uma voz gerada por IA sejam usadas
              em anúncios.
            </label>
            {fieldError("likeness")}

            <p className="text-sm text-ink-faint">Cada vídeo consome 1 crédito de vídeo do mês.</p>
            <div className="flex flex-wrap gap-3">
              <Button type="submit" variant="secondary" disabled={pending || running}>
                {videoSrc ? "Gerar outro vídeo" : "Gerar vídeo"}
              </Button>
              {videoSrc && (
                <Button
                  type="button"
                  variant="ghost"
                  disabled={pending || running}
                  onClick={() => run(() => removeVideo(creativeId))}
                >
                  Tirar vídeo da peça
                </Button>
              )}
            </div>
          </form>
        )}
        {error && <Alert tone="danger">{error}</Alert>}
      </section>
    </Card>
  );
}
