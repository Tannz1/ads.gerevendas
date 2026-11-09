import { createContext, useContext, type ReactNode } from "react";
import { Audio, interpolate, Sequence, staticFile, useVideoConfig } from "remotion";
import { z } from "zod";

/**
 * Volumes editáveis no painel de propriedades do Remotion Studio, em % da mixagem padrão
 * (100 = como está). A voz já sai normalizada; música e efeitos ficam bem abaixo dela.
 */
export const volumesSchema = z.object({
  volumeVoz: z.number().min(0).max(100).step(5),
  volumeMusica: z.number().min(0).max(300).step(10),
  volumeEfeitos: z.number().min(0).max(300).step(10),
});
export type Volumes = z.infer<typeof volumesSchema>;
export const VOLUMES_PADRAO: Volumes = { volumeVoz: 100, volumeMusica: 100, volumeEfeitos: 100 };

const Ctx = createContext<Volumes>(VOLUMES_PADRAO);
export function VolumesProvider({ volumes, children }: { volumes: Partial<Volumes>; children: ReactNode }) {
  return <Ctx.Provider value={{ ...VOLUMES_PADRAO, ...volumes }}>{children}</Ctx.Provider>;
}
/** Multiplicadores (1 = mixagem padrão). */
export function useVolumes() {
  const v = useContext(Ctx);
  return { voz: v.volumeVoz / 100, musica: v.volumeMusica / 100, efeitos: v.volumeEfeitos / 100 };
}

/** Efeito sonoro com o volume do painel aplicado. */
export function Efeito({ nome, volume }: { nome: string; volume: number }) {
  const { efeitos } = useVolumes();
  return <Audio src={staticFile(`sfx-${nome}.mp3`)} volume={volume * efeitos} />;
}

/** Narração com o volume do painel aplicado. */
export function Voz({ arquivo }: { arquivo: string }) {
  const { voz } = useVolumes();
  return <Audio src={staticFile(arquivo)} volume={voz} />;
}

/**
 * Trilha dos vídeos explicativos: música baixa em loop (a voz manda) e um whoosh discreto em cada corte.
 * `cortes` são os segundos em que uma cena nova começa.
 */
export function TrilhaFundo({ cortes, volume = 0.14 }: { cortes: number[]; volume?: number }) {
  const { fps, durationInFrames } = useVideoConfig();
  const { musica } = useVolumes();
  return (
    <>
      <Audio
        src={staticFile("musica-reels.mp3")}
        loop
        volume={(f) =>
          volume *
          musica *
          interpolate(f, [0, 12, durationInFrames - 36, durationInFrames], [0, 1, 1, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          })
        }
      />
      {cortes.map((s) => (
        <Sequence key={s} from={Math.max(0, Math.round(s * fps) - 4)} durationInFrames={Math.round(fps * 1.2)}>
          <Efeito nome="whoosh" volume={0.12} />
        </Sequence>
      ))}
    </>
  );
}

/** "Soco" de zoom no começo de cada cena: entra 5% maior e assenta em 8 quadros. */
export function soco(framesDesdeOCorte: number) {
  return interpolate(framesDesdeOCorte, [0, 8], [1.05, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
}
