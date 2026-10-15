"use client";

import { useEffect, useRef } from "react";
import { FORMAT_SPECS, type CreativeDesign, type DesignIssue } from "@/contracts/creative";
import { formatCents } from "@/lib/money";
import { CreativeArtwork, type ArtworkFonts } from "./artwork";

/**
 * Famílias do editor: os mesmos arquivos de `public/fonts` usados no PNG, carregados por
 * `src/lib/creative/artwork-fonts.ts` (variáveis aplicadas em `src/app/layout.tsx`).
 */
export const DOM_FONTS: ArtworkFonts = {
  display: "var(--font-artwork-display), system-ui, sans-serif",
  body: "var(--font-artwork-body), system-ui, sans-serif",
};

const FIT_MESSAGES: Record<string, DesignIssue> = {
  headline: { field: "headline", message: "O título não cabe na peça. Encurte o texto." },
  body: { field: "body", message: "O texto não cabe na peça. Encurte o texto." },
  cta: { field: "cta", message: "O texto do botão não cabe. Use um texto mais curto." },
  price: { field: "price_cents", message: "O preço não cabe na peça neste modelo. Experimente outro modelo." },
  business_name: {
    field: "business_name",
    message: "O nome do negócio não cabe na peça. Use uma versão mais curta.",
  },
  layout: { field: "layout", message: "Os textos não cabem na área segura da peça. Encurte algum deles." },
};

/** Mede as caixas `data-fit` da arte e devolve um problema por caixa que transborda. */
export function measureFitIssues(root: ParentNode): DesignIssue[] {
  const issues: DesignIssue[] = [];
  const seen = new Set<string>();
  root.querySelectorAll<HTMLElement>("[data-fit]").forEach((el) => {
    const kind = el.dataset.fit ?? "";
    const issue = FIT_MESSAGES[kind];
    if (!issue || seen.has(kind)) return;
    if (el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1) {
      seen.add(kind);
      issues.push({ ...issue });
    }
  });
  return issues;
}

/** Descrição acessível da peça (o desenho em si é decorativo para leitores de tela). */
export function describeDesign(design: CreativeDesign): string {
  const parts = [`Prévia da peça (${FORMAT_SPECS[design.format].label})`, design.headline];
  if (design.body) parts.push(design.body);
  if (design.show_price && design.price_cents !== null) {
    parts.push(`Preço: ${formatCents(design.price_cents, design.currency)}`);
  }
  parts.push(`Botão: ${design.cta}`);
  return parts.join(". ") + ".";
}

export type CreativeCanvasProps = {
  design: CreativeDesign;
  /** Largura exibida em px; a altura segue a proporção do formato. */
  displayWidth: number;
  /** Mostra a área segura (tracejado) e escurece as bordas fora dela. */
  showSafeArea?: boolean;
  /** Recebe os problemas de encaixe medidos no DOM (após carregar as fontes e a cada mudança). */
  onIssues?: (issues: DesignIssue[]) => void;
  className?: string;
};

/**
 * Prévia editável: desenha `CreativeArtwork` no tamanho nativo e reduz com `transform` para
 * `displayWidth` (sem salto de layout: a caixa externa já tem o tamanho final). O mesmo JSX
 * é usado na exportação PNG, então o que se vê aqui é o que será exportado.
 */
export function CreativeCanvas({
  design,
  displayWidth,
  showSafeArea = false,
  onIssues,
  className,
}: CreativeCanvasProps) {
  const spec = FORMAT_SPECS[design.format];
  const scale = displayWidth / spec.width;
  const artRef = useRef<HTMLDivElement>(null);
  const onIssuesRef = useRef(onIssues);
  const designKey = JSON.stringify(design);

  useEffect(() => {
    onIssuesRef.current = onIssues;
  }, [onIssues]);

  useEffect(() => {
    let cancelled = false;
    let frame = 0;
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const node = artRef.current;
        if (cancelled || !node) return;
        onIssuesRef.current?.(measureFitIssues(node));
      });
    };
    const fonts = typeof document !== "undefined" && "fonts" in document ? document.fonts : null;
    if (fonts) {
      // Mede quando as fontes terminarem de carregar (e de novo se outra carga terminar depois).
      fonts.ready.then(measure, measure);
      fonts.addEventListener("loadingdone", measure);
    } else {
      measure();
    }
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      fonts?.removeEventListener("loadingdone", measure);
    };
  }, [designKey]);

  const border = Math.max(2, Math.round(2 / scale));
  return (
    <div
      role="img"
      aria-label={describeDesign(design)}
      className={className}
      style={{
        position: "relative",
        width: displayWidth,
        height: Math.round(spec.height * scale),
        overflow: "hidden",
        flexShrink: 0,
      }}
    >
      <div
        ref={artRef}
        aria-hidden
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: spec.width,
          height: spec.height,
          transform: `scale(${scale})`,
          transformOrigin: "0 0",
          userSelect: "none",
          pointerEvents: "none",
        }}
      >
        <CreativeArtwork design={design} fonts={DOM_FONTS} />
        {showSafeArea ? (
          <div
            data-safe-area=""
            style={{
              position: "absolute",
              top: spec.safe.top,
              left: spec.safe.left,
              right: spec.safe.right,
              bottom: spec.safe.bottom,
              border: `${border}px dashed rgba(236, 72, 153, 0.95)`,
              boxShadow: "0 0 0 4000px rgba(15, 23, 42, 0.28)",
            }}
          />
        ) : null}
      </div>
    </div>
  );
}
