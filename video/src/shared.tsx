import { useEffect, useState, type ReactNode } from "react";
import { continueRender, delayRender, staticFile } from "remotion";
import { BROWSER_FONTS } from "@/components/creatives/ad-preview";
import { AdTemplate } from "@/components/creatives/ad-template";
import { FORMATS, type CreativeContent } from "@/contracts/creatives";
import { BAKERY, BAKERY_ROUND } from "@/components/marketing/demo-ads";
import { Phone } from "@/components/marketing/storyboard";

export const PHOTOS = ["cafe-da-manha", "foto-do-produto", "salao", "petshop", "oficina"].map((n) =>
  staticFile(`lp/${n}.jpg`),
);

/** Segura a renderização até as fotos e as fontes carregarem: nenhum quadro sai sem imagem. */
export function usePreload() {
  const [handle] = useState(() => delayRender("Carregando fotos e fontes"));
  useEffect(() => {
    Promise.all([
      ...PHOTOS.map(
        (src) =>
          new Promise<void>((resolve) => {
            const img = new Image();
            img.onload = img.onerror = () => resolve();
            img.src = src;
          }),
      ),
      document.fonts.ready,
    ]).then(() => continueRender(handle));
  }, [handle]);
}

/** Peça real do editor (AdTemplate, 1080 px) na largura pedida. */
export function Ad({
  width,
  content,
  format = "feed",
  photo = BAKERY.photo ?? null,
}: {
  width: number;
  content: CreativeContent;
  format?: "feed" | "stories";
  photo?: string | null;
}) {
  const f = FORMATS[format];
  const scale = width / f.width;
  return (
    <div style={{ width, height: f.height * scale, overflow: "hidden", borderRadius: 28 * (width / 400) }}>
      <div style={{ width: f.width, transform: `scale(${scale})`, transformOrigin: "top left" }}>
        <AdTemplate
          content={content}
          format={format}
          businessName={BAKERY.businessName}
          priceLabel={BAKERY.priceLabel}
          imageSrc={photo}
          fonts={BROWSER_FONTS}
        />
      </div>
    </div>
  );
}

export const ROUND = BAKERY_ROUND;

/** Celular da LP (260 px de largura) ampliado para o vídeo. */
export function BigPhone({ children, width = 560 }: { children: ReactNode; width?: number }) {
  const scale = width / 260;
  return (
    <div style={{ width, height: 260 * (18.5 / 9) * scale + 14 * scale }}>
      <div style={{ width: 260, transform: `scale(${scale})`, transformOrigin: "top left" }}>
        <Phone>{children}</Phone>
      </div>
    </div>
  );
}
