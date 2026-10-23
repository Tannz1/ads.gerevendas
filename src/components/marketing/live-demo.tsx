"use client";

import { useState } from "react";

/**
 * Demonstração da landing: o que o dono escreve no cadastro e uma peça no formato do feed.
 * Negócios, ofertas e preços são FICTÍCIOS e rotulados como exemplo ilustrativo.
 */
const examples = [
  {
    id: "padaria",
    label: "Padaria",
    owner: "Padaria Pão Quente",
    initials: "PQ",
    note: "Café da manhã completo por R$ 24,90: pão na chapa, café e suco natural. Pedido pelo WhatsApp até as 10h.",
    headline: "Café da manhã completo",
    detail: "Pão na chapa, café e suco natural",
    price: "R$ 24,90",
    cta: "Pedir no WhatsApp",
    bg: "#f7dcc0",
    ink: "#3b1a08",
    shape: "#e9a76b",
  },
  {
    id: "salao",
    label: "Salão",
    owner: "Studio Bela Rosa",
    initials: "BR",
    note: "Toda terça, escova com hidratação por R$ 89. Agendamento pelo WhatsApp, horário marcado.",
    headline: "Terça da escova",
    detail: "Escova + hidratação, com hora marcada",
    price: "R$ 89",
    cta: "Agendar horário",
    bg: "#f3d3e0",
    ink: "#3a0f24",
    shape: "#d98aaa",
  },
  {
    id: "petshop",
    label: "Pet shop",
    owner: "Cão Feliz Pet",
    initials: "CF",
    note: "Banho e tosa para cães pequenos, R$ 60. A gente busca e leva de volta aqui no bairro.",
    headline: "Banho e tosa com leva e traz",
    detail: "Cães de porte pequeno",
    price: "R$ 60",
    cta: "Agendar banho",
    bg: "#cfe9d8",
    ink: "#0e3b24",
    shape: "#7fc39b",
  },
  {
    id: "oficina",
    label: "Oficina",
    owner: "Auto Center Silva",
    initials: "AS",
    note: "Troca de óleo com filtro a partir de R$ 149. Não precisa marcar hora, é só chegar.",
    headline: "Troca de óleo sem marcar hora",
    detail: "Óleo + filtro, é só chegar",
    price: "a partir de R$ 149",
    cta: "Chamar no WhatsApp",
    bg: "#d6ddf0",
    ink: "#0f1b3d",
    shape: "#8ea0d6",
  },
] as const;

export function LiveDemo() {
  const [currentId, setCurrentId] = useState<(typeof examples)[number]["id"]>("padaria");
  const ex = examples.find((e) => e.id === currentId) ?? examples[0];

  return (
    <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,30rem)_1fr_minmax(0,380px)] lg:gap-6">
      <div>
        <p id="demo-label" className="text-[15px] font-semibold text-ink">
          Escolha um tipo de negócio
        </p>
        <div role="group" aria-labelledby="demo-label" className="mt-3 flex flex-wrap gap-2">
          {examples.map((e) => (
            <button
              key={e.id}
              type="button"
              aria-pressed={e.id === currentId}
              onClick={() => setCurrentId(e.id)}
              className="rounded-full border-2 border-ink px-4 py-1.5 text-[15px] font-semibold text-ink transition-colors hover:bg-ink/10 aria-pressed:bg-ink aria-pressed:text-white"
            >
              {e.label}
            </button>
          ))}
        </div>

        <figure className="mt-8 max-w-md -rotate-1 rounded-md bg-white p-5 shadow-[0_1px_0_rgb(16_24_40/0.08),0_12px_24px_-12px_rgb(16_24_40/0.35)]">
          <figcaption className="text-sm text-ink-faint">O que o dono escreveu no cadastro</figcaption>
          <blockquote key={ex.id} className="demo-swap mt-2 text-xl leading-snug text-ink">
            {ex.note}
          </blockquote>
        </figure>
      </div>

      <svg
        aria-hidden
        viewBox="0 0 64 24"
        className="mx-auto h-6 w-16 rotate-90 text-ink lg:rotate-0"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M2 12h56M48 4l10 8-10 8" />
      </svg>

      <figure className="mx-auto w-full max-w-[380px]">
        <div className="overflow-hidden rounded-2xl bg-white shadow-[0_24px_48px_-20px_rgb(16_24_40/0.5)]">
          <div className="flex items-center gap-3 px-4 py-3">
            <span
              aria-hidden
              className="grid size-9 place-items-center rounded-full text-sm font-bold text-white"
              style={{ background: ex.ink }}
            >
              {ex.initials}
            </span>
            <div className="min-w-0 leading-tight">
              <p className="truncate text-sm font-semibold text-ink">{ex.owner}</p>
              <p className="text-xs text-ink-faint">Patrocinado</p>
            </div>
          </div>

          <div
            key={ex.id}
            className="demo-swap relative aspect-[4/5] overflow-hidden"
            style={{ background: ex.bg, color: ex.ink }}
          >
            <div
              aria-hidden
              className="absolute -right-16 -bottom-20 size-72 rounded-full"
              style={{ background: ex.shape }}
            />
            <div
              aria-hidden
              className="absolute right-10 bottom-44 size-16 rounded-full opacity-60"
              style={{ background: ex.shape }}
            />
            <div className="absolute inset-x-0 top-0 p-6">
              <p className="sign-wide text-[40px] leading-[0.98] font-extrabold tracking-[-0.01em]">{ex.headline}</p>
              <p className="mt-4 text-base font-medium opacity-80">{ex.detail}</p>
            </div>
            <span className="price-tag absolute bottom-7 left-6 -rotate-3 px-5 py-2.5 font-sign text-[26px] leading-none font-extrabold text-white">
              {ex.price}
            </span>
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-3">
            <span className="text-sm font-semibold text-ink">{ex.cta}</span>
            <span aria-hidden className="text-sm font-semibold text-brand">
              Enviar mensagem
            </span>
          </div>
        </div>
        <figcaption className="mt-3 text-sm text-ink">
          <strong>Exemplo ilustrativo.</strong> Negócio e preço fictícios.
        </figcaption>
      </figure>
    </div>
  );
}
