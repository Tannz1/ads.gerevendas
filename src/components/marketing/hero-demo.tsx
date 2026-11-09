"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { DEMO_BUSINESSES } from "./demo-ads";
import { FluidAd } from "./fluid-ad";

/**
 * Demo do hero: a frase que o dono escreveu no cadastro é digitada e vira uma peça de feed,
 * desenhada pelo mesmo renderizador do editor. Negócios, ofertas e preços são FICTÍCIOS e rotulados
 * como exemplo ilustrativo. Roda sozinha entre os exemplos até a pessoa escolher um; com movimento
 * reduzido, mostra o estado final.
 */
const examples = DEMO_BUSINESSES;

const TYPE_MS = 26;
const THINK_MS = 900;
const HOLD_MS = 4200;

const MOTION_QUERY = "(prefers-reduced-motion: reduce)";
const prefersStill = () => window.matchMedia(MOTION_QUERY).matches;
function subscribeMotion(onChange: () => void) {
  const mq = window.matchMedia(MOTION_QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

export function HeroDemo() {
  const [index, setIndex] = useState(0);
  const [typed, setTyped] = useState(0);
  const [auto, setAuto] = useState(true);
  const still = useSyncExternalStore(subscribeMotion, prefersStill, () => false);
  const ex = examples[index];
  const done = still || typed >= ex.note.length;
  const [ready, setReady] = useState(false);

  // Digita a frase, "pensa" e mostra a peça; depois avança para o próximo exemplo enquanto estiver no automático.
  useEffect(() => {
    if (still) return;
    if (typed < ex.note.length) {
      const t = setTimeout(() => setTyped((n) => n + 1), TYPE_MS);
      return () => clearTimeout(t);
    }
    if (!ready) {
      const t = setTimeout(() => setReady(true), THINK_MS);
      return () => clearTimeout(t);
    }
    if (auto) {
      const t = setTimeout(() => pick((index + 1) % examples.length), HOLD_MS);
      return () => clearTimeout(t);
    }
  }, [still, typed, ready, auto, index, ex.note.length]);

  function pick(i: number) {
    setIndex(i);
    setTyped(0);
    setReady(false);
  }

  const showAd = still || (done && ready);

  return (
    <div className="relative">
      <div role="group" aria-label="Escolha um tipo de negócio" className="flex flex-wrap gap-2">
        {examples.map((e, i) => (
          <button
            key={e.id}
            type="button"
            aria-pressed={i === index}
            onClick={() => {
              setAuto(false);
              pick(i);
            }}
            className="rounded-full border border-white/20 bg-white/5 px-4 py-1.5 text-sm font-semibold text-white/80 transition-colors hover:border-white/40 hover:text-white aria-pressed:border-white aria-pressed:bg-white aria-pressed:text-gv-ink"
          >
            {e.label}
          </button>
        ))}
      </div>

      <div className="mt-6 grid items-start gap-5 sm:grid-cols-[minmax(0,1fr)_minmax(0,300px)]">
        <div className="sm:pt-10">
          <figure className="rounded-2xl border border-white/12 bg-white/[0.06] p-5 backdrop-blur-md">
            <figcaption className="flex items-center gap-2 text-[13px] font-semibold text-gv-mint">
              <PenIcon />O que o dono escreveu no cadastro
            </figcaption>
            <blockquote className="mt-3 min-h-[7.5em] text-[15.5px] leading-relaxed text-white">
              <span className="sr-only">{ex.note}</span>
              <span aria-hidden>
                {still ? ex.note : ex.note.slice(0, typed)}
                {!done && <span className="lp-caret" />}
              </span>
            </blockquote>
          </figure>

          <div aria-hidden className="mt-4 flex items-center gap-3 text-sm text-white/70">
            {showAd ? (
              <span
                key={`ok-${ex.id}`}
                className="lp-in inline-flex items-center gap-2 rounded-full bg-[#22c55e]/15 px-3 py-1.5 font-semibold text-[#9ff0bd]"
              >
                <CheckIcon />
                Estratégia e 5 peças prontas para revisar
              </span>
            ) : done ? (
              <span className="inline-flex items-center gap-2 rounded-full bg-white/8 px-3 py-1.5 font-semibold">
                Montando o anúncio
                <span className="lp-dots inline-flex gap-0.5">
                  <span>.</span>
                  <span>.</span>
                  <span>.</span>
                </span>
              </span>
            ) : (
              <span className="px-1">A IA usa só o que está escrito aqui.</span>
            )}
          </div>
        </div>

        <figure className="mx-auto w-full max-w-[300px]">
          <div className="overflow-hidden rounded-[22px] bg-white text-gv-ink shadow-[0_40px_80px_-30px_rgb(0_0_0/0.8),0_0_0_1px_rgb(255_255_255/0.08)]">
            <div className="flex items-center gap-3 px-4 py-3">
              <span
                aria-hidden
                className="grid size-9 place-items-center rounded-full text-xs font-bold text-white"
                style={{ background: ex.ad.colors.accent }}
              >
                {ex.initials}
              </span>
              <div className="min-w-0 leading-tight">
                <p className="truncate text-sm font-semibold">{ex.businessName}</p>
                <p className="text-xs text-gv-mute">Patrocinado</p>
              </div>
            </div>

            <div className="relative">
              {showAd ? (
                <div key={ex.id} className={still ? undefined : "lp-in"}>
                  <FluidAd
                    format="feed"
                    content={ex.ad}
                    businessName={ex.businessName}
                    priceLabel={ex.priceLabel}
                    imageSrc={ex.photo ?? null}
                  />
                </div>
              ) : (
                <div aria-hidden className="relative aspect-[4/5] animate-pulse bg-[#edf2ef]">
                  <div className="absolute top-7 left-7 h-6 w-3/5 rounded bg-[#dbe5df]" />
                  <div className="absolute top-16 left-7 h-6 w-2/5 rounded bg-[#dbe5df]" />
                  <div className="absolute bottom-8 left-7 h-9 w-28 rounded bg-[#dbe5df]" />
                </div>
              )}
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-gv-line px-4 py-3 text-[13px] font-semibold whitespace-nowrap">
              <span>{ex.ad.cta}</span>
              <span aria-hidden className="grid size-7 place-items-center rounded-full bg-[#e7f6ee] text-[#128c4a]">
                <WhatsIcon />
              </span>
            </div>
          </div>
          <figcaption className="mt-3 text-center text-[13px] text-white/60">
            <strong className="font-semibold text-white/80">Exemplo ilustrativo.</strong> Negócio e preço fictícios.
          </figcaption>
        </figure>
      </div>
    </div>
  );
}

function PenIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className="size-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className="size-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function WhatsIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className="size-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />
    </svg>
  );
}
