"use client";

import { Children, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Carrossel da LP no celular: arrasta com o dedo, encaixa um item por vez no centro e tem setas e
 * bolinhas de posição. A partir de `desktopFrom`, vira a grade passada em `gridClassName` (sem controles).
 */
export function Carousel({
  label,
  children,
  itemClassName,
  gridClassName,
  desktopFrom = "md",
}: {
  label: string;
  children: ReactNode;
  /** Classes extras do item. A largura no celular é sempre 72vw (centralizado). */
  itemClassName?: string;
  /** Classes da grade no computador, já com o prefixo do breakpoint (ex.: "md:grid-cols-2 lg:grid-cols-4"). */
  gridClassName: string;
  desktopFrom?: "md" | "lg";
}) {
  const items = Children.toArray(children);
  const track = useRef<HTMLUListElement>(null);
  const [active, setActive] = useState(0);

  // Item ativo = o que está mais perto do centro do trilho.
  const onScroll = useCallback(() => {
    const el = track.current;
    if (!el) return;
    const center = el.scrollLeft + el.clientWidth / 2;
    let best = 0;
    let dist = Infinity;
    Array.from(el.children).forEach((child, i) => {
      const c = child as HTMLElement;
      const d = Math.abs(c.offsetLeft + c.offsetWidth / 2 - center);
      if (d < dist) {
        dist = d;
        best = i;
      }
    });
    setActive(best);
  }, []);

  useEffect(() => {
    const el = track.current;
    if (!el) return;
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [onScroll]);

  function go(i: number) {
    const el = track.current;
    const child = el?.children[Math.max(0, Math.min(items.length - 1, i))] as HTMLElement | undefined;
    if (!el || !child) return;
    el.scrollTo({ left: child.offsetLeft - (el.clientWidth - child.offsetWidth) / 2, behavior: "smooth" });
  }

  const desk = desktopFrom === "md" ? "md" : "lg";
  return (
    <div role="region" aria-roledescription="carrossel" aria-label={label}>
      <ul
        ref={track}
        className={cn(
          // Celular: trilho com encaixe no centro; as margens laterais deixam o primeiro e o último centralizados.
          // Item com 72vw + 14vw de cada lado = o item ativo fica exatamente no centro da tela.
          "-mx-5 flex snap-x snap-mandatory [scrollbar-width:none] gap-4 overflow-x-auto px-[14vw] pb-2 sm:-mx-8 [&::-webkit-scrollbar]:hidden",
          desk === "md"
            ? "md:mx-0 md:grid md:snap-none md:overflow-visible md:px-0 md:pb-0"
            : "lg:mx-0 lg:grid lg:snap-none lg:overflow-visible lg:px-0 lg:pb-0",
          gridClassName,
        )}
      >
        {items.map((child, i) => (
          <li
            key={i}
            aria-roledescription="item"
            aria-label={`${i + 1} de ${items.length}`}
            className={cn("w-[72vw] shrink-0 snap-center", itemClassName, desk === "md" ? "md:w-auto" : "lg:w-auto")}
          >
            {child}
          </li>
        ))}
      </ul>

      <div className={cn("mt-5 flex items-center justify-between gap-4", desk === "md" ? "md:hidden" : "lg:hidden")}>
        <ArrowButton dir="prev" disabled={active === 0} onClick={() => go(active - 1)} />
        <div className="flex items-center gap-1.5" aria-hidden>
          {items.map((_, i) => (
            <span
              key={i}
              className={cn(
                "h-2 rounded-full transition-all duration-200",
                i === active ? "w-6 bg-gv-green" : "w-2 bg-gv-line",
              )}
            />
          ))}
        </div>
        <ArrowButton dir="next" disabled={active === items.length - 1} onClick={() => go(active + 1)} />
      </div>
      <p className="sr-only" aria-live="polite">
        Item {active + 1} de {items.length}
      </p>
    </div>
  );
}

function ArrowButton({ dir, disabled, onClick }: { dir: "prev" | "next"; disabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={dir === "prev" ? "Anterior" : "Próximo"}
      className="grid size-12 place-items-center rounded-full border border-gv-line bg-white text-gv-ink shadow-[0_6px_16px_-8px_rgb(6_40_20/0.35)] transition-opacity disabled:opacity-35"
    >
      <svg aria-hidden viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2.4">
        <path d={dir === "prev" ? "M15 6l-6 6 6 6" : "M9 6l6 6-6 6"} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}
