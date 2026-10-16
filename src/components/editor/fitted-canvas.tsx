"use client";

import { useEffect, useRef, useState } from "react";
import { CreativeCanvas } from "@/components/creative";
import { FORMAT_SPECS, type CreativeDesign, type DesignIssue } from "@/contracts/creative";
import { cn } from "@/lib/cn";

/** Largura (px) do elemento, medida com ResizeObserver; null até a primeira medição. */
export function useElementWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState<number | null>(null);
  useEffect(() => {
    const node = ref.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      const next = Math.floor(entries[0]?.contentRect.width ?? 0);
      // Largura 0 = rota oculta (Activity) ou fora do layout: mantém a última medida.
      if (next > 0) setWidth((prev) => (prev === next ? prev : next));
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

/**
 * Prévia da peça que ocupa a largura disponível, limitada por `maxWidth`, `maxHeight` (px) e
 * `boxAspect` (altura/largura da caixa onde a peça precisa caber, ex.: 1.25 para uma vitrine 4:5).
 * Antes da medição mostra uma caixa na proporção do formato, sem salto de layout.
 */
export function FittedCanvas({
  design,
  maxWidth,
  maxHeight,
  boxAspect,
  showSafeArea,
  onIssues,
  className,
  canvasClassName,
}: {
  design: CreativeDesign;
  maxWidth: number;
  maxHeight?: number;
  boxAspect?: number;
  showSafeArea?: boolean;
  onIssues?: (issues: DesignIssue[]) => void;
  className?: string;
  canvasClassName?: string;
}) {
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const spec = FORMAT_SPECS[design.format];
  const ratio = spec.width / spec.height;
  let display: number | null = null;
  if (width) {
    display = Math.min(width, maxWidth);
    if (maxHeight) display = Math.min(display, maxHeight * ratio);
    if (boxAspect) display = Math.min(display, width * boxAspect * ratio);
    display = Math.max(80, Math.floor(display));
  }
  return (
    <div ref={ref} className={cn("flex w-full justify-center", className)}>
      {display ? (
        <CreativeCanvas
          design={design}
          displayWidth={display}
          showSafeArea={showSafeArea}
          onIssues={onIssues}
          className={canvasClassName}
        />
      ) : (
        <div
          aria-hidden
          className={cn("w-full animate-pulse bg-surface-muted", canvasClassName)}
          style={{ maxWidth, aspectRatio: `${spec.width} / ${spec.height}` }}
        />
      )}
    </div>
  );
}
