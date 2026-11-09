"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import {
  Phone,
  ScreenBudget,
  ScreenHome,
  ScreenOffer,
  ScreenPreview,
  ScreenProduct,
  ScreenPublish,
  ScreenRegion,
  ScreenResults,
} from "./storyboard";

/**
 * "Veja o app por dentro" guiado pela rolagem. No computador, o celular fica parado ao lado e a tela troca
 * conforme a etapa que está no meio da tela; no celular, cada etapa desce com a sua tela e aparece suavemente.
 * Telas simplificadas do app com uma padaria fictícia; números ilustrativos.
 */
const ETAPAS: Array<{ titulo: string; texto: string; tela: ReactNode }> = [
  {
    titulo: "Abra o app e toque em criar",
    texto: "A tela inicial tem um botão grande para criar o anúncio. O que já está rodando aparece logo abaixo.",
    tela: <ScreenHome />,
  },
  {
    titulo: "Mande a foto do produto",
    texto: "Tire a foto na hora ou escolha da galeria e escreva o nome. Foto do celular serve.",
    tela: <ScreenProduct />,
  },
  {
    titulo: "Diga o preço e o que destacar",
    texto: "Parcelamento, desconto ou entrega. A IA usa só o que você escreveu: não inventa preço nem promoção.",
    tela: <ScreenOffer />,
  },
  {
    titulo: "Receba cinco versões prontas",
    texto: "O app cria cinco anúncios com a sua foto, cada um chamando o cliente de um jeito. Mude o que quiser.",
    tela: <ScreenPreview />,
  },
  {
    titulo: "Escolha onde aparecer",
    texto: "Só na sua cidade ou na cidade e região. O anúncio aparece para quem está perto.",
    tela: <ScreenRegion />,
  },
  {
    titulo: "Defina quanto investir",
    texto: "R$ 10, R$ 20 ou R$ 30 por dia, pelo tempo que você quiser. O total aparece antes de seguir.",
    tela: <ScreenBudget />,
  },
  {
    titulo: "Confira e publique",
    texto: "Região, duração, valor e destino num resumo só. O anúncio nasce pausado e só roda com o seu ok.",
    tela: <ScreenPublish />,
  },
  {
    titulo: "Acompanhe as conversas",
    texto: "Quanto investiu, quantas conversas chegaram no WhatsApp e quanto custou cada uma. Pause quando quiser.",
    tela: <ScreenResults />,
  },
];

export function ScrollTour() {
  const [ativa, setAtiva] = useState(0);
  const refs = useRef<Array<HTMLLIElement | null>>([]);

  // Etapa ativa = a que cruza a faixa do meio da tela.
  useEffect(() => {
    const obs = new IntersectionObserver(
      (entradas) => {
        for (const e of entradas) {
          if (e.isIntersecting) setAtiva(Number((e.target as HTMLElement).dataset.etapa));
        }
      },
      { rootMargin: "-45% 0px -45% 0px" },
    );
    refs.current.forEach((el) => el && obs.observe(el));
    return () => obs.disconnect();
  }, []);

  return (
    <div className="mt-10 grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-16">
      <ol className="grid gap-12 lg:gap-0">
        {ETAPAS.map((e, i) => (
          <li
            key={e.titulo}
            ref={(el) => {
              refs.current[i] = el;
            }}
            data-etapa={i}
            className="lg:flex lg:min-h-[42vh] lg:items-center"
          >
            <div>
              <div className={cn("transition-opacity duration-300", i === ativa ? "lg:opacity-100" : "lg:opacity-35")}>
                <p className="flex items-center gap-3">
                  <span
                    className={cn(
                      "grid size-10 shrink-0 place-items-center rounded-full text-[17px] font-bold transition-colors",
                      i <= ativa ? "bg-lp-verde text-white" : "bg-lp-claro text-lp-verde",
                    )}
                  >
                    {i + 1}
                  </span>
                  <span className="text-[14px] font-semibold text-lp-cinza">Passo {i + 1} de 8</span>
                </p>
                <h3 className="lp-letreiro mt-3 text-[clamp(1.45rem,4.5vw,2.1rem)] leading-[1.08]">{e.titulo}</h3>
                <p className="mt-2.5 max-w-md text-[17px] leading-relaxed text-lp-cinza">{e.texto}</p>
              </div>
              {/* Celular: a tela vem logo abaixo do texto */}
              <div className="mx-auto mt-5 max-w-[240px] lg:hidden">
                <Phone>{e.tela}</Phone>
              </div>
            </div>
          </li>
        ))}
      </ol>

      {/* Computador: celular fixo ao lado, trocando de tela com a rolagem */}
      <div className="hidden lg:block">
        <div className="sticky top-[calc(50vh-300px)]">
          <div className="origin-top scale-[1.15]">
            <div className="relative">
              {ETAPAS.map((e, i) => (
                <div
                  key={e.titulo}
                  aria-hidden={i !== ativa}
                  className={cn(
                    "transition-all duration-500",
                    i === 0 ? "relative" : "absolute inset-0",
                    i === ativa ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-3 opacity-0",
                  )}
                >
                  <Phone>{e.tela}</Phone>
                </div>
              ))}
            </div>
          </div>
          <div className="mt-24 flex justify-center gap-1.5" aria-hidden>
            {ETAPAS.map((e, i) => (
              <span
                key={e.titulo}
                className={cn(
                  "h-1.5 rounded-full transition-all",
                  i === ativa ? "w-6 bg-lp-verde" : "w-1.5 bg-lp-linha",
                )}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function ScrollTourSection() {
  return (
    <section id="como-funciona" aria-labelledby="tour-titulo" className="scroll-mt-16 bg-white">
      <div className="mx-auto max-w-[1180px] px-5 py-14 sm:px-8 lg:py-20">
        <h2 id="tour-titulo" className="lp-letreiro max-w-3xl text-[clamp(1.9rem,6vw,3.1rem)] leading-[1.04]">
          Veja o app por dentro, do primeiro toque ao WhatsApp
        </h2>
        <p className="mt-3 max-w-xl text-[17px] leading-relaxed text-lp-cinza">
          Desça a página: cada passo mostra a tela do jeito que ela é no app.
        </p>
        <ScrollTour />
        <p className="mt-8 text-[14px] text-lp-cinza">
          Telas do app com uma padaria fictícia. Os números são ilustrativos.
        </p>
      </div>
    </section>
  );
}
