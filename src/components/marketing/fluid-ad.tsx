"use client";

import { useEffect, useRef, useState } from "react";
import { BROWSER_FONTS } from "@/components/creatives/ad-preview";
import { AdTemplate, type AdTemplateProps } from "@/components/creatives/ad-template";
import { FORMATS } from "@/contracts/creatives";
import { cn } from "@/lib/cn";

/**
 * A peça REAL do editor (`AdTemplate`, 1080 px) reduzida para caber na largura do contêiner.
 * Diferente de `AdPreview` (largura fixa), serve a grades fluidas da landing. Até medir a largura,
 * mostra só a cor de fundo da peça.
 */
export function FluidAd({
  label,
  className,
  ...props
}: Omit<AdTemplateProps, "fonts"> & { label?: string; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const f = FORMATS[props.format];

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cn("relative w-full overflow-hidden", className)}
      style={{ aspectRatio: `${f.width} / ${f.height}`, backgroundColor: props.content.colors.background }}
    >
      <div
        aria-hidden
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: f.width,
          transform: `scale(${width / f.width})`,
          transformOrigin: "top left",
          visibility: width ? "visible" : "hidden",
        }}
      >
        <AdTemplate {...props} fonts={BROWSER_FONTS} />
      </div>
    </div>
  );
}
