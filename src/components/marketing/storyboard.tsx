import type { ReactNode } from "react";
import { TEMPLATE_LABELS } from "@/contracts/creatives";
import { OBJECTIVE_LABELS, OBJECTIVES } from "@/contracts/onboarding";
import { cn } from "@/lib/cn";
import { BAKERY, BAKERY_ROUND } from "./demo-ads";
import { FluidAd } from "./fluid-ad";

/**
 * "Do cadastro ao cliente no WhatsApp": o fluxo real do app em 8 telas de celular simplificadas,
 * com a padaria fictícia. As peças saem do renderizador real; números e negócio são ilustrativos.
 * As telas são decorativas (aria-hidden): o título e o texto de cada passo carregam o conteúdo.
 */
const piece = (i: number) => ({
  content: BAKERY_ROUND[i].ad,
  businessName: BAKERY.businessName,
  priceLabel: BAKERY.priceLabel,
  imageSrc: BAKERY.photo ?? null,
});

const steps: Array<{ title: string; text: string; screen: ReactNode }> = [
  {
    title: "Seu negócio",
    text: "Nome, segmento, cidade e o WhatsApp onde você atende.",
    screen: <ScreenBusiness />,
  },
  {
    title: "O que você vende",
    text: "Produto, preço e diferenciais. O preço só entra no anúncio se você confirmar que é real.",
    screen: <ScreenOffer />,
  },
  {
    title: "Quem compra",
    text: "Quem é o seu cliente, a faixa de idade e até onde você atende.",
    screen: <ScreenAudience />,
  },
  {
    title: "Objetivo",
    text: "Mensagens no WhatsApp, visitas ao Instagram ou ao site, ou ser lembrado no bairro.",
    screen: <ScreenGoal />,
  },
  {
    title: "Estratégia e cinco peças",
    text: "A IA monta a estratégia e cinco anúncios, cada um chamando o cliente de um jeito.",
    screen: <ScreenPieces />,
  },
  {
    title: "Ajuste do seu jeito",
    text: "Mude título, texto, preço, cor e foto. Use uma foto sua ou peça uma imagem nova.",
    screen: <ScreenEditor />,
  },
  {
    title: "Confirme o valor",
    text: "Quanto por dia e por quantos dias. A campanha nasce pausada no Facebook e no Instagram.",
    screen: <ScreenPublish />,
  },
  {
    title: "Acompanhe o que veio",
    text: "Investido, cliques e conversas de cada campanha, num painel só. Pause quando quiser.",
    screen: <ScreenResults />,
  },
];

export function Storyboard() {
  return (
    <section id="como-funciona" aria-labelledby="como-funciona-titulo" className="scroll-mt-20 bg-gv-paper">
      <div className="mx-auto max-w-[1240px] px-4 py-24 sm:px-8 lg:py-32">
        <div className="max-w-2xl">
          <p className="font-semibold text-gv-red">Anúncios simples para negócios locais</p>
          <h2
            id="como-funciona-titulo"
            className="mt-3 text-[clamp(2rem,4.2vw,3.4rem)] leading-[1.06] font-bold tracking-[-0.04em]"
          >
            Do cadastro ao cliente no WhatsApp
          </h2>
          <p className="mt-5 text-lg leading-relaxed text-gv-mute">
            O caminho inteiro dentro do app, tela por tela. Você responde perguntas simples e vê exatamente o que vai ao
            ar antes de gastar qualquer real.
          </p>
        </div>

        <ol
          tabIndex={0}
          aria-label="Passo a passo no app"
          className="-mx-4 mt-14 flex snap-x snap-mandatory scroll-px-4 gap-5 overflow-x-auto px-4 pb-6 focus-visible:outline-2 focus-visible:outline-gv-red md:mx-0 md:grid md:snap-none md:grid-cols-2 md:gap-x-6 md:gap-y-14 md:overflow-visible md:px-0 md:pb-0 lg:grid-cols-4"
        >
          {steps.map((s, i) => (
            <li key={s.title} className="w-[236px] shrink-0 snap-start md:w-auto">
              <Phone>{s.screen}</Phone>
              <div className="mx-auto mt-5 flex max-w-[260px] gap-3">
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-gv-red text-sm font-bold text-white">
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

/* ---------------------------------------------------------------- moldura */

function Phone({ children }: { children: ReactNode }) {
  return (
    <div
      aria-hidden
      className="mx-auto w-full max-w-[260px] rounded-[38px] bg-gv-wine p-[7px] shadow-[0_30px_50px_-28px_rgb(67_27_32/0.7)]"
    >
      <div className="relative flex aspect-[9/18.5] flex-col overflow-hidden rounded-[31px] bg-white text-[13px] text-gv-ink">
        <div className="flex h-8 shrink-0 items-center justify-between px-6 pt-1 text-[11px] font-semibold">
          <span>9:41</span>
          <span className="h-[18px] w-16 rounded-full bg-gv-wine" />
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

/** Topo das telas do cadastro: etapa e barra de progresso. */
function OnboardingTop({ step, question }: { step: number; question: string }) {
  return (
    <>
      <p className="text-[11px] font-semibold text-gv-mute">Etapa {step} de 6</p>
      <div className="mt-1.5 grid grid-cols-6 gap-1">
        {Array.from({ length: 6 }, (_, i) => (
          <span key={i} className={cn("h-1 rounded-full", i < step ? "bg-gv-red" : "bg-gv-line")} />
        ))}
      </div>
      <p className="mt-4 text-[17px] leading-tight font-bold tracking-[-0.02em]">{question}</p>
    </>
  );
}

function Field({ label, value, tall }: { label: string; value: string; tall?: boolean }) {
  return (
    <div>
      <p className="text-[11px] font-semibold text-gv-mute">{label}</p>
      <p
        className={cn(
          "mt-1 rounded-lg border border-gv-line px-2.5 py-1.5 font-medium",
          tall ? "min-h-[3.4em] leading-snug" : "truncate",
        )}
      >
        {value}
      </p>
    </div>
  );
}

function Button({ children, tone = "primary" }: { children: ReactNode; tone?: "primary" | "ghost" }) {
  return (
    <p
      className={cn(
        "rounded-xl py-2.5 text-center text-[13px] font-bold",
        tone === "primary" ? "bg-gv-red text-white" : "border border-gv-line text-gv-ink",
      )}
    >
      {children}
    </p>
  );
}

function Check({ on = true }: { on?: boolean }) {
  return (
    <span
      className={cn(
        "grid size-4 shrink-0 place-items-center rounded-[5px] border",
        on ? "border-gv-red bg-gv-red text-white" : "border-gv-line",
      )}
    >
      {on && (
        <svg viewBox="0 0 24 24" className="size-3" fill="none" stroke="currentColor" strokeWidth="3.4">
          <path d="M20 6 9 17l-5-5" />
        </svg>
      )}
    </span>
  );
}

/* ---------------------------------------------------------------- telas */

function ScreenBusiness() {
  return (
    <>
      <OnboardingTop step={1} question="Conte sobre o seu negócio" />
      <div className="mt-4 grid gap-2.5">
        <Field label="Nome do negócio" value={BAKERY.businessName} />
        <Field label="Segmento" value="Padaria" />
        <div className="grid grid-cols-[1fr_52px] gap-2">
          <Field label="Cidade" value="Campinas" />
          <Field label="UF" value="SP" />
        </div>
        <Field label="WhatsApp" value="(19) 99999-0000" />
      </div>
      <div className="mt-auto">
        <Button>Continuar</Button>
      </div>
    </>
  );
}

function ScreenOffer() {
  return (
    <>
      <OnboardingTop step={2} question="O que você vende?" />
      <div className="mt-4 grid gap-2.5">
        <Field label="Produto ou serviço" value="Café da manhã completo" />
        <Field label="Descrição" value="Pão na chapa, café e suco natural." tall />
        <Field label="Preço" value="R$ 24,90" />
        <p className="flex items-start gap-2 text-[12px] leading-snug">
          <Check />O preço é real e está valendo
        </p>
        <div>
          <p className="text-[11px] font-semibold text-gv-mute">Diferenciais</p>
          <div className="mt-1 flex flex-wrap gap-1">
            {["Pão sai às 6h", "Retira sem fila"].map((d) => (
              <span key={d} className="rounded-full bg-gv-paper px-2 py-0.5 text-[11px] font-semibold">
                {d}
              </span>
            ))}
          </div>
        </div>
      </div>
      <div className="mt-auto">
        <Button>Continuar</Button>
      </div>
    </>
  );
}

function ScreenAudience() {
  return (
    <>
      <OnboardingTop step={3} question="Quem compra de você?" />
      <div className="mt-4 grid gap-2.5">
        <Field label="Seu cliente" value="Quem trabalha perto e passa cedo" />
        <Field label="Idade" value="25 a 55 anos" />
      </div>
      <p className="mt-3 text-[11px] font-semibold text-gv-mute">Até onde você atende</p>
      <div className="relative mt-1 h-[118px] overflow-hidden rounded-xl bg-[#eef0ea]">
        {/* Ruas do mapa ilustrativo. */}
        <span className="absolute top-[38%] -left-2 h-2 w-[120%] -rotate-6 bg-white" />
        <span className="absolute top-0 left-[58%] h-full w-2 rotate-12 bg-white" />
        <span className="absolute top-[72%] -left-2 h-1.5 w-[120%] rotate-3 bg-white" />
        <span className="absolute top-0 left-[22%] h-full w-1.5 -rotate-3 bg-white" />
        <span className="absolute top-1/2 left-1/2 size-[92px] -translate-1/2 rounded-full border-2 border-gv-red bg-gv-red/12" />
        <span className="absolute top-1/2 left-1/2 size-3.5 -translate-1/2 rounded-full border-2 border-white bg-gv-red" />
      </div>
      <p className="mt-2 text-center text-[12px] font-bold">Raio de 3 km da padaria</p>
      <div className="mt-auto">
        <Button>Continuar</Button>
      </div>
    </>
  );
}

function ScreenGoal() {
  return (
    <>
      <OnboardingTop step={4} question="O que você quer com o anúncio?" />
      <div className="mt-4 grid gap-2">
        {OBJECTIVES.map((o) => {
          const on = o === "mensagens_whatsapp";
          return (
            <div
              key={o}
              className={cn(
                "flex items-center gap-2.5 rounded-xl border p-2.5",
                on ? "border-gv-red bg-[#fff4f2]" : "border-gv-line",
              )}
            >
              {on ? (
                <span className="grid size-7 shrink-0 place-items-center rounded-full bg-[#e7f6ee] text-[#128c4a]">
                  <WhatsIcon />
                </span>
              ) : (
                <span className="size-7 shrink-0 rounded-full bg-gv-paper" />
              )}
              <span className="min-w-0 flex-1 text-[12px] leading-tight font-semibold">
                {OBJECTIVE_LABELS[o].title}
              </span>
              {on && <Check />}
            </div>
          );
        })}
      </div>
      <div className="mt-auto">
        <Button>Continuar</Button>
      </div>
    </>
  );
}

function ScreenPieces() {
  return (
    <>
      <p className="text-[11px] font-semibold text-gv-mute">Sua estratégia</p>
      <p className="mt-1 text-[17px] leading-tight font-bold tracking-[-0.02em]">5 anúncios prontos para revisar</p>
      <p className="mt-2 rounded-lg bg-gv-paper p-2 text-[11.5px] leading-snug text-gv-mute">
        Falar com quem passa cedo a caminho do trabalho e quer pedir sem fila.
      </p>
      <div className="mt-3 grid grid-cols-3 gap-1.5">
        {BAKERY_ROUND.map(({ ad }, i) => (
          <div key={ad.template}>
            <div className="overflow-hidden rounded-md">
              <FluidAd format="feed" {...piece(i)} />
            </div>
            <p className="mt-0.5 truncate text-[9.5px] font-semibold text-gv-mute">{TEMPLATE_LABELS[ad.template]}</p>
          </div>
        ))}
      </div>
      <div className="mt-auto">
        <Button>Revisar as peças</Button>
      </div>
    </>
  );
}

function ScreenEditor() {
  return (
    <>
      <p className="text-[17px] leading-tight font-bold tracking-[-0.02em]">Editar peça</p>
      <div className="mx-auto mt-3 w-[128px] overflow-hidden rounded-lg shadow-[0_10px_20px_-12px_rgb(67_27_32/0.6)]">
        <FluidAd format="feed" {...piece(0)} />
      </div>
      <div className="mt-3 grid gap-2">
        <Field label="Título" value={BAKERY.ad.headline} />
        <div className="flex items-center justify-between gap-2">
          <p className="text-[12px] font-semibold">Mostrar preço</p>
          <span className="flex h-4 w-7 items-center justify-end rounded-full bg-gv-red px-0.5">
            <span className="size-3 rounded-full bg-white" />
          </span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <p className="text-[12px] font-semibold">Cor</p>
          <span className="flex gap-1">
            {["#c2410c", "#3b1a08", "#15803d", "#1d4ed8"].map((c, i) => (
              <span
                key={c}
                className={cn("size-4 rounded-full", i === 0 && "ring-2 ring-gv-ink ring-offset-1")}
                style={{ background: c }}
              />
            ))}
          </span>
        </div>
      </div>
      <div className="mt-auto grid grid-cols-2 gap-2">
        <Button tone="ghost">Trocar foto</Button>
        <Button>Aprovar</Button>
      </div>
    </>
  );
}

function ScreenPublish() {
  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[17px] leading-tight font-bold tracking-[-0.02em]">Criar campanha</p>
        <span className="rounded-full bg-[#fdf0d8] px-2 py-0.5 text-[10px] font-bold text-[#9a5b00]">
          Nasce pausada
        </span>
      </div>
      <div className="mt-3 flex -space-x-2">
        {BAKERY_ROUND.map(({ ad }, i) => (
          <div key={ad.template} className="w-9 overflow-hidden rounded-md ring-2 ring-white">
            <FluidAd format="feed" {...piece(i)} />
          </div>
        ))}
      </div>
      <p className="mt-1.5 text-[11px] font-semibold text-gv-mute">5 peças aprovadas</p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Field label="Valor por dia" value="R$ 20" />
        <Field label="Duração" value="7 dias" />
      </div>
      <div className="mt-3 flex items-baseline justify-between rounded-xl bg-gv-paper p-2.5">
        <span className="text-[12px] text-gv-mute">Gasto máximo</span>
        <span className="text-[17px] font-bold text-gv-red">R$ 140,00</span>
      </div>
      <p className="mt-3 flex items-start gap-2 text-[11.5px] leading-snug">
        <Check />
        Autorizo criar a campanha pausada com R$ 20 por dia, por 7 dias.
      </p>
      <div className="mt-auto">
        <Button>Criar campanha pausada</Button>
      </div>
    </>
  );
}

function ScreenResults() {
  return (
    <>
      <p className="text-[17px] leading-tight font-bold tracking-[-0.02em]">Resultados</p>
      <div className="mt-3 rounded-xl bg-gv-wine p-3 text-white">
        <p className="text-[11px] text-white/70">Investido</p>
        <p className="text-[22px] leading-tight font-bold">R$ 86,40</p>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        {[
          ["Cliques", "312"],
          ["Conversas", "27"],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl border border-gv-line p-2.5">
            <p className="text-[11px] text-gv-mute">{label}</p>
            <p className="text-[18px] leading-tight font-bold">{value}</p>
          </div>
        ))}
      </div>
      <div className="mt-2 flex items-center gap-2.5 rounded-xl border border-gv-line p-2">
        <div className="w-10 shrink-0 overflow-hidden rounded-md">
          <FluidAd format="feed" {...piece(0)} />
        </div>
        <div className="min-w-0">
          <p className="truncate text-[12px] font-bold">{BAKERY.ad.headline}</p>
          <p className="flex items-center gap-1 text-[11px] font-semibold text-[#12795a]">
            <span className="size-1.5 rounded-full bg-[#12795a]" />
            Rodando
          </p>
        </div>
      </div>
      <div className="mt-auto">
        <Button tone="ghost">Pausar campanha</Button>
      </div>
    </>
  );
}

function WhatsIcon() {
  return (
    <svg
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
