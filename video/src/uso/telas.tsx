import type { ReactNode } from "react";
import { Easing, interpolate } from "remotion";
import { BAKERY, BAKERY_ROUND } from "@/components/marketing/demo-ads";
import { cn } from "@/lib/cn";
import { useEstilo } from "../estilo";
import { Ad } from "../shared";

/**
 * Telas do fluxo simples ANIMADAS quadro a quadro, como uma gravação de tela: toque, digitação,
 * seleção e números subindo. Mesmo desenho das telas da LP (storyboard.tsx). `f` = quadro da cena,
 * `d` = duração da cena em quadros. Negócio e números são de exemplo.
 */
export type Tela = { f: number; d: number };

const PHOTO = BAKERY.photo ?? null;
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const ease = Easing.inOut(Easing.cubic);

/** Fração 0→1 entre dois pontos da cena (em proporção da duração). */
const at = (t: Tela, a: number, b: number) => interpolate(t.f, [t.d * a, t.d * b], [0, 1], { ...clamp, easing: ease });
/** Texto sendo digitado entre duas proporções da cena. */
const typed = (t: Tela, text: string, a: number, b: number) => text.slice(0, Math.round(at(t, a, b) * text.length));
const caret = (t: Tela, a: number, b: number) => t.f >= t.d * a && t.f <= t.d * b + 8 && Math.floor(t.f / 8) % 2 === 0;

/**
 * Clique como numa gravação de tela: o cursor desliza até o alvo, clica (onda + botão afundando) e some.
 * `quando` = proporção da cena em que acontece o clique.
 */
export function Tap({
  t,
  quando,
  children,
  className,
  soNovo = false,
}: {
  t: Tela;
  quando: number;
  children: ReactNode;
  className?: string;
  /** Clique que só existe no visual novo (ex.: clicar no campo antes de digitar). */
  soNovo?: boolean;
}) {
  const { novo } = useEstilo();
  const q = t.d * quando;
  if (!novo) {
    if (soNovo) return <div className={className}>{children}</div>;
    // Visual clássico: só o círculo do toque.
    const pc = interpolate(t.f, [q - 6, q, q + 10], [0, 1, 1.6], clamp);
    const oc = interpolate(t.f, [q - 6, q, q + 12], [0, 0.55, 0], clamp);
    const pressc = interpolate(t.f, [q - 2, q, q + 5], [1, 0.95, 1], clamp);
    return (
      <div className={cn("relative", className)} style={{ transform: `scale(${pressc})` }}>
        {children}
        <span
          className="pointer-events-none absolute top-1/2 left-1/2 size-9 rounded-full bg-gv-ink"
          style={{ opacity: oc, transform: `translate(-50%, -50%) scale(${pc})` }}
        />
      </div>
    );
  }
  // Onda do clique
  const p = interpolate(t.f, [q - 2, q, q + 12], [0, 1, 1.8], clamp);
  const o = interpolate(t.f, [q - 2, q, q + 14], [0, 0.35, 0], clamp);
  const press = interpolate(t.f, [q - 2, q, q + 5], [1, 0.95, 1], clamp);
  // Cursor: chega de baixo à direita, para no alvo, aperta e some
  // Janela curta (cerca de 0,8 s): dois cliques próximos nunca mostram dois cursores juntos.
  const chega = interpolate(t.f, [q - 16, q - 3], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
  const visivel = interpolate(t.f, [q - 18, q - 14, q + 3, q + 7], [0, 1, 1, 0], clamp);
  const aperta = interpolate(t.f, [q - 2, q, q + 4], [1, 0.82, 1], clamp);
  return (
    <div className={cn("relative", className)} style={{ transform: `scale(${press})` }}>
      {children}
      <span
        className="pointer-events-none absolute top-1/2 left-1/2 size-9 rounded-full bg-gv-green"
        style={{ opacity: o, transform: `translate(-50%, -50%) scale(${p})` }}
      />
      <svg
        aria-hidden
        viewBox="0 0 24 24"
        className="pointer-events-none absolute top-1/2 left-1/2 z-10 size-[18px] drop-shadow-[0_2px_3px_rgba(0,0,0,0.35)]"
        style={{
          opacity: visivel,
          transform: `translate(${(1 - chega) * 70 - 3}px, ${(1 - chega) * 90 - 2}px) scale(${aperta})`,
          transformOrigin: "3px 2px",
        }}
      >
        <path
          d="M3 2l16 9.5-7 1.6 4 7.4-3 1.5-4-7.4L4 19z"
          fill="#13201a"
          stroke="#fff"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

function Top({ step, title }: { step?: number; title: string }) {
  return (
    <>
      {step !== undefined && (
        <div className="flex items-center gap-2">
          <span className="text-[15px] leading-none">←</span>
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

function Button({ children, ghost }: { children: ReactNode; ghost?: boolean }) {
  return (
    <p
      className={cn(
        "rounded-xl py-2.5 text-center text-[13px] font-bold",
        ghost ? "border border-gv-line text-gv-ink" : "bg-gv-green text-white",
      )}
    >
      {children}
    </p>
  );
}

function Photo({ className }: { className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element -- quadro de vídeo
  return PHOTO ? <img src={PHOTO} alt="" className={cn("object-cover", className)} /> : null;
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

function Input({ children, ativo, grande }: { children: ReactNode; ativo?: boolean; grande?: boolean }) {
  return (
    <p
      className={cn(
        "mt-1 min-h-[2.1em] rounded-lg border px-2.5 py-1.5 font-medium",
        ativo ? "border-gv-green ring-2 ring-gv-green/20" : "border-gv-line",
        grande && "text-[15px] font-bold",
      )}
    >
      {children}
    </p>
  );
}

const Caret = ({ on }: { on: boolean }) => (
  <span className="ml-px inline-block h-[1em] w-px translate-y-[2px] bg-gv-ink" style={{ opacity: on ? 1 : 0 }} />
);

/* ---------------------------------------------------------------- telas */

export function Inicio({ t }: { t: Tela }) {
  return (
    <>
      <div className="rounded-2xl bg-gv-green p-3 text-white">
        <p className="text-[10px] text-white/80">Olá, {BAKERY.businessName}</p>
        <p className="mt-1 text-[18px] leading-tight font-bold">Vamos vender mais?</p>
        <Tap t={t} quando={0.72}>
          <p className="mt-3 rounded-lg bg-white py-2 text-center text-[12px] font-bold text-gv-green-strong">
            + Criar meu anúncio
          </p>
        </Tap>
      </div>
      <p className="mt-4 text-[12px] font-bold">Meus anúncios</p>
      <p className="mt-2 rounded-xl border border-dashed border-gv-line p-3 text-center text-[11px] text-gv-mute">
        Seu primeiro anúncio aparece aqui.
      </p>
      <div className="mt-auto grid grid-cols-3 gap-1 border-t border-gv-line pt-2 text-center text-[10px] font-semibold text-gv-mute">
        <span className="rounded-lg bg-[#e4f6e9] py-1 text-gv-green-strong">Início</span>
        <span className="py-1">Anúncios</span>
        <span className="py-1">Conta</span>
      </div>
    </>
  );
}

export function Produto({ t }: { t: Tela }) {
  const temFoto = t.f >= t.d * 0.22;
  const flash = interpolate(t.f, [t.d * 0.2, t.d * 0.22, t.d * 0.32], [0, 0.9, 0], clamp);
  const nome = typed(t, "Café da manhã completo", 0.36, 0.72);
  return (
    <>
      <Top step={1} title="O que você quer vender?" />
      <Tap t={t} quando={0.18} className="mt-3">
        <div className="relative aspect-[4/3] w-full overflow-hidden rounded-xl bg-gv-paper">
          {temFoto ? (
            <Photo className="size-full" />
          ) : (
            <div className="grid size-full place-items-center text-[11px] font-semibold text-gv-mute">
              📷 Tirar ou escolher uma foto
            </div>
          )}
          <span className="absolute inset-0 bg-white" style={{ opacity: flash }} />
        </div>
      </Tap>
      <p className="mt-3 text-[11px] font-semibold text-gv-mute">Nome do produto</p>
      <Tap t={t} quando={0.33} soNovo>
        <Input ativo={t.f > t.d * 0.34 && t.f < t.d * 0.8}>
          {nome}
          <Caret on={caret(t, 0.36, 0.72)} />
        </Input>
      </Tap>
      <div className="mt-auto">
        <Tap t={t} quando={0.9}>
          <Button>Continuar</Button>
        </Tap>
      </div>
    </>
  );
}

export function Oferta({ t }: { t: Tela }) {
  const preco = typed(t, "24,90", 0.08, 0.22);
  const entrega = t.f >= t.d * 0.34;
  const destaque = typed(t, "Retire no balcão sem fila", 0.4, 0.66);
  return (
    <>
      <Top step={2} title="Qual é a sua oferta?" />
      <div className="mt-3 flex items-center gap-2.5">
        <Photo className="size-11 rounded-lg" />
        <p className="text-[12px] font-bold">Café da manhã completo</p>
      </div>
      <p className="mt-3 text-[11px] font-semibold text-gv-mute">Preço</p>
      <Tap t={t} quando={0.06} soNovo>
        <Input ativo={t.f < t.d * 0.28} grande>
          R$ {preco}
          <Caret on={caret(t, 0.08, 0.22)} />
        </Input>
      </Tap>
      <p className="mt-3 text-[11px] font-semibold text-gv-mute">O que você quer destacar?</p>
      <div className="mt-1 flex flex-wrap gap-1">
        {["Parcelamento", "Desconto", "Entrega"].map((d, i) => {
          const on = i === 2 && entrega;
          const el = (
            <span
              className={cn(
                "inline-block rounded-lg border px-2 py-1 text-[10.5px] font-semibold",
                on ? "border-gv-green bg-[#e4f6e9] text-gv-green-strong" : "border-gv-line text-gv-mute",
              )}
            >
              {on && "✓ "}
              {d}
            </span>
          );
          return i === 2 ? (
            <Tap key={d} t={t} quando={0.33} className="inline-block">
              {el}
            </Tap>
          ) : (
            <span key={d}>{el}</span>
          );
        })}
      </div>
      {entrega && (
        <p className="mt-2 flex items-center gap-1.5 rounded-lg bg-[#e4f6e9] px-2 py-1.5 text-[11.5px] font-semibold">
          <Check />
          {destaque || <span className="font-normal text-gv-mute">Ex.: entrega no mesmo dia</span>}
          <Caret on={caret(t, 0.4, 0.66)} />
        </p>
      )}
      <div className="mt-auto">
        <Tap t={t} quando={0.92}>
          <Button>Criar meu anúncio</Button>
        </Tap>
      </div>
    </>
  );
}

export function Previa({ t }: { t: Tela }) {
  const pronto = t.f >= t.d * 0.2;
  // Passa da versão 1 até a 3 e volta para a 1.
  const pos = interpolate(t.f, [t.d * 0.35, t.d * 0.5, t.d * 0.58, t.d * 0.72, t.d * 0.8], [0, 1, 1, 2, 0], {
    ...clamp,
    easing: ease,
  });
  const versao = Math.round(pos) + 1;
  return (
    <>
      <Top step={3} title={pronto ? "Olha como ficou!" : "Criando seu anúncio…"} />
      {pronto ? (
        <div className="mt-3 overflow-hidden rounded-xl">
          <div className="flex" style={{ transform: `translateX(${-pos * 100}%)` }}>
            {BAKERY_ROUND.slice(0, 3).map(({ ad }) => (
              <div key={ad.template} className="w-full shrink-0">
                <Ad width={228} content={ad} />
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="mt-3 grid aspect-[4/5] place-items-center rounded-xl bg-gv-paper">
          <div className="text-center">
            <span
              className="mx-auto block size-8 rounded-full border-[3px] border-gv-green border-t-transparent"
              style={{ transform: `rotate(${t.f * 18}deg)` }}
            />
            <p className="mt-2 text-[11px] font-semibold text-gv-mute">Escrevendo 5 versões…</p>
          </div>
        </div>
      )}
      <p className="mt-2 text-center text-[11px] font-semibold">{pronto ? `Versão ${versao} de 5` : " "}</p>
      <div className="mt-auto grid gap-1.5">
        <Tap t={t} quando={0.92}>
          <Button>Gostei, continuar</Button>
        </Tap>
        <Button ghost>Quero mudar algo</Button>
      </div>
    </>
  );
}

export function Regiao({ t }: { t: Tela }) {
  const regiao = t.f >= t.d * 0.5;
  const r = interpolate(t.f, [t.d * 0.5, t.d * 0.62], [96, 150], { ...clamp, easing: ease });
  return (
    <>
      <Top step={4} title="Onde estão seus clientes?" />
      <p className="mt-3 rounded-lg border border-gv-line px-2.5 py-1.5 font-semibold">📍 Campinas, SP</p>
      <div className="relative mt-3 h-[150px] overflow-hidden rounded-xl bg-[#eef1ec]">
        <span className="absolute top-[38%] -left-2 h-2 w-[120%] -rotate-6 bg-white" />
        <span className="absolute top-0 left-[58%] h-full w-2 rotate-12 bg-white" />
        <span className="absolute top-[72%] -left-2 h-1.5 w-[120%] rotate-3 bg-white" />
        <span className="absolute top-0 left-[22%] h-full w-1.5 -rotate-3 bg-white" />
        <span
          className="absolute top-1/2 left-1/2 -translate-1/2 rounded-full border-2 border-gv-green bg-gv-green/15"
          style={{ width: r, height: r }}
        />
        <span className="absolute top-1/2 left-1/2 size-4 -translate-1/2 rounded-full border-2 border-white bg-gv-green" />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-1.5 text-center text-[11px] font-bold">
        <span
          className={cn(
            "rounded-lg border-2 py-1.5",
            regiao ? "border-gv-line text-gv-mute" : "border-gv-green bg-[#e4f6e9]",
          )}
        >
          Na cidade
        </span>
        <Tap t={t} quando={0.48}>
          <span
            className={cn(
              "block rounded-lg border-2 py-1.5",
              regiao ? "border-gv-green bg-[#e4f6e9]" : "border-gv-line text-gv-mute",
            )}
          >
            Cidade e região
          </span>
        </Tap>
      </div>
      <div className="mt-auto">
        <Tap t={t} quando={0.92}>
          <Button>Continuar</Button>
        </Tap>
      </div>
    </>
  );
}

export function Investimento({ t }: { t: Tela }) {
  const vinte = t.f >= t.d * 0.25;
  const total = Math.round(interpolate(t.f, [t.d * 0.3, t.d * 0.6], [70, 140], clamp));
  return (
    <>
      <Top step={5} title="Quanto quer investir?" />
      <div className="mt-3 grid grid-cols-3 gap-1.5 text-center">
        {["R$ 10", "R$ 20", "R$ 30"].map((v, i) => {
          const on = vinte ? i === 1 : i === 0;
          const el = (
            <span
              className={cn(
                "block rounded-xl border-2 py-3 text-[14px] font-bold",
                on ? "border-gv-green bg-[#e4f6e9]" : "border-gv-line",
              )}
            >
              {v}
              <span className="block text-[10px] font-medium text-gv-mute">por dia</span>
            </span>
          );
          return i === 1 ? (
            <Tap key={v} t={t} quando={0.24}>
              {el}
            </Tap>
          ) : (
            <span key={v}>{el}</span>
          );
        })}
      </div>
      <p className="mt-3 text-[11px] font-semibold text-gv-mute">Por quanto tempo?</p>
      <p className="mt-1 rounded-lg border border-gv-line px-2.5 py-1.5 font-semibold">7 dias</p>
      <div className="mt-3 rounded-xl bg-[#e4f6e9] p-3 text-center">
        <p className="text-[11px] text-gv-mute">Total em anúncios</p>
        <p className="text-[22px] leading-tight font-bold">R$ {total}</p>
      </div>
      <div className="mt-auto">
        <Tap t={t} quando={0.9}>
          <Button>Revisar e anunciar</Button>
        </Tap>
      </div>
    </>
  );
}

export function Publicacao({ t }: { t: Tela }) {
  const linhas = [
    ["Região", "Campinas e região"],
    ["Duração", "7 dias"],
    ["Investimento", "R$ 140"],
    ["Destino", "seu WhatsApp"],
  ];
  const publicado = t.f >= t.d * 0.62;
  const toast = interpolate(t.f, [t.d * 0.62, t.d * 0.7], [0, 1], { ...clamp, easing: ease });
  return (
    <>
      <Top step={6} title="Tudo pronto!" />
      <div className="mt-3 flex items-center gap-2.5 rounded-xl border border-gv-line p-2">
        <div className="w-11 shrink-0 overflow-hidden rounded-md">
          <Ad width={44} content={BAKERY_ROUND[0].ad} />
        </div>
        <div className="min-w-0">
          <p className="truncate text-[12px] font-bold">{BAKERY.ad.headline}</p>
          <p className="text-[11px] text-gv-mute">R$ 24,90</p>
        </div>
      </div>
      <div className="mt-2 divide-y divide-gv-line text-[11.5px]">
        {linhas.map(([k, v], i) => (
          <p
            key={k}
            className="flex justify-between py-1.5"
            style={{ opacity: at(t, 0.05 + i * 0.06, 0.12 + i * 0.06) }}
          >
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
        <Tap t={t} quando={0.58}>
          <Button>{publicado ? "✓ Anúncio criado" : "Publicar anúncio"}</Button>
        </Tap>
      </div>
      <div
        className="absolute inset-x-3 bottom-16 rounded-xl bg-gv-ink px-3 py-2.5 text-[11px] leading-snug text-white shadow-lg"
        style={{ opacity: toast, transform: `translateY(${(1 - toast) * 14}px)` }}
      >
        <b>Anúncio criado e pausado.</b> Ele só começa a rodar quando você confirmar.
      </div>
    </>
  );
}

export function Resultados({ t }: { t: Tela }) {
  const p = at(t, 0.1, 0.55);
  const reais = (n: number) => n.toFixed(2).replace(".", ",");
  return (
    <>
      <Top title="Seu anúncio em números" />
      <div className="mt-3 grid grid-cols-3 gap-1.5 text-center">
        {[
          [`R$ ${Math.round(120 * p)}`, "Investido"],
          [`${Math.round(18 * p)}`, "Conversas"],
          [p < 0.05 ? "—" : `R$ ${reais(6.67)}`, "Por conversa"],
        ].map(([v, k]) => (
          <div key={k} className="rounded-xl border border-gv-line px-1 py-2.5">
            <p className="text-[14px] leading-tight font-bold">{v}</p>
            <p className="text-[9.5px] text-gv-mute">{k}</p>
          </div>
        ))}
      </div>
      <p
        className="mt-3 flex items-center gap-1.5 rounded-xl bg-[#e4f6e9] px-2.5 py-2 text-[11.5px] font-semibold"
        style={{ opacity: at(t, 0.5, 0.6) }}
      >
        ✨ Estamos testando 5 versões
      </p>
      <p className="mt-3 text-[12px] font-bold">Alguma conversa virou venda?</p>
      <div className="mt-2">
        <Button>Registrar vendas</Button>
      </div>
      <div className="mt-auto">
        <Button ghost>Pausar anúncio</Button>
      </div>
    </>
  );
}
