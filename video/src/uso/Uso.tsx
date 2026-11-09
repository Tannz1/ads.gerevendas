import type { ReactNode } from "react";
import { AbsoluteFill, Audio, Easing, interpolate, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { BrandMark } from "@/components/marketing/brand-mark";
import { Phone } from "@/components/marketing/storyboard";
import { EstiloProvider, useEstilo } from "../estilo";
import type { Cena } from "../kit";
import { LegendaDinamica } from "../legenda";
import { usePreload } from "../shared";
import timeline from "../timeline-uso.json";
import { Inicio, Investimento, Oferta, Previa, Produto, Publicacao, Regiao, Resultados, type Tela } from "./telas";

/**
 * Reels (1080×1920) que mostra o app EM USO, como gravação de tela: um celular do começo ao fim,
 * toques, digitação e números subindo. Visual limpo, legenda por frase. Negócio e números de exemplo.
 */
const CENAS = timeline.cenas as Cena[];
const GREEN = "#1a8a3c";
const ease = Easing.out(Easing.cubic);
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

const PASSOS: Record<string, { titulo: string; tela: (t: Tela) => ReactNode }> = {
  intro: { titulo: "Como funciona o GereVendas Ads", tela: () => <Inicio t={{ f: 0, d: 999 }} /> },
  inicio: { titulo: "Toque em criar meu anúncio", tela: (t) => <Inicio t={t} /> },
  produto: { titulo: "Foto e nome do produto", tela: (t) => <Produto t={t} /> },
  oferta: { titulo: "Preço e o que destacar", tela: (t) => <Oferta t={t} /> },
  previa: { titulo: "Cinco versões com a sua foto", tela: (t) => <Previa t={t} /> },
  regiao: { titulo: "Onde o anúncio aparece", tela: (t) => <Regiao t={t} /> },
  investimento: { titulo: "Quanto investir por dia", tela: (t) => <Investimento t={t} /> },
  publicacao: { titulo: "Confira e publique", tela: (t) => <Publicacao t={t} /> },
  resultados: { titulo: "Acompanhe as conversas", tela: (t) => <Resultados t={t} /> },
};

/** `novo`: cursor do mouse e legenda dinâmica. Sem ele, o visual clássico. */
export function Uso({ novo = false }: { novo?: boolean }) {
  return (
    <EstiloProvider novo={novo}>
      <UsoConteudo />
    </EstiloProvider>
  );
}

function UsoConteudo() {
  usePreload();
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const seg = frame / fps;
  const idx = Math.max(
    0,
    CENAS.findIndex((c, i) => seg < (i === CENAS.length - 1 ? Infinity : c.fim)),
  );
  const cena = CENAS[idx];
  const ini = Math.round(cena.ini * fps);
  const fim = Math.round((idx === CENAS.length - 1 ? timeline.duracao : cena.fim) * fps);
  const t: Tela = { f: frame - ini, d: Math.max(1, fim - ini) };
  const passo = PASSOS[cena.id];
  const fimCena = cena.id === "fim";

  // Troca de tela dentro do celular: desliza da direita, como navegar no app.
  const entra = interpolate(t.f, [0, 9], [0, 1], { ...clamp, easing: ease });
  const celular = interpolate(frame - Math.round((CENAS.at(-1)?.ini ?? 0) * fps), [0, 12], [1, 0], clamp);
  const zoom = 1 + interpolate(t.f, [0, t.d], [0, 0.03], clamp);

  return (
    <AbsoluteFill
      style={{
        fontFamily: "Sora",
        color: "#13201a",
        background:
          "radial-gradient(800px 700px at 85% 10%, rgba(34,197,94,0.14), transparent 70%), radial-gradient(700px 600px at 0% 100%, rgba(26,138,60,0.1), transparent 70%), #f6faf7",
      }}
    >
      <Audio src={staticFile("uso.mp3")} />

      {/* Título curto do passo */}
      {passo && (
        <div
          key={cena.id}
          style={{
            position: "absolute",
            top: 150,
            left: 80,
            right: 80,
            textAlign: "center",
            opacity: entra,
            transform: `translateY(${(1 - entra) * 20}px)`,
          }}
        >
          <p style={{ margin: 0, fontSize: 70, fontWeight: 800, letterSpacing: "-0.04em", lineHeight: 1.05 }}>
            {passo.titulo}
          </p>
        </div>
      )}

      {/* Celular único, sempre inteiro na tela */}
      {!fimCena && (
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: 360,
            width: 600,
            marginLeft: -300,
            opacity: idx === CENAS.length - 1 ? celular : 1,
            transform: `scale(${zoom})`,
            transformOrigin: "50% 40%",
            filter: "drop-shadow(0 50px 60px rgba(19,32,26,0.25))",
          }}
        >
          <div style={{ width: 260, transform: `scale(${600 / 260})`, transformOrigin: "top left" }}>
            <Phone>
              <div
                className="flex min-h-0 flex-1 flex-col"
                style={{ transform: `translateX(${(1 - entra) * 40}%)`, opacity: entra }}
              >
                {passo?.tela(t)}
              </div>
            </Phone>
          </div>
        </div>
      )}

      {fimCena && <EndCard f={t.f} />}
      <Subtitle cena={cena} seg={seg} />
      <p
        style={{
          position: "absolute",
          top: 70,
          left: 0,
          right: 0,
          textAlign: "center",
          margin: 0,
          color: "rgba(19,32,26,0.45)",
          fontFamily: "Inter",
          fontSize: 26,
          fontWeight: 600,
        }}
      >
        Exemplo ilustrativo
      </p>
    </AbsoluteFill>
  );
}

function EndCard({ f }: { f: number }) {
  const p = interpolate(f, [4, 22], [0, 1], { ...clamp, easing: ease });
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", paddingBottom: 200 }}>
      <div
        style={{
          opacity: p,
          transform: `translateY(${(1 - p) * 30}px)`,
          display: "flex",
          alignItems: "center",
          gap: 22,
        }}
      >
        <BrandMark className="h-32 w-auto" />
        <span
          style={{
            background: GREEN,
            color: "#fff",
            borderRadius: 16,
            padding: "8px 20px",
            fontSize: 56,
            fontWeight: 800,
          }}
        >
          Ads
        </span>
      </div>
      <p style={{ margin: "40px 0 0", fontSize: 56, fontWeight: 800, letterSpacing: "-0.03em", opacity: p }}>
        Da foto ao cliente no WhatsApp
      </p>
      <p
        style={{
          margin: "44px 0 0",
          background: GREEN,
          color: "#fff",
          borderRadius: 999,
          padding: "20px 48px",
          fontSize: 54,
          fontWeight: 800,
          opacity: interpolate(f, [14, 30], [0, 1], clamp),
        }}
      >
        Link na bio
      </p>
    </AbsoluteFill>
  );
}

/** Legenda por frase, discreta, na base. */
function Subtitle({ cena, seg }: { cena: Cena; seg: number }) {
  const { novo } = useEstilo();
  if (novo) {
    return (
      <LegendaDinamica
        cena={cena}
        t={seg}
        left={70}
        right={70}
        bottom={120}
        align="center"
        fontSize={42}
        padding="18px 30px"
        radius={22}
      />
    );
  }
  const frases: { texto: string; ini: number; fim: number }[] = [];
  let atual: Cena["palavras"] = [];
  for (const w of cena.palavras) {
    atual.push(w);
    if (/[.!?:]$/.test(w.texto)) {
      frases.push({ texto: atual.map((x) => x.texto).join(" "), ini: atual[0].ini, fim: w.fim });
      atual = [];
    }
  }
  if (atual.length)
    frases.push({ texto: atual.map((x) => x.texto).join(" "), ini: atual[0].ini, fim: atual.at(-1)!.fim });
  const frase = frases.find((f) => seg < f.fim + 0.25) ?? frases.at(-1);
  if (!frase) return null;
  const o = interpolate(seg, [frase.ini - 0.15, frase.ini], [0, 1], clamp);
  return (
    <div
      style={{
        position: "absolute",
        left: 70,
        right: 70,
        bottom: 120,
        display: "flex",
        justifyContent: "center",
        opacity: o,
      }}
    >
      <p
        style={{
          margin: 0,
          background: "rgba(19,32,26,0.88)",
          color: "#fff",
          borderRadius: 22,
          padding: "18px 30px",
          fontFamily: "Inter",
          fontSize: 40,
          fontWeight: 600,
          lineHeight: 1.3,
          textAlign: "center",
        }}
      >
        {frase.texto}
      </p>
    </div>
  );
}
