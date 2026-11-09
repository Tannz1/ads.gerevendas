import "./style.css";
import { Composition } from "remotion";
import { Apresentacao } from "./Apresentacao";
import apresentacao from "./timeline-apresentacao.json";
import uso from "./timeline-uso.json";
import { Uso } from "./uso/Uso";

const FPS = 30;

export function Root() {
  return (
    <>
      {/* Reels vertical: o app em uso, como gravação de tela. */}
      <Composition
        id="ReelsUso"
        component={Uso}
        width={1080}
        height={1920}
        fps={FPS}
        durationInFrames={Math.ceil(uso.duracao * FPS)}
      />
      {/* Mesma apresentação na vertical, para quem assiste no celular. */}
      <Composition
        id="ApresentacaoVertical"
        component={Apresentacao}
        width={1080}
        height={1920}
        fps={FPS}
        durationInFrames={Math.ceil(apresentacao.duracao * FPS)}
      />
      {/* Vídeo de apresentação da LP (horizontal), explicando passo a passo. */}
      <Composition
        id="Apresentacao"
        component={Apresentacao}
        width={1920}
        height={1080}
        fps={FPS}
        durationInFrames={Math.ceil(apresentacao.duracao * FPS)}
      />
    </>
  );
}
