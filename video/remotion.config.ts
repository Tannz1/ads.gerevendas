import path from "node:path";
import { Config } from "@remotion/cli/config";
import { enableTailwind } from "@remotion/tailwind-v4";
import webpack from "webpack";

Config.setVideoImageFormat("jpeg");
Config.setJpegQuality(92);
// Usa a placa de vídeo para montar os quadros (WebGL/CSS via ANGLE) e 6 quadros em paralelo.
// Vale para o terminal e para o botão Render do Studio (depois de reabrir o Studio).
Config.setChromiumOpenGlRenderer("angle");
Config.setConcurrency(6);
Config.overrideWebpackConfig((current) => {
  const withTailwind = enableTailwind(current);
  return {
    ...withTailwind,
    resolve: {
      ...withTailwind.resolve,
      // Os componentes da LP vêm do app (../src) e usam o alias "@/".
      // React sempre desta pasta, para não carregar uma segunda cópia a partir de ../node_modules.
      alias: {
        ...(withTailwind.resolve?.alias ?? {}),
        "@": path.resolve(process.cwd(), "../src"),
        react: path.resolve(process.cwd(), "node_modules/react"),
        "react-dom": path.resolve(process.cwd(), "node_modules/react-dom"),
      },
    },
    plugins: [
      ...(withTailwind.plugins ?? []),
      // As fotos da LP usam NEXT_PUBLIC_BASE_PATH como prefixo; no Remotion, o prefixo dos arquivos públicos.
      new webpack.DefinePlugin({ "process.env.NEXT_PUBLIC_BASE_PATH": "window.remotion_staticBase" }),
    ],
  };
});
