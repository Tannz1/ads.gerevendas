import "./style.css";
import { Composition } from "remotion";
import { Apresentacao } from "./Apresentacao";
import apresentacao from "./timeline-apresentacao.json";
import uso from "./timeline-uso.json";
import { ReelsDinamico } from "./dinamico/ReelsDinamico";
import dinamico from "./timeline-dinamico.json";
import { Uso } from "./uso/Uso";

const FPS = 30;
const DUR_APRESENTACAO = Math.ceil(apresentacao.duracao * FPS);
const DUR_USO = Math.ceil(uso.duracao * FPS);

/**
 * Cada vídeo em duas versões com a mesma narração:
 * clássica (toque com círculo, legenda por frase) e nova (cursor do mouse clicando, legenda dinâmica).
 */
export function Root() {
  return (
    <>
      {/* Reels dinâmico: cortes rápidos, música, efeitos e ilustrações 3D. */}
      <Composition
        id="ReelsDinamico"
        component={ReelsDinamico}
        width={1080}
        height={1920}
        fps={FPS}
        durationInFrames={Math.ceil((dinamico.duracao + 1.2) * FPS)}
      />
      {/* Reels vertical: o app em uso, como gravação de tela. */}
      <Composition
        id="ReelsUso"
        component={Uso}
        width={1080}
        height={1920}
        fps={FPS}
        durationInFrames={DUR_USO}
        defaultProps={{ novo: false }}
      />
      <Composition
        id="ReelsUsoNovo"
        component={Uso}
        width={1080}
        height={1920}
        fps={FPS}
        durationInFrames={DUR_USO}
        defaultProps={{ novo: true }}
      />

      {/* Apresentação na vertical, para quem assiste no celular. */}
      <Composition
        id="ApresentacaoVertical"
        component={Apresentacao}
        width={1080}
        height={1920}
        fps={FPS}
        durationInFrames={DUR_APRESENTACAO}
        defaultProps={{ novo: false }}
      />
      <Composition
        id="ApresentacaoVerticalNova"
        component={Apresentacao}
        width={1080}
        height={1920}
        fps={FPS}
        durationInFrames={DUR_APRESENTACAO}
        defaultProps={{ novo: true }}
      />

      {/* Apresentação horizontal, para a LP no computador. */}
      <Composition
        id="Apresentacao"
        component={Apresentacao}
        width={1920}
        height={1080}
        fps={FPS}
        durationInFrames={DUR_APRESENTACAO}
        defaultProps={{ novo: false }}
      />
      <Composition
        id="ApresentacaoNova"
        component={Apresentacao}
        width={1920}
        height={1080}
        fps={FPS}
        durationInFrames={DUR_APRESENTACAO}
        defaultProps={{ novo: true }}
      />
    </>
  );
}
