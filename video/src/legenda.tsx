import { Easing, interpolate } from "remotion";
import type { Cena } from "./kit";

/**
 * Legenda dinâmica (visual novo): a frase inteira aparece e cada palavra acende quando é falada.
 * A palavra atual fica verde; as que ainda vão ser ditas ficam apagadas. A narração é gerada por
 * frase, então o tempo de cada palavra é estimado pelo tamanho dela dentro da frase.
 */
type Palavra = { texto: string; ini: number; fim: number };

function palavrasDa(frase: { texto: string; ini: number; fim: number }): Palavra[] {
  const ws = frase.texto.split(/\s+/).filter(Boolean);
  const pesos = ws.map((w) => w.replace(/[^\p{L}\p{N}]/gu, "").length + 2);
  const total = pesos.reduce((a, b) => a + b, 0);
  const dur = frase.fim - frase.ini;
  let t = frase.ini;
  return ws.map((texto, i) => {
    const ini = t;
    t += (pesos[i] / total) * dur;
    return { texto, ini, fim: t };
  });
}

/** Frases da cena (a narração por frase já vem com uma entrada por frase). */
function frasesDa(cena: Cena) {
  const out: { texto: string; ini: number; fim: number }[] = [];
  let atual: Cena["palavras"] = [];
  for (const w of cena.palavras) {
    atual.push(w);
    if (/[.!?:]$/.test(w.texto)) {
      out.push({ texto: atual.map((x) => x.texto).join(" "), ini: atual[0].ini, fim: w.fim });
      atual = [];
    }
  }
  if (atual.length) out.push({ texto: atual.map((x) => x.texto).join(" "), ini: atual[0].ini, fim: atual.at(-1)!.fim });
  return out;
}

export function LegendaDinamica({
  cena,
  t,
  left,
  right,
  bottom,
  align,
  fontSize,
  padding,
  radius,
}: {
  cena: Cena;
  /** Segundo atual da narração. */
  t: number;
  left: number;
  right: number;
  bottom: number;
  align: "left" | "center";
  fontSize: number;
  padding: string;
  radius: number;
}) {
  const frases = frasesDa(cena);
  const frase = frases.find((f) => t < f.fim + 0.25) ?? frases.at(-1);
  if (!frase) return null;
  const entra = interpolate(t, [frase.ini - 0.18, frase.ini + 0.05], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  return (
    <div
      style={{
        position: "absolute",
        left,
        right,
        bottom,
        display: "flex",
        justifyContent: align === "left" ? "flex-start" : "center",
        opacity: entra,
        transform: `translateY(${(1 - entra) * 14}px)`,
      }}
    >
      <p
        style={{
          margin: 0,
          maxWidth: 1400,
          background: "rgba(19,32,26,0.9)",
          borderRadius: radius,
          padding,
          fontFamily: "Inter",
          fontSize,
          fontWeight: 600,
          lineHeight: 1.35,
          textAlign: align,
          boxShadow: "0 18px 40px -20px rgba(0,0,0,0.6)",
        }}
      >
        {palavrasDa(frase).map((w, i) => {
          const falando = t >= w.ini && t < w.fim + 0.05;
          const dita = t >= w.ini;
          const pop = interpolate(t, [w.ini, w.ini + 0.08, w.ini + 0.22], [1, 1.08, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });
          return (
            <span
              key={i}
              style={{
                display: "inline-block",
                marginRight: "0.28em",
                color: falando ? "#86efac" : dita ? "#ffffff" : "rgba(255,255,255,0.42)",
                transform: `scale(${falando ? pop : 1})`,
                transformOrigin: "50% 70%",
              }}
            >
              {w.texto}
            </span>
          );
        })}
      </p>
    </div>
  );
}
