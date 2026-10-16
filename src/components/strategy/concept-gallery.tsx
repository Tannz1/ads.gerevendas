"use client";

import { useId, useLayoutEffect, useMemo, useState } from "react";
import { FittedCanvas } from "@/components/editor/fitted-canvas";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FORMAT_SPECS } from "@/contracts/creative";
import { CONCEPT_ANGLE_LABELS, CREATIVE_FORMATS, type Concept, type CreativeFormat } from "@/contracts/strategy";
import { designFromConcept, type DesignFacts } from "@/lib/creative/defaults";
import { ErrorNotice } from "./page-states";
import { FormatGlyph } from "./strategy-overview";

/** Falha ao criar a peça (mensagem já em português + correlation id quando houver). */
export type CreateFailure = { message: string; correlation_id?: string | null };
/** Cria a peça e navega para o editor; devolve a falha (ou null quando deu certo). */
export type CreatePiece = (conceptKey: string, format: CreativeFormat) => Promise<CreateFailure | null>;

export type GalleryConcept = { key: string; concept: Concept };

export function ConceptGallery({
  concepts,
  facts,
  onCreate,
}: {
  concepts: GalleryConcept[];
  facts: DesignFacts;
  onCreate: CreatePiece;
}) {
  return (
    <section aria-labelledby="concepts-heading" className="@container">
      <div className="flex flex-col gap-1.5">
        <h2 id="concepts-heading" className="font-display text-2xl font-bold tracking-tight">
          Conceitos de anúncio
        </h2>
        <p className="max-w-2xl text-[15px] text-ink-soft">
          {concepts.length} propostas com ângulos diferentes. Escolha uma e crie a peça no formato que preferir; você
          ajusta título, texto, cores e modelo no editor.
        </p>
      </div>
      <ul className="mt-6 grid gap-6 @2xl:grid-cols-2 @5xl:grid-cols-3">
        {concepts.map((item, i) => (
          <li key={item.key} className="flex">
            <ConceptCard index={i} item={item} facts={facts} onCreate={onCreate} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function ConceptCard({
  index,
  item,
  facts,
  onCreate,
}: {
  index: number;
  item: GalleryConcept;
  facts: DesignFacts;
  onCreate: CreatePiece;
}) {
  const { concept } = item;
  const id = useId();
  const [creating, setCreating] = useState<CreativeFormat | null>(null);
  const [failure, setFailure] = useState<CreateFailure | null>(null);
  const preview = useMemo(() => designFromConcept(concept, facts, "feed_4x5"), [concept, facts]);

  // A rota fica oculta (Activity) ao abrir o editor: ao voltar, os botões não podem seguir em "Criando…".
  useLayoutEffect(() => () => setCreating(null), []);

  async function create(format: CreativeFormat) {
    setCreating(format);
    setFailure(null);
    try {
      const result = await onCreate(item.key, format);
      if (result) {
        setFailure(result);
        setCreating(null);
      }
      // Sucesso: a navegação para o editor desmonta o cartão; o botão fica em "Criando…" até lá.
    } catch {
      setFailure({ message: "Sem conexão com o servidor. Verifique a internet e tente de novo." });
      setCreating(null);
    }
  }

  return (
    <Card className="flex w-full flex-col overflow-hidden" aria-labelledby={`${id}-title`} role="article">
      <div
        className="relative px-5 pt-12 pb-6 sm:px-7"
        style={{
          background: `linear-gradient(165deg, color-mix(in srgb, ${preview.brand_color} 16%, var(--canvas)) 0%, var(--surface-muted) 100%)`,
        }}
      >
        <div className="absolute top-3.5 right-4 left-4 flex items-center justify-between gap-2">
          <span className="rounded-full bg-surface/90 px-2.5 py-1 text-xs font-semibold text-ink shadow-sm">
            {CONCEPT_ANGLE_LABELS[concept.angle]}
          </span>
          <span className="text-xs font-semibold text-ink-soft">Conceito {index + 1}</span>
        </div>
        <FittedCanvas
          design={preview}
          maxWidth={340}
          canvasClassName="rounded-xl shadow-[0_18px_40px_-18px_rgb(16_24_40/0.45)] ring-1 ring-black/5"
        />
      </div>

      <div className="flex flex-1 flex-col p-5 sm:p-6">
        <h3 id={`${id}-title`} className="font-display text-xl leading-snug font-bold tracking-tight">
          {concept.title}
        </h3>
        <p className="mt-2 text-sm leading-relaxed text-ink-soft">{concept.rationale}</p>

        <div className="mt-5 rounded-xl border border-line bg-canvas px-4 py-3.5">
          <p className="text-xs font-semibold tracking-wider text-ink-faint uppercase">Texto do anúncio</p>
          <p className="mt-1.5 text-[15px] leading-relaxed break-words">{concept.primary_text}</p>
          <p className="mt-3 flex flex-wrap items-center gap-2 text-sm">
            <span className="text-ink-faint">Botão</span>
            <span className="rounded-full border border-line-strong bg-surface px-2.5 py-0.5 font-semibold">
              {concept.cta}
            </span>
          </p>
        </div>

        <div className="mt-auto pt-5">
          <p id={`${id}-create`} className="text-sm font-semibold">
            Criar peça
          </p>
          <div role="group" aria-labelledby={`${id}-create ${id}-title`} className="mt-2 grid grid-cols-2 gap-2">
            {CREATIVE_FORMATS.map((format) => (
              <Button
                key={format}
                type="button"
                variant={format === "feed_4x5" ? "primary" : "secondary"}
                disabled={creating !== null}
                aria-busy={creating === format}
                onClick={() => create(format)}
                className="px-3"
              >
                <FormatGlyph format={format} />
                {creating === format ? "Criando…" : FORMAT_SPECS[format].label}
              </Button>
            ))}
          </div>
          {failure && (
            <ErrorNotice
              title="Não foi possível criar a peça"
              message={failure.message}
              correlationId={failure.correlation_id}
              className="mt-3"
            />
          )}
        </div>
      </div>
    </Card>
  );
}
