import type { CSSProperties, ReactNode } from "react";
import {
  AbsoluteFill,
  Audio,
  Img,
  interpolate,
  Sequence,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { BrandMark } from "@/components/marketing/brand-mark";
import { EstiloProvider } from "../estilo";
import type { Cena } from "../kit";
import { LegendaPalavra } from "../legenda";
import { Ad, BigPhone, ROUND, usePreload } from "../shared";
import timeline from "../timeline-dinamico.json";
import { Investimento, Oferta, Produto, Publicacao, Regiao, type Tela } from "../uso/telas";

/**
 * Reels dinâmico (1080×1920): cortes curtos no ritmo da narração, texto gigante entrando palavra por palavra,
 * ilustrações 3D de pelúcia, o app em uso com o cursor, música e efeitos sonoros. Exemplo ilustrativo.
 */
const CENAS = timeline.cenas as Cena[];
const VERDE = "#0e7a3c";
const VIVO = "#1fbf4a";
const MENTA = "#e9f8ee";
const TINTA = "#10231a";
const AMARELO = "#ffd43b";
const FPS = 30;

const img3d = (n: string) => staticFile(`3d/${n}.png`);
const SFX = (n: string) => staticFile(`sfx-${n}.mp3`);

/** Cenas de "texto gigante" (sem celular, sem legenda: o próprio texto é a fala). */
const SLAM = new Set(["gancho", "gancho2", "dor", "solucao", "oferta", "cta"]);

export function ReelsDinamico() {
  usePreload();
  return (
    <EstiloProvider novo>
      <AbsoluteFill style={{ fontFamily: "Sora", background: MENTA }}>
        <Audio src={staticFile("musica-reels.mp3")} volume={0.16} />
        <Audio src={staticFile("dinamico.mp3")} />
        {CENAS.map((c, i) => {
          const from = Math.round(c.ini * FPS);
          const ate = i === CENAS.length - 1 ? Math.round((timeline.duracao + 1.2) * FPS) : Math.round(c.fim * FPS);
          return (
            <Sequence key={c.id} from={from} durationInFrames={Math.max(1, ate - from)} name={c.id}>
              <Cena cena={c} />
              {/* Whoosh em cada corte; impacto nas cenas de texto gigante */}
              {i > 0 && <Audio src={SFX("whoosh")} volume={0.14} />}
              {SLAM.has(c.id) && (
                <Sequence from={3}>
                  <Audio src={SFX("impacto")} volume={0.12} />
                </Sequence>
              )}
            </Sequence>
          );
        })}
      </AbsoluteFill>
    </EstiloProvider>
  );
}

/* ---------------------------------------------------------------- moldura de cada cena */

function Cena({ cena }: { cena: Cena }) {
  const frame = useCurrentFrame();
  const { durationInFrames, fps } = useVideoConfig();
  // Entrada em "chicote": desliza da direita com leve giro; saída rápida para a esquerda.
  const entra = spring({ frame, fps, config: { damping: 18, stiffness: 180, mass: 0.6 } });
  const sai = interpolate(frame, [durationInFrames - 5, durationInFrames], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const x = (1 - entra) * 1080 - sai * 1080;
  const giro = (1 - entra) * 6 - sai * 6;
  const soco = interpolate(frame, [0, 6, 14], [1.08, 1.08, 1], { extrapolateRight: "clamp" });
  const slam = SLAM.has(cena.id);
  const t = cena.ini + frame / fps;
  return (
    <AbsoluteFill style={{ transform: `translateX(${x}px) rotate(${giro}deg) scale(${soco})` }}>
      <Fundo verde={slam && cena.id !== "dor"} />
      {CONTEUDO[cena.id]?.(cena)}
      {!slam && <LegendaPalavra cena={cena} t={t} bottom={150} fontSize={92} />}
    </AbsoluteFill>
  );
}

/** Fundo vivo: verde forte nas cenas de impacto, menta com curvas nas cenas do app. */
function Fundo({ verde }: { verde: boolean }) {
  const frame = useCurrentFrame();
  const a = 50 + Math.sin(frame / 25) * 20;
  return (
    <AbsoluteFill
      style={{
        background: verde
          ? `radial-gradient(900px 900px at ${a}% 30%, ${VIVO}, ${VERDE} 70%)`
          : `radial-gradient(700px 600px at ${100 - a}% 0%, #ffffff, transparent 70%), radial-gradient(900px 700px at ${a}% 100%, #c9f0d4, transparent 70%), ${MENTA}`,
      }}
    />
  );
}

/* ---------------------------------------------------------------- peças */

/** Texto gigante entrando palavra por palavra, com mola. */
function Slam({
  texto,
  cor = "#fff",
  tamanho = 128,
  top = 520,
  delay = 0,
}: {
  texto: string;
  cor?: string;
  tamanho?: number;
  top?: number;
  delay?: number;
}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const palavras = texto.split(" ");
  return (
    <div
      style={{
        position: "absolute",
        left: 70,
        right: 70,
        top,
        display: "flex",
        flexWrap: "wrap",
        justifyContent: "center",
        gap: "0 0.25em",
        fontSize: tamanho,
        fontWeight: 800,
        lineHeight: 1.02,
        letterSpacing: "-0.04em",
        color: cor,
        textAlign: "center",
      }}
    >
      {palavras.map((p, i) => {
        const s = spring({ frame: frame - delay - i * 3, fps, config: { damping: 11, stiffness: 220, mass: 0.5 } });
        return (
          <span
            key={i}
            style={{
              display: "inline-block",
              transform: `scale(${0.4 + s * 0.6}) translateY(${(1 - s) * 60}px)`,
              opacity: Math.min(1, s * 1.5),
            }}
          >
            {p}
          </span>
        );
      })}
    </div>
  );
}

/** Ilustração 3D que pula na tela e fica flutuando. */
function Sticker({
  nome,
  style,
  delay = 4,
  tamanho = 360,
  giro = -8,
}: {
  nome: string;
  style: CSSProperties;
  delay?: number;
  tamanho?: number;
  giro?: number;
}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - delay, fps, config: { damping: 9, stiffness: 160, mass: 0.6 } });
  const flutua = Math.sin((frame - delay) / 9) * 10;
  return (
    <>
      <Sequence from={delay} layout="none">
        <Audio src={SFX("pop")} volume={0.2} />
      </Sequence>
      <Img
        src={img3d(nome)}
        style={{
          position: "absolute",
          width: tamanho,
          transform: `scale(${s}) translateY(${flutua}px) rotate(${giro + Math.sin(frame / 14) * 4}deg)`,
          filter: "drop-shadow(0 30px 40px rgba(6,40,20,0.35))",
          ...style,
        }}
      />
    </>
  );
}

/** Rótulo grande no topo das cenas do app ("1. Foto"). */
function Rotulo({ n, texto }: { n: number; texto: string }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - 2, fps, config: { damping: 12, stiffness: 200 } });
  return (
    <div
      style={{
        position: "absolute",
        top: 120,
        left: 0,
        right: 0,
        display: "flex",
        justifyContent: "center",
        transform: `scale(${s})`,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 22,
          background: TINTA,
          color: "#fff",
          borderRadius: 999,
          padding: "18px 40px 18px 18px",
        }}
      >
        <span
          style={{
            width: 72,
            height: 72,
            borderRadius: "50%",
            background: VIVO,
            display: "grid",
            placeItems: "center",
            fontSize: 40,
            fontWeight: 800,
          }}
        >
          {n}
        </span>
        <span style={{ fontSize: 64, fontWeight: 800, letterSpacing: "-0.03em" }}>{texto}</span>
      </div>
    </div>
  );
}

/** Celular do app em uso, entrando de baixo e aproximando. */
function Celular({ children }: { children: (t: Tela) => ReactNode }) {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const s = spring({ frame, fps, config: { damping: 16, stiffness: 150 } });
  const zoom = interpolate(frame, [0, durationInFrames], [1, 1.1]);
  return (
    <div
      style={{
        position: "absolute",
        left: "50%",
        top: 300,
        marginLeft: -310,
        transform: `translateY(${(1 - s) * 500}px) scale(${zoom})`,
        transformOrigin: "50% 30%",
        filter: "drop-shadow(0 50px 60px rgba(6,40,20,0.3))",
      }}
    >
      <BigPhone width={620}>
        <div className="flex min-h-0 flex-1 flex-col">{children({ f: frame, d: durationInFrames })}</div>
      </BigPhone>
    </div>
  );
}

/* ---------------------------------------------------------------- cenas */

const CONTEUDO: Record<string, (c: Cena) => ReactNode> = {
  gancho: () => (
    <>
      <Slam texto="Seu produto é bom." />
      <Sticker nome="sacola" style={{ right: 60, bottom: 260 }} giro={8} />
    </>
  ),
  gancho2: () => (
    <>
      <Slam texto="Mas falta gente ver." tamanho={140} />
      <Sticker nome="megafone" style={{ left: 40, bottom: 230 }} tamanho={420} />
    </>
  ),
  dor: () => <Dor />,
  solucao: () => <Solucao />,
  foto: () => (
    <>
      <Rotulo n={1} texto="Foto do produto" />
      <Celular>{(t) => <Produto t={t} />}</Celular>
    </>
  ),
  preco: () => (
    <>
      <Rotulo n={2} texto="Preço" />
      <Celular>{(t) => <Oferta t={t} />}</Celular>
    </>
  ),
  versoes: () => <Versoes />,
  regiao: () => <RegiaoValor />,
  publica: () => (
    <>
      <Rotulo n={5} texto="Publicar" />
      <Celular>{(t) => <Publicacao t={t} />}</Celular>
    </>
  ),
  whatsapp: () => <WhatsApp />,
  oferta: () => <OfertaFinal />,
  cta: () => <Cta />,
};

function Dor() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const itens = ["Postou e ninguém viu?", "Impulsionou e nada?"];
  return (
    <AbsoluteFill style={{ alignItems: "center", paddingTop: 480, gap: 50 }}>
      {itens.map((t, i) => {
        const s = spring({ frame: frame - i * 20, fps, config: { damping: 12, stiffness: 200 } });
        const risco = interpolate(frame, [10 + i * 20, 20 + i * 20], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });
        return (
          <div
            key={t}
            style={{
              position: "relative",
              transform: `scale(${s}) rotate(${i ? 3 : -3}deg)`,
              background: "#fff",
              borderRadius: 36,
              padding: "40px 56px",
              boxShadow: "0 30px 60px rgba(6,40,20,0.2)",
            }}
          >
            <p style={{ margin: 0, fontSize: 72, fontWeight: 800, color: TINTA, letterSpacing: "-0.03em" }}>{t}</p>
            <span
              style={{
                position: "absolute",
                right: -30,
                top: -30,
                width: 90,
                height: 90,
                borderRadius: "50%",
                background: "#ef4444",
                color: "#fff",
                display: "grid",
                placeItems: "center",
                fontSize: 56,
                fontWeight: 800,
                transform: `scale(${risco})`,
              }}
            >
              ✕
            </span>
          </div>
        );
      })}
    </AbsoluteFill>
  );
}

function Solucao() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - 2, fps, config: { damping: 10, stiffness: 180 } });
  return (
    <>
      <AbsoluteFill style={{ alignItems: "center", paddingTop: 520 }}>
        <div style={{ transform: `scale(${s})`, display: "flex", alignItems: "center", gap: 26, color: "#fff" }}>
          <BrandMark className="h-36 w-auto" />
          <span
            style={{
              background: "#fff",
              color: VERDE,
              borderRadius: 20,
              padding: "10px 24px",
              fontSize: 64,
              fontWeight: 800,
            }}
          >
            Ads
          </span>
        </div>
      </AbsoluteFill>
      <Sticker nome="celular" style={{ left: "50%", marginLeft: -200, top: 900 }} tamanho={400} giro={6} delay={8} />
    </>
  );
}

function Versoes() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <>
      <Rotulo n={3} texto="5 anúncios prontos" />
      <AbsoluteFill>
        {ROUND.map(({ ad }, i) => {
          const s = spring({ frame: frame - i * 4, fps, config: { damping: 13, stiffness: 170 } });
          const k = i - 2;
          return (
            <div
              key={ad.template}
              style={{
                position: "absolute",
                left: "50%",
                top: 520 + Math.abs(k) * 60,
                marginLeft: -180 + k * 150 * s,
                transform: `rotate(${k * 9 * s}deg) translateY(${(1 - s) * 900}px)`,
                zIndex: 10 - Math.abs(k),
                borderRadius: 28,
                boxShadow: "0 40px 60px rgba(6,40,20,0.35)",
              }}
            >
              <Ad width={360} content={ad} />
            </div>
          );
        })}
      </AbsoluteFill>
    </>
  );
}

function RegiaoValor() {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const metade = Math.round(durationInFrames * 0.45);
  return (
    <>
      <Rotulo n={4} texto="Região e valor" />
      {frame < metade ? (
        <Celular>{(t) => <Regiao t={{ f: t.f, d: metade }} />}</Celular>
      ) : (
        <Sequence from={metade} layout="none">
          <Celular>{(t) => <Investimento t={{ f: t.f, d: durationInFrames - metade }} />}</Celular>
        </Sequence>
      )}
    </>
  );
}

function WhatsApp() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const msgs = ["Oi! Vi o anúncio 😋", "Ainda tem o café da manhã completo?", "Quero dois pra amanhã cedo!"];
  const conversas = Math.round(
    interpolate(frame, [10, 50], [0, 27], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
  );
  return (
    <>
      <AbsoluteFill style={{ paddingTop: 240, paddingLeft: 70, paddingRight: 70, gap: 26 }}>
        {msgs.map((m, i) => {
          const d = 4 + i * 12;
          const s = spring({ frame: frame - d, fps, config: { damping: 12, stiffness: 210 } });
          return (
            <div key={m}>
              <Sequence from={d} layout="none">
                <Audio src={SFX("notificacao")} volume={0.22} />
              </Sequence>
              <div
                style={{
                  transform: `scale(${s}) translateX(${(1 - s) * -200}px)`,
                  transformOrigin: "left center",
                  display: "flex",
                  alignItems: "center",
                  gap: 20,
                  background: "#fff",
                  borderRadius: 32,
                  padding: "26px 30px",
                  boxShadow: "0 24px 50px rgba(6,40,20,0.18)",
                }}
              >
                <span style={{ width: 76, height: 76, borderRadius: "50%", background: "#25d366", flexShrink: 0 }} />
                <div>
                  <p style={{ margin: 0, fontSize: 30, fontWeight: 700, color: "#128c4a" }}>Nova mensagem · WhatsApp</p>
                  <p style={{ margin: "4px 0 0", fontSize: 42, fontWeight: 600, color: TINTA }}>{m}</p>
                </div>
              </div>
            </div>
          );
        })}
      </AbsoluteFill>
      <div style={{ position: "absolute", left: 0, right: 0, top: 1060, textAlign: "center" }}>
        <p style={{ margin: 0, fontSize: 150, fontWeight: 800, color: VERDE, letterSpacing: "-0.05em", lineHeight: 1 }}>
          {conversas}
        </p>
        <p style={{ margin: 0, fontSize: 48, fontWeight: 700, color: TINTA }}>conversas no WhatsApp</p>
      </div>
      <Sticker nome="conversa" style={{ right: 50, top: 1240 }} tamanho={300} delay={30} />
    </>
  );
}

function OfertaFinal() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - 3, fps, config: { damping: 9, stiffness: 200 } });
  return (
    <>
      <AbsoluteFill style={{ alignItems: "center", paddingTop: 520 }}>
        <div
          style={{
            transform: `scale(${s}) rotate(-4deg)`,
            background: AMARELO,
            color: TINTA,
            padding: "30px 60px 30px 110px",
            clipPath: "polygon(60px 0, 100% 0, 100% 100%, 60px 100%, 0 50%)",
            fontSize: 150,
            fontWeight: 800,
            letterSpacing: "-0.05em",
            lineHeight: 1,
          }}
        >
          R$ 199
        </div>
        <Slam texto="por mês, sem fidelidade" tamanho={72} top={760} delay={10} />
      </AbsoluteFill>
      <Sticker nome="etiqueta" style={{ left: 60, top: 1050 }} tamanho={340} delay={14} />
    </>
  );
}

function Cta() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - 4, fps, config: { damping: 10, stiffness: 180 } });
  return (
    <>
      <AbsoluteFill style={{ alignItems: "center", paddingTop: 300 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 20, color: "#fff" }}>
          <BrandMark className="h-24 w-auto" />
          <span
            style={{
              background: "#fff",
              color: VERDE,
              borderRadius: 14,
              padding: "6px 18px",
              fontSize: 46,
              fontWeight: 800,
            }}
          >
            Ads
          </span>
        </div>
        <div
          style={{
            marginTop: 60,
            transform: `scale(${s})`,
            background: "#fff",
            color: VERDE,
            borderRadius: 999,
            padding: "28px 70px",
            fontSize: 88,
            fontWeight: 800,
            letterSpacing: "-0.03em",
            boxShadow: "0 30px 60px rgba(0,0,0,0.25)",
          }}
        >
          Link na bio
        </div>
      </AbsoluteFill>
      <Sticker nome="dona" style={{ left: "50%", marginLeft: -260, top: 820 }} tamanho={520} giro={0} delay={10} />
    </>
  );
}
