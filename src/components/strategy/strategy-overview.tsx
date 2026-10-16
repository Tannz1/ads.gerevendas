import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { FORMAT_SPECS } from "@/contracts/creative";
import type { CreativeFormat, Strategy } from "@/contracts/strategy";

function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={`text-xs font-semibold tracking-wider text-ink-faint uppercase ${className ?? ""}`}>{children}</p>
  );
}

export function FormatGlyph({ format, className }: { format: CreativeFormat; className?: string }) {
  const tall = format === "stories_9x16";
  return (
    <svg aria-hidden viewBox="0 0 16 20" className={className ?? "h-4 w-3.5"} fill="none" stroke="currentColor">
      <rect
        x={tall ? 4 : 2}
        y={tall ? 1 : 2.5}
        width={tall ? 8.5 : 12}
        height={tall ? 18 : 15}
        rx="2"
        strokeWidth="1.6"
      />
    </svg>
  );
}

/** Estratégia gerada: resumo, posicionamento, público, mensagens, canais, formatos e cuidados. */
export function StrategyOverview({ strategy }: { strategy: Strategy }) {
  return (
    <Card className="overflow-hidden">
      <div className="grid lg:grid-cols-[1.45fr_1fr]">
        <div className="min-w-0 p-6 sm:p-8">
          <Eyebrow>Resumo</Eyebrow>
          <p className="mt-2.5 text-[17px] leading-relaxed text-ink">{strategy.summary}</p>

          <figure className="mt-6 rounded-xl border border-brand/15 bg-brand-soft/70 px-5 py-4">
            <figcaption className="text-xs font-semibold tracking-wider text-brand-strong uppercase">
              Posicionamento
            </figcaption>
            <blockquote className="mt-1.5 font-display text-lg leading-snug font-bold text-ink">
              {strategy.positioning}
            </blockquote>
          </figure>

          <section className="mt-7" aria-labelledby="strategy-messages">
            <h3 id="strategy-messages" className="font-display text-base font-bold">
              Mensagens-chave
            </h3>
            <ol className="mt-3 grid gap-2.5">
              {strategy.key_messages.map((message, i) => (
                <li key={i} className="flex items-start gap-3 text-[15px]">
                  <span
                    aria-hidden
                    className="mt-px grid size-6 shrink-0 place-items-center rounded-full bg-ink text-xs font-bold text-white"
                  >
                    {i + 1}
                  </span>
                  <span className="min-w-0">{message}</span>
                </li>
              ))}
            </ol>
          </section>
        </div>

        <aside className="min-w-0 border-t border-line bg-canvas/70 p-6 sm:p-8 lg:border-t-0 lg:border-l">
          <section aria-labelledby="strategy-audience">
            <h3 id="strategy-audience" className="font-display text-base font-bold">
              Quem é o público
            </h3>
            <ul className="mt-3 grid gap-2.5">
              {strategy.audience_insights.map((insight, i) => (
                <li key={i} className="flex items-start gap-2.5 text-[15px] text-ink-soft">
                  <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-brand" />
                  <span className="min-w-0">{insight}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="mt-7" aria-labelledby="strategy-channels">
            <h3 id="strategy-channels" className="font-display text-base font-bold">
              Onde anunciar
            </h3>
            <p className="mt-2 text-[15px] leading-relaxed text-ink-soft">{strategy.channel_note}</p>
            <p className="mt-4 text-sm font-semibold">Formatos recomendados</p>
            <ul className="mt-2 flex flex-wrap gap-2">
              {strategy.recommended_formats.map((format) => (
                <li
                  key={format}
                  className="inline-flex items-center gap-1.5 rounded-full border border-line-strong bg-surface px-3 py-1 text-sm font-semibold"
                >
                  <FormatGlyph format={format} />
                  {FORMAT_SPECS[format].label}
                </li>
              ))}
            </ul>
          </section>
        </aside>
      </div>

      {strategy.cautions.length > 0 && (
        <div className="border-t border-line px-6 py-5 sm:px-8">
          <div role="note" className="flex gap-3 rounded-xl border border-accent/50 bg-accent-soft px-4 py-3.5">
            <svg
              aria-hidden
              viewBox="0 0 24 24"
              className="mt-0.5 size-5 shrink-0 text-warning"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 9v4M12 17h.01M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z" />
            </svg>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-warning">Cuidados antes de usar</p>
              <ul className="mt-1 grid gap-1 text-sm text-ink-soft">
                {strategy.cautions.map((caution, i) => (
                  <li key={i}>{caution}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
