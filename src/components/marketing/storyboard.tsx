import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { BAKERY, BAKERY_ROUND } from "./demo-ads";
import { FluidAd } from "./fluid-ad";

/**
 * "Da foto ao cliente no WhatsApp": as 8 telas do fluxo simples do app (ADR 0010), simplificadas,
 * com a padaria fictícia. As peças saem do renderizador real; negócio e números são ilustrativos.
 * As telas são decorativas (aria-hidden): o título e o texto de cada passo carregam o conteúdo.
 */
const PHOTO = BAKERY.photo ?? null;
const piece = (i: number) => ({
  content: BAKERY_ROUND[i].ad,
  businessName: BAKERY.businessName,
  priceLabel: BAKERY.priceLabel,
  imageSrc: PHOTO,
});

const steps: Array<{ title: string; text: string; screen: ReactNode }> = [
  {
    title: "Início",
    text: "Um botão só: criar o anúncio. O que já está rodando aparece logo abaixo.",
    screen: <ScreenHome />,
  },
  { title: "Produto", text: "Tire ou escolha a foto do que você quer vender e dê um nome.", screen: <ScreenProduct /> },
  {
    title: "Oferta",
    text: "Preço e o que destacar: parcelamento, desconto ou entrega. A IA só usa o que você escreveu.",
    screen: <ScreenOffer />,
  },
  {
    title: "Prévia",
    text: "Cinco versões com a sua foto. Elas rodam juntas e a Meta mostra mais a que traz mais conversas.",
    screen: <ScreenPreview />,
  },
  {
    title: "Região",
    text: "Na sua cidade ou na cidade e região. O anúncio aparece para quem está perto.",
    screen: <ScreenRegion />,
  },
  {
    title: "Investimento",
    text: "R$ 10, R$ 20 ou R$ 30 por dia, pelo tempo que você escolher.",
    screen: <ScreenBudget />,
  },
  {
    title: "Publicação",
    text: "Você confere tudo e confirma. O anúncio é criado pausado e só roda com o seu ok.",
    screen: <ScreenPublish />,
  },
  {
    title: "Resultados",
    text: "Quanto investiu, quantas conversas chegaram e quanto custou cada uma. Pause quando quiser.",
    screen: <ScreenResults />,
  },
];

export function Storyboard() {
  return (
    <section id="como-funciona" aria-labelledby="como-funciona-titulo" className="scroll-mt-20 bg-gv-paper">
      <div className="mx-auto max-w-[1240px] px-4 py-24 sm:px-8 lg:py-32">
        <div className="max-w-2xl">
          <p className="font-semibold text-gv-green">Anúncios simples para negócios locais</p>
          <h2
            id="como-funciona-titulo"
            className="mt-3 text-[clamp(2rem,4.2vw,3.4rem)] leading-[1.06] font-bold tracking-[-0.04em]"
          >
            Da foto ao cliente no WhatsApp
          </h2>
          <p className="mt-5 text-lg leading-relaxed text-gv-mute">
            Oito telas no celular, do jeito que estão no app. Você vê exatamente o que vai ao ar antes de gastar
            qualquer real.
          </p>
        </div>

        <ol
          tabIndex={0}
          aria-label="Passo a passo no app"
          className="-mx-4 mt-14 flex snap-x snap-mandatory scroll-px-4 gap-5 overflow-x-auto px-4 pb-6 focus-visible:outline-2 focus-visible:outline-gv-green md:mx-0 md:grid md:snap-none md:grid-cols-2 md:gap-x-6 md:gap-y-14 md:overflow-visible md:px-0 md:pb-0 lg:grid-cols-4"
        >
          {steps.map((s, i) => (
            <li key={s.title} className="w-[236px] shrink-0 snap-start md:w-auto">
              <Phone>{s.screen}</Phone>
              <div className="mx-auto mt-5 flex max-w-[260px] gap-3">
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-gv-green text-sm font-bold text-white">
                  {i + 1}
                </span>
                <div>
                  <h3 className="font-bold tracking-[-0.01em]">{s.title}</h3>
                  <p className="mt-1 text-[15px] leading-relaxed text-gv-mute">{s.text}</p>
                </div>
              </div>
            </li>
          ))}
        </ol>
        <p className="mt-8 text-sm text-gv-mute">
          Telas simplificadas do app com uma padaria fictícia. Os números da última tela são ilustrativos.
        </p>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- moldura e peças */

function Phone({ children }: { children: ReactNode }) {
  return (
    <div
      aria-hidden
      className="mx-auto w-full max-w-[260px] rounded-[38px] bg-gv-night p-[7px] shadow-[0_30px_50px_-28px_rgb(6_40_20/0.7)]"
    >
      <div className="relative flex aspect-[9/18.5] flex-col overflow-hidden rounded-[31px] bg-white text-[13px] text-gv-ink">
        <div className="flex h-8 shrink-0 items-center justify-between px-6 pt-1 text-[11px] font-semibold">
          <span>9:41</span>
          <span className="h-[18px] w-16 rounded-full bg-gv-night" />
          <span className="flex items-center gap-1">
            <span className="h-2 w-3 rounded-[2px] bg-gv-ink/80" />
            <span className="h-2.5 w-5 rounded-[3px] border border-gv-ink/60" />
          </span>
        </div>
        <div className="flex min-h-0 flex-1 flex-col px-4 pt-2 pb-4">{children}</div>
      </div>
    </div>
  );
}

/** Topo das telas do assistente: voltar, barra de progresso e título. */
function Top({ step, title }: { step?: number; title: string }) {
  return (
    <>
      {step !== undefined && (
        <div className="flex items-center gap-2">
          <span className="text-[15px] leading-none text-gv-ink">←</span>
          <div className="grid flex-1 grid-cols-6 gap-1">
            {Array.from({ length: 6 }, (_, i) => (
              <span key={i} className={cn("h-1 rounded-full", i < step ? "bg-gv-green" : "bg-gv-line")} />
            ))}
          </div>
        </div>
      )}
      <p className="mt-3 text-[17px] leading-tight font-bold tracking-[-0.02em]">{title}</p>
    </>
  );
}

function Button({ children, tone = "primary" }: { children: ReactNode; tone?: "primary" | "ghost" }) {
  return (
    <p
      className={cn(
        "rounded-xl py-2.5 text-center text-[13px] font-bold",
        tone === "primary" ? "bg-gv-green text-white" : "border border-gv-line text-gv-ink",
      )}
    >
      {children}
    </p>
  );
}

function Photo({ className }: { className?: string }) {
  return PHOTO ? (
    // eslint-disable-next-line @next/next/no-img-element -- ilustração estática decorativa
    <img src={PHOTO} alt="" className={cn("object-cover", className)} />
  ) : (
    <span className={cn("block bg-[#f6e3cc]", className)} />
  );
}

function Check() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-3.5 shrink-0 text-gv-green"
      fill="none"
      stroke="currentColor"
      strokeWidth="3.4"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

/* ---------------------------------------------------------------- telas */

function ScreenHome() {
  return (
    <>
      <div className="rounded-2xl bg-gv-green p-3 text-white">
        <p className="text-[10px] text-white/80">Olá, {BAKERY.businessName}</p>
        <p className="mt-1 text-[18px] leading-tight font-bold">Vamos vender mais?</p>
        <p className="mt-3 rounded-lg bg-white py-2 text-center text-[12px] font-bold text-gv-green-strong">
          + Criar meu anúncio
        </p>
      </div>
      <p className="mt-4 text-[12px] font-bold">Meu anúncio ativo</p>
      <div className="mt-2 flex items-center gap-2.5 rounded-xl border border-gv-line p-2">
        <Photo className="size-11 rounded-lg" />
        <div className="min-w-0">
          <p className="truncate text-[12px] font-bold">Café da manhã completo</p>
          <p className="mt-0.5 flex items-center gap-1 text-[11px] text-gv-mute">
            <span className="size-1.5 rounded-full bg-gv-green" />
            Ativo · 27 conversas
          </p>
        </div>
      </div>
      <div className="mt-auto grid grid-cols-3 gap-1 border-t border-gv-line pt-2 text-center text-[10px] font-semibold text-gv-mute">
        <span className="rounded-lg bg-[#e4f6e9] py-1 text-gv-green-strong">Início</span>
        <span className="py-1">Anúncios</span>
        <span className="py-1">Conta</span>
      </div>
    </>
  );
}

function ScreenProduct() {
  return (
    <>
      <Top step={1} title="O que você quer vender?" />
      <div className="relative mt-3">
        <Photo className="aspect-[4/3] w-full rounded-xl" />
        <span className="absolute right-2 bottom-2 grid size-7 place-items-center rounded-full bg-white text-[11px] shadow">
          📷
        </span>
      </div>
      <p className="mx-auto mt-2 rounded-full bg-gv-paper px-3 py-1 text-[11px] font-semibold">Trocar foto</p>
      <p className="mt-3 text-[11px] font-semibold text-gv-mute">Nome do produto</p>
      <p className="mt-1 rounded-lg border border-gv-line px-2.5 py-1.5 font-medium">Café da manhã completo</p>
      <div className="mt-auto">
        <Button>Continuar</Button>
      </div>
    </>
  );
}

function ScreenOffer() {
  return (
    <>
      <Top step={2} title="Qual é a sua oferta?" />
      <div className="mt-3 flex items-center gap-2.5">
        <Photo className="size-11 rounded-lg" />
        <p className="text-[12px] font-bold">Café da manhã completo</p>
      </div>
      <p className="mt-3 text-[11px] font-semibold text-gv-mute">Preço</p>
      <p className="mt-1 rounded-lg border border-gv-line px-2.5 py-1.5 text-[15px] font-bold">R$ 24,90</p>
      <p className="mt-3 text-[11px] font-semibold text-gv-mute">O que você quer destacar?</p>
      <div className="mt-1 flex flex-wrap gap-1">
        {["Parcelamento", "Desconto", "Entrega"].map((d, i) => (
          <span
            key={d}
            className={cn(
              "rounded-lg border px-2 py-1 text-[10.5px] font-semibold",
              i === 2 ? "border-gv-green bg-[#e4f6e9] text-gv-green-strong" : "border-gv-line text-gv-mute",
            )}
          >
            {d}
          </span>
        ))}
      </div>
      <p className="mt-2 flex items-center gap-1.5 rounded-lg bg-[#e4f6e9] px-2 py-1.5 text-[11.5px] font-semibold">
        <Check />
        Retire no balcão sem fila
      </p>
      <div className="mt-auto">
        <Button>Criar meu anúncio</Button>
      </div>
    </>
  );
}

function ScreenPreview() {
  return (
    <>
      <Top step={3} title="Olha como ficou!" />
      <div className="mt-3 overflow-hidden rounded-xl shadow-[0_10px_20px_-12px_rgb(6_40_20/0.6)]">
        <FluidAd format="feed" {...piece(0)} />
      </div>
      <p className="mt-2 text-center text-[11px] font-semibold">Versão 1 de 5</p>
      <div className="mt-auto grid gap-1.5">
        <Button>Gostei, continuar</Button>
        <Button tone="ghost">Quero mudar algo</Button>
      </div>
    </>
  );
}

function ScreenRegion() {
  return (
    <>
      <Top step={4} title="Onde estão seus clientes?" />
      <p className="mt-3 rounded-lg border border-gv-line px-2.5 py-1.5 font-semibold">📍 Campinas, SP</p>
      <div className="relative mt-3 h-[130px] overflow-hidden rounded-xl bg-[#eef1ec]">
        <span className="absolute top-[38%] -left-2 h-2 w-[120%] -rotate-6 bg-white" />
        <span className="absolute top-0 left-[58%] h-full w-2 rotate-12 bg-white" />
        <span className="absolute top-[72%] -left-2 h-1.5 w-[120%] rotate-3 bg-white" />
        <span className="absolute top-0 left-[22%] h-full w-1.5 -rotate-3 bg-white" />
        <span className="absolute top-1/2 left-1/2 size-[96px] -translate-1/2 rounded-full border-2 border-gv-green bg-gv-green/15" />
        <span className="absolute top-1/2 left-1/2 size-4 -translate-1/2 rounded-full border-2 border-white bg-gv-green" />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-1.5 text-center text-[11px] font-bold">
        <span className="rounded-lg border-2 border-gv-green bg-[#e4f6e9] py-1.5">Na cidade</span>
        <span className="rounded-lg border-2 border-gv-line py-1.5 text-gv-mute">Cidade e região</span>
      </div>
      <div className="mt-auto">
        <Button>Continuar</Button>
      </div>
    </>
  );
}

function ScreenBudget() {
  return (
    <>
      <Top step={5} title="Quanto quer investir?" />
      <div className="mt-3 grid grid-cols-3 gap-1.5 text-center">
        {["R$ 10", "R$ 20", "R$ 30"].map((v, i) => (
          <span
            key={v}
            className={cn(
              "rounded-xl border-2 py-3 text-[14px] font-bold",
              i === 1 ? "border-gv-green bg-[#e4f6e9]" : "border-gv-line",
            )}
          >
            {v}
            <span className="block text-[10px] font-medium text-gv-mute">por dia</span>
          </span>
        ))}
      </div>
      <p className="mt-3 text-[11px] font-semibold text-gv-mute">Por quanto tempo?</p>
      <p className="mt-1 rounded-lg border border-gv-line px-2.5 py-1.5 font-semibold">7 dias</p>
      <div className="mt-3 rounded-xl bg-[#e4f6e9] p-3 text-center">
        <p className="text-[11px] text-gv-mute">Total em anúncios</p>
        <p className="text-[22px] leading-tight font-bold">R$ 140</p>
      </div>
      <div className="mt-auto">
        <Button>Revisar e anunciar</Button>
      </div>
    </>
  );
}

function ScreenPublish() {
  return (
    <>
      <Top step={6} title="Tudo pronto!" />
      <div className="mt-3 flex items-center gap-2.5 rounded-xl border border-gv-line p-2">
        <div className="w-11 shrink-0 overflow-hidden rounded-md">
          <FluidAd format="feed" {...piece(0)} />
        </div>
        <div className="min-w-0">
          <p className="truncate text-[12px] font-bold">{BAKERY.ad.headline}</p>
          <p className="text-[11px] text-gv-mute">R$ 24,90</p>
        </div>
      </div>
      <div className="mt-2 divide-y divide-gv-line text-[11.5px]">
        {[
          ["Região", "Campinas"],
          ["Duração", "7 dias"],
          ["Investimento", "R$ 140"],
          ["Destino", "seu WhatsApp"],
        ].map(([k, v]) => (
          <p key={k} className="flex justify-between py-1.5">
            <span className="font-semibold">{k}</span>
            <span className="text-gv-mute">{v}</span>
          </p>
        ))}
      </div>
      <p className="mt-2 flex items-center justify-center gap-1.5 rounded-lg bg-[#e4f6e9] py-1.5 text-[11px] font-bold text-gv-green-strong">
        <Check />
        Conta conectada
      </p>
      <div className="mt-auto">
        <Button>Publicar anúncio</Button>
      </div>
    </>
  );
}

function ScreenResults() {
  return (
    <>
      <Top title="Seu anúncio em números" />
      <div className="mt-3 grid grid-cols-3 gap-1.5 text-center">
        {[
          ["R$ 120", "Investido"],
          ["18", "Conversas"],
          ["R$ 6,67", "Por conversa"],
        ].map(([v, k]) => (
          <div key={k} className="rounded-xl border border-gv-line px-1 py-2.5">
            <p className="text-[14px] leading-tight font-bold">{v}</p>
            <p className="text-[9.5px] text-gv-mute">{k}</p>
          </div>
        ))}
      </div>
      <p className="mt-3 flex items-center gap-1.5 rounded-xl bg-[#e4f6e9] px-2.5 py-2 text-[11.5px] font-semibold">
        ✨ Estamos testando 5 versões
      </p>
      <p className="mt-3 text-[12px] font-bold">Alguma conversa virou venda?</p>
      <div className="mt-2">
        <Button>Registrar vendas</Button>
      </div>
      <div className="mt-auto">
        <Button tone="ghost">Pausar anúncio</Button>
      </div>
    </>
  );
}
