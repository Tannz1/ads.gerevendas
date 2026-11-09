import type { CSSProperties, ReactNode } from "react";
import {
  AbsoluteFill,
  Audio,
  Easing,
  Img,
  interpolate,
  Sequence,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { BrandMark } from "@/components/marketing/brand-mark";
import { Inicio, Investimento, Oferta, Previa, Produto, Publicacao, Regiao, Resultados, type Tela } from "./uso/telas";
import { EstiloProvider, useEstilo } from "./estilo";
import type { Cena } from "./kit";
import { LegendaPalavra } from "./legenda";
import { soco, TrilhaFundo, Voz, VolumesProvider, type Volumes } from "./trilha";
import { Ad, BigPhone, PHOTOS, ROUND, usePreload } from "./shared";
import timeline from "./timeline-apresentacao.json";

/**
 * Vídeo de APRESENTAÇÃO (1920×1080): explica o app passo a passo, em tom calmo.
 * Fundo claro, telas inteiras, movimentos suaves (sem molas nem giros) e legenda por frase.
 */

const CENAS = timeline.cenas as Cena[];
const INK = "#13201a";
const MUTE = "#56665c";
const GREEN = "#1a8a3c";
const SOFT = "#e4f6e9";
const ease = Easing.out(Easing.cubic);

/** true na versão vertical (celular): título em cima, celular grande no meio, legenda maior. */
function useVertical() {
  const { width, height } = useVideoConfig();
  return height > width;
}

const PASSOS: Record<string, { n: number; nome: string; itens: string[]; tela: (t: Tela) => ReactNode }> = {
  inicio: {
    n: 1,
    nome: "Início",
    itens: ["Um botão principal: criar meu anúncio", "Os anúncios que estão rodando aparecem abaixo"],
    tela: (t) => <Inicio t={t} />,
  },
  produto: {
    n: 2,
    nome: "Produto",
    itens: ["Tire uma foto ou escolha da galeria", "Escreva o nome do produto"],
    tela: (t) => <Produto t={t} />,
  },
  oferta: {
    n: 3,
    nome: "Oferta",
    itens: ["Informe o preço", "Destaque parcelamento, desconto ou entrega", "A IA só usa o que você escreveu"],
    tela: (t) => <Oferta t={t} />,
  },
  previa: {
    n: 4,
    nome: "Prévia",
    itens: ["Cinco versões do anúncio com a sua foto", "Mude o texto se quiser, depois aprove"],
    tela: (t) => <Previa t={t} />,
  },
  regiao: {
    n: 5,
    nome: "Região",
    itens: ["Só na sua cidade", "Ou na cidade e região"],
    tela: (t) => <Regiao t={t} />,
  },
  investimento: {
    n: 6,
    nome: "Investimento",
    itens: ["Quanto por dia: R$ 10, R$ 20 ou R$ 30", "Por quantos dias", "O total aparece antes de seguir"],
    tela: (t) => <Investimento t={t} />,
  },
  publicacao: {
    n: 7,
    nome: "Publicação",
    itens: ["Confira região, duração, valor e destino", "O anúncio nasce pausado", "Só roda depois da sua confirmação"],
    tela: (t) => <Publicacao t={t} />,
  },
  resultados: {
    n: 8,
    nome: "Resultados",
    itens: [
      "Investido, conversas e custo por conversa",
      "Registre as vendas que vieram das conversas",
      "Pause quando quiser",
    ],
    tela: (t) => <Resultados t={t} />,
  },
};

/** `novo`: cursor do mouse e legenda dinâmica. Sem ele, o visual clássico. */
export function Apresentacao({ novo = false, ...volumes }: { novo?: boolean } & Partial<Volumes>) {
  return (
    <VolumesProvider volumes={volumes}>
      <EstiloProvider novo={novo}>
        <ApresentacaoConteudo />
      </EstiloProvider>
    </VolumesProvider>
  );
}

function ApresentacaoConteudo() {
  usePreload();
  const { fps } = useVideoConfig();
  return (
    <AbsoluteFill style={{ fontFamily: "Sora", color: INK }}>
      <Background />
      <Voz arquivo="apresentacao.mp3" />
      <TrilhaFundo cortes={CENAS.slice(1).map((c) => c.ini)} />
      {CENAS.map((c, i) => {
        const from = Math.round(c.ini * fps);
        const until = i === CENAS.length - 1 ? Math.round(timeline.duracao * fps) : Math.round(c.fim * fps);
        return (
          <Sequence key={c.id} from={from} durationInFrames={Math.max(1, until - from)} name={c.id}>
            <Soco>
              <Scene cena={c} />
            </Soco>
          </Sequence>
        );
      })}
      <TopBar />
    </AbsoluteFill>
  );
}

function Soco({ children }: { children: ReactNode }) {
  const frame = useCurrentFrame();
  return <AbsoluteFill style={{ transform: `scale(${soco(frame)})` }}>{children}</AbsoluteFill>;
}

/* ---------------------------------------------------------------- moldura */

function Background() {
  const frame = useCurrentFrame();
  const a = 85 + Math.sin(frame / 140) * 8;
  const b = 15 + Math.cos(frame / 170) * 10;
  const c = 5 + Math.cos(frame / 160) * 10;
  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(900px 600px at ${a}% ${b}%, rgba(34,197,94,0.14), transparent 70%), radial-gradient(800px 600px at ${c}% 95%, rgba(26,138,60,0.1), transparent 70%), #f6faf7`,
      }}
    />
  );
}

/** Logo no canto e, durante os passos, a barra de progresso dos 8 passos. */
function TopBar() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const atual = CENAS.find((c) => t >= c.ini && t < c.fim) ?? CENAS.at(-1)!;
  const passo = PASSOS[atual.id]?.n ?? 0;
  const v = useVertical();
  const enche = interpolate(t, [atual.ini, atual.ini + 0.6], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return (
    <>
      <div
        style={{
          position: "absolute",
          left: v ? 0 : 80,
          right: v ? 0 : undefined,
          top: v ? 80 : 56,
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          gap: 14,
        }}
      >
        <BrandMark className="h-12 w-auto" />
        <span
          style={{
            background: GREEN,
            color: "#fff",
            borderRadius: 8,
            padding: "4px 10px",
            fontSize: 22,
            fontWeight: 800,
          }}
        >
          Ads
        </span>
      </div>
      <div
        style={{
          position: "absolute",
          right: v ? 0 : 80,
          left: v ? 0 : undefined,
          top: v ? 178 : 74,
          display: "flex",
          justifyContent: "center",
          gap: 8,
          opacity: passo ? 1 : v ? 0 : 0.35,
        }}
      >
        {Array.from({ length: 8 }, (_, i) => (
          <span
            key={i}
            style={{
              width: v ? 84 : 56,
              height: v ? 10 : 8,
              borderRadius: 4,
              background:
                i < passo - 1
                  ? GREEN
                  : i === passo - 1
                    ? `linear-gradient(90deg, ${GREEN} ${enche * 100}%, #d5e2d9 ${enche * 100}%)`
                    : "#d5e2d9",
            }}
          />
        ))}
      </div>
    </>
  );
}

/** Entra e sai com fade e um deslocamento curto, sem quicar. */
function useShow(delay = 0) {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const enter = interpolate(frame, [delay / 2, delay / 2 + 8], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: ease,
  });
  const exit = interpolate(frame, [durationInFrames - 4, durationInFrames], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return { p: enter, o: Math.min(enter, exit) };
}

function Reveal({ delay = 0, children, style }: { delay?: number; children: ReactNode; style?: CSSProperties }) {
  const { p, o } = useShow(delay);
  return <div style={{ opacity: o, transform: `translateY(${(1 - p) * 24}px)`, ...style }}>{children}</div>;
}

/* ---------------------------------------------------------------- cenas */

function Scene({ cena }: { cena: Cena }) {
  const passo = PASSOS[cena.id];
  const vertical = useVertical();
  return (
    <AbsoluteFill>
      {passo ? <StepScene passo={passo} id={cena.id} /> : OUTRAS[cena.id]?.()}
      <Subtitle cena={cena} lado={passo && !vertical ? "esquerda" : "centro"} />
    </AbsoluteFill>
  );
}

function StepScene({ passo, id }: { passo: (typeof PASSOS)[string]; id: string }) {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const { p, o } = useShow(4);
  // A tela "acontece" durante a fala do passo: toques, digitação e números subindo.
  const t: Tela = { f: frame, d: durationInFrames };
  const zoom = interpolate(frame, [0, durationInFrames], [1, 1.05], { extrapolateRight: "clamp" });
  const vertical = useVertical();
  if (vertical) {
    return (
      <AbsoluteFill style={{ alignItems: "center" }}>
        <div style={{ marginTop: 270, textAlign: "center" }}>
          <Reveal>
            <span
              style={{
                background: SOFT,
                color: GREEN,
                borderRadius: 999,
                padding: "12px 26px",
                fontSize: 34,
                fontWeight: 700,
              }}
            >
              Passo {passo.n} de 8
            </span>
          </Reveal>
          <Reveal delay={6}>
            <p style={{ margin: "30px 0 0", fontSize: 104, fontWeight: 800, letterSpacing: "-0.045em", lineHeight: 1 }}>
              {passo.nome}
            </p>
          </Reveal>
        </div>
        <div
          style={{
            marginTop: 50,
            opacity: o,
            transform: `translateY(${(1 - p) * 40}px) scale(${zoom})`,
            filter: "drop-shadow(0 40px 50px rgba(19,32,26,0.22))",
          }}
        >
          <BigPhone width={470}>{passo.tela(t)}</BigPhone>
        </div>
      </AbsoluteFill>
    );
  }
  return (
    <AbsoluteFill>
      <div style={{ position: "absolute", left: 160, top: 250, width: 780 }}>
        <Reveal>
          <span
            style={{
              background: SOFT,
              color: GREEN,
              borderRadius: 999,
              padding: "10px 22px",
              fontSize: 28,
              fontWeight: 700,
            }}
          >
            Passo {passo.n} de 8
          </span>
        </Reveal>
        <Reveal delay={6}>
          <p style={{ margin: "28px 0 0", fontSize: 104, fontWeight: 800, letterSpacing: "-0.045em", lineHeight: 1 }}>
            {passo.nome}
          </p>
        </Reveal>
        <div style={{ marginTop: 44, display: "grid", gap: 22 }}>
          {passo.itens.map((t, i) => (
            <Reveal key={t} delay={20 + i * 22}>
              <p
                style={{
                  margin: 0,
                  display: "flex",
                  alignItems: "center",
                  gap: 18,
                  fontSize: 36,
                  color: MUTE,
                  fontFamily: "Inter",
                  fontWeight: 500,
                }}
              >
                <span
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: "50%",
                    background: GREEN,
                    display: "grid",
                    placeItems: "center",
                    flexShrink: 0,
                  }}
                >
                  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#fff" strokeWidth="3.4">
                    <path d="M20 6 9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
                {t}
              </p>
            </Reveal>
          ))}
        </div>
        {id === "previa" && (
          <Reveal delay={70} style={{ display: "flex", gap: 14, marginTop: 44 }}>
            {ROUND.map(({ ad }) => (
              <div key={ad.template} style={{ boxShadow: "0 10px 24px rgba(19,32,26,0.18)", borderRadius: 14 }}>
                <Ad width={124} content={ad} />
              </div>
            ))}
          </Reveal>
        )}
      </div>
      {/* Celular inteiro, entrando de leve e flutuando pouco. */}
      <div
        style={{
          position: "absolute",
          left: 1180,
          top: 130 + Math.sin(frame / 45) * 4,
          opacity: o,
          transform: `translateY(${(1 - p) * 40}px) scale(${zoom})`,
          transformOrigin: "50% 40%",
          filter: "drop-shadow(0 40px 50px rgba(19,32,26,0.22))",
        }}
      >
        <BigPhone width={390}>{passo.tela(t)}</BigPhone>
      </div>
    </AbsoluteFill>
  );
}

const OUTRAS: Record<string, () => ReactNode> = {
  intro: () => <Intro />,
  visao: () => <Overview />,
  resumo: () => <Summary />,
  preco: () => <Price />,
  fim: () => <End />,
};

function Intro() {
  const { p, o } = useShow(0);
  const vertical = useVertical();
  if (vertical) {
    return (
      <AbsoluteFill style={{ alignItems: "center", paddingTop: 330, paddingLeft: 80, paddingRight: 80 }}>
        <Reveal>
          <p style={{ margin: 0, color: GREEN, fontSize: 40, fontWeight: 700, textAlign: "center" }}>
            Como funciona o GereVendas Ads
          </p>
        </Reveal>
        <Reveal delay={8}>
          <p
            style={{
              margin: "24px 0 0",
              fontSize: 110,
              fontWeight: 800,
              letterSpacing: "-0.045em",
              lineHeight: 1.02,
              textAlign: "center",
            }}
          >
            Da foto ao cliente no WhatsApp
          </p>
        </Reveal>
        <div
          style={{
            marginTop: 70,
            width: 900,
            opacity: o,
            transform: `scale(${0.96 + 0.04 * p})`,
            borderRadius: 36,
            overflow: "hidden",
            boxShadow: "0 40px 70px rgba(19,32,26,0.25)",
          }}
        >
          <Img src={PHOTOS[1]} style={{ width: "100%", aspectRatio: "3 / 2", objectFit: "cover", display: "block" }} />
        </div>
      </AbsoluteFill>
    );
  }
  return (
    <AbsoluteFill>
      <div style={{ position: "absolute", left: 160, top: 300, width: 760 }}>
        <Reveal>
          <p style={{ margin: 0, color: GREEN, fontSize: 32, fontWeight: 700 }}>Como funciona o GereVendas Ads</p>
        </Reveal>
        <Reveal delay={8}>
          <p style={{ margin: "20px 0 0", fontSize: 92, fontWeight: 800, letterSpacing: "-0.045em", lineHeight: 1.02 }}>
            Da foto ao cliente no WhatsApp
          </p>
        </Reveal>
      </div>
      <div
        style={{
          position: "absolute",
          left: 1000,
          top: 230,
          width: 780,
          opacity: o,
          transform: `scale(${0.96 + 0.04 * p})`,
          borderRadius: 32,
          overflow: "hidden",
          boxShadow: "0 40px 70px rgba(19,32,26,0.25)",
        }}
      >
        <Img src={PHOTOS[1]} style={{ width: "100%", aspectRatio: "3 / 2", objectFit: "cover", display: "block" }} />
      </div>
    </AbsoluteFill>
  );
}

function Overview() {
  const v = useVertical();
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const aceso = Math.floor(
    interpolate(frame, [20, durationInFrames - 10], [0, 8], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
  );
  return (
    <AbsoluteFill style={{ alignItems: "center", paddingTop: v ? 330 : 190 }}>
      <Reveal>
        <p
          style={{
            margin: 0,
            fontSize: v ? 76 : 64,
            fontWeight: 800,
            letterSpacing: "-0.04em",
            textAlign: "center",
            maxWidth: v ? 820 : undefined,
          }}
        >
          Oito passos, todos no celular
        </p>
      </Reveal>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: v ? "repeat(2, 440px)" : "repeat(4, 340px)",
          gap: 24,
          marginTop: 56,
        }}
      >
        {Object.values(PASSOS).map((s, i) => (
          <Reveal key={s.nome} delay={10 + i * 8}>
            <div
              style={{
                background: i < aceso ? SOFT : "#fff",
                borderRadius: 24,
                padding: "26px 28px",
                transition: "none",
                border: "1px solid #e1ebe4",
                boxShadow: "0 12px 30px rgba(19,32,26,0.08)",
                display: "flex",
                alignItems: "center",
                gap: 18,
              }}
            >
              <span
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: "50%",
                  background: GREEN,
                  color: "#fff",
                  display: "grid",
                  placeItems: "center",
                  fontSize: 26,
                  fontWeight: 800,
                }}
              >
                {s.n}
              </span>
              <span style={{ fontSize: 34, fontWeight: 700 }}>{s.nome}</span>
            </div>
          </Reveal>
        ))}
      </div>
    </AbsoluteFill>
  );
}

function Summary() {
  const itens = ["Você manda a foto", "Define preço, região e valor", "Aprova o anúncio", "O app faz o resto"];
  const v = useVertical();
  return (
    <AbsoluteFill style={{ alignItems: "center", paddingTop: v ? 300 : 260 }}>
      <Reveal>
        <p style={{ margin: 0, fontSize: 64, fontWeight: 800, letterSpacing: "-0.04em" }}>Resumindo</p>
      </Reveal>
      <div
        style={{ display: "flex", flexDirection: v ? "column" : "row", alignItems: "center", gap: 20, marginTop: 60 }}
      >
        {itens.map((t, i) => (
          <Reveal
            key={t}
            delay={12 + i * 14}
            style={{ display: "flex", flexDirection: v ? "column" : "row", alignItems: "center", gap: 20 }}
          >
            <div
              style={{
                width: v ? 640 : 330,
                height: v ? 150 : 170,
                background: i === 3 ? GREEN : "#fff",
                color: i === 3 ? "#fff" : INK,
                borderRadius: 26,
                border: "1px solid #e1ebe4",
                boxShadow: "0 12px 30px rgba(19,32,26,0.1)",
                display: "grid",
                placeItems: "center",
                textAlign: "center",
                padding: 24,
                fontSize: 34,
                fontWeight: 700,
              }}
            >
              {t}
            </div>
            {i < 3 && <span style={{ fontSize: 48, color: "#b8c9be" }}>{v ? "↓" : "→"}</span>}
          </Reveal>
        ))}
      </div>
    </AbsoluteFill>
  );
}

function Price() {
  const v = useVertical();
  return (
    <AbsoluteFill style={{ alignItems: "center", paddingTop: v ? 520 : 230 }}>
      <Reveal>
        <div
          style={{
            width: v ? 900 : 860,
            background: "#fff",
            borderRadius: 36,
            border: "1px solid #e1ebe4",
            boxShadow: "0 30px 60px rgba(19,32,26,0.12)",
            padding: "56px 64px",
            textAlign: "center",
          }}
        >
          <p style={{ margin: 0, color: GREEN, fontSize: 32, fontWeight: 700 }}>Plano do piloto</p>
          <p style={{ margin: "16px 0 0", fontSize: 140, fontWeight: 800, letterSpacing: "-0.05em", lineHeight: 1 }}>
            R$ 199
            <span style={{ marginLeft: 20, fontSize: 46, fontWeight: 600, letterSpacing: 0, color: MUTE }}>
              por mês
            </span>
          </p>
          <p style={{ margin: "26px 0 0", fontSize: 32, color: MUTE, fontFamily: "Inter" }}>
            A verba dos anúncios é à parte, no valor que você escolher.
          </p>
        </div>
      </Reveal>
    </AbsoluteFill>
  );
}

function End() {
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", paddingBottom: 120 }}>
      <Reveal style={{ display: "flex", alignItems: "center", gap: 22 }}>
        <BrandMark className="h-28 w-auto" />
        <span
          style={{
            background: GREEN,
            color: "#fff",
            borderRadius: 14,
            padding: "6px 18px",
            fontSize: 48,
            fontWeight: 800,
          }}
        >
          Ads
        </span>
      </Reveal>
      <Reveal delay={10}>
        <p style={{ margin: "36px 0 0", fontSize: 54, fontWeight: 800, letterSpacing: "-0.03em" }}>
          Crie o seu primeiro anúncio
        </p>
      </Reveal>
    </AbsoluteFill>
  );
}

/* ---------------------------------------------------------------- legenda por frase */

/** Legenda de Reels: uma palavra por vez, grande e sem tarja. */
function Subtitle({ cena, lado }: { cena: Cena; lado: "esquerda" | "centro" }) {
  const v = useVertical();
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <LegendaPalavra
      cena={cena}
      t={cena.ini + frame / fps}
      left={lado === "esquerda" ? 120 : 40}
      right={lado === "esquerda" ? 900 : 40}
      bottom={v ? 170 : 80}
      fontSize={v ? 92 : 76}
    />
  );
}
