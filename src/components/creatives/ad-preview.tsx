import { FORMATS } from "@/contracts/creatives";
import { AdTemplate, type AdTemplateProps } from "./ad-template";

const BROWSER_FONTS = { display: "var(--font-display), sans-serif", body: "var(--font-body), sans-serif" };

/** Prévia da peça no navegador: o template em tamanho real, reduzido por CSS. */
export function AdPreview({
  width,
  label,
  ...props
}: Omit<AdTemplateProps, "fonts"> & { width: number; label: string }) {
  const f = FORMATS[props.format];
  const scale = width / f.width;
  return (
    <div
      role="img"
      aria-label={label}
      className="overflow-hidden rounded-xl shadow-[var(--shadow-card)]"
      style={{ width, height: f.height * scale }}
    >
      <div aria-hidden style={{ transform: `scale(${scale})`, transformOrigin: "top left", width: f.width }}>
        <AdTemplate {...props} fonts={BROWSER_FONTS} />
      </div>
    </div>
  );
}

/** Endereço do PNG para baixar (prefixa o subcaminho, ex.: /ads). */
export function imageUrl(id: string, format: keyof typeof FORMATS) {
  return `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/app/criativos/${id}/imagem?formato=${format}`;
}
