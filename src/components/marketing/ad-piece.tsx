import type { CSSProperties } from "react";
import type { AngleKey } from "@/contracts/creatives";

/**
 * Peça de anúncio ILUSTRATIVA da landing, desenhada só com cor e tipografia.
 * Os cinco layouts imitam as composições reais do editor (LAYOUT_LABELS em contracts/creatives).
 * Tamanhos em `cqw` para a mesma peça servir no hero (grande) e na vitrine (miniatura).
 */
export type DemoAd = {
  layout: AngleKey;
  headline: string;
  detail: string;
  price?: string;
  cta: string;
  bg: string;
  ink: string;
  shape: string;
};

export function AdPiece({
  ad,
  format = "feed",
  animate = false,
  className = "",
}: {
  ad: DemoAd;
  format?: "feed" | "story";
  animate?: boolean;
  className?: string;
}) {
  const inn = (delay: number): { className: string; style?: CSSProperties } =>
    animate ? { className: "lp-in", style: { animationDelay: `${delay}ms` } } : { className: "" };
  const story = format === "story";
  const dark = ad.layout === "problema";

  return (
    <div
      aria-hidden
      className={`@container relative overflow-hidden ${story ? "aspect-[9/16]" : "aspect-[4/5]"} ${className}`}
      style={{ background: dark ? ad.ink : ad.bg, color: dark ? ad.bg : ad.ink }}
    >
      {ad.layout === "oferta" && (
        <>
          <div
            className="absolute -right-[18cqw] -bottom-[22cqw] size-[78cqw] rounded-full"
            style={{ background: ad.shape }}
          />
          <div
            className="absolute right-[10cqw] bottom-[60cqw] size-[16cqw] rounded-full opacity-60"
            style={{ background: ad.shape }}
          />
          <div className="absolute inset-x-0 top-0 p-[7cqw]">
            <p {...inn(0)} className={`sign-wide text-[10.5cqw] leading-[0.98] font-extrabold ${inn(0).className}`}>
              {ad.headline}
            </p>
            <p {...inn(120)} className={`mt-[4cqw] text-[4.4cqw] font-medium opacity-80 ${inn(120).className}`}>
              {ad.detail}
            </p>
          </div>
          {ad.price && <Price ad={ad} animate={animate} className="bottom-[8cqw] left-[7cqw]" />}
        </>
      )}

      {ad.layout === "problema" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center p-[9cqw] text-center">
          <div className="mb-[6cqw] h-[1.4cqw] w-[14cqw] rounded-full" style={{ background: ad.shape }} />
          <p {...inn(0)} className={`sign-wide text-[10cqw] leading-[1] font-extrabold ${inn(0).className}`}>
            {ad.headline}
          </p>
          <p {...inn(120)} className={`mt-[5cqw] text-[4.4cqw] font-medium opacity-80 ${inn(120).className}`}>
            {ad.detail}
          </p>
        </div>
      )}

      {ad.layout === "beneficio" && (
        <>
          <div
            className="absolute -top-[20cqw] -left-[14cqw] size-[70cqw] rounded-full opacity-70"
            style={{ background: ad.shape }}
          />
          <div
            className="absolute top-[14cqw] right-[10cqw] size-[22cqw] rounded-full"
            style={{ background: ad.shape }}
          />
          <div className="absolute inset-x-0 bottom-0 p-[7cqw]">
            <div className="border-l-[2.2cqw] pl-[4cqw]" style={{ borderColor: ad.ink }}>
              <p {...inn(0)} className={`sign-wide text-[9.5cqw] leading-[1] font-extrabold ${inn(0).className}`}>
                {ad.headline}
              </p>
              <p {...inn(120)} className={`mt-[3cqw] text-[4.4cqw] font-medium opacity-80 ${inn(120).className}`}>
                {ad.detail}
              </p>
            </div>
          </div>
        </>
      )}

      {ad.layout === "demonstracao" && (
        <>
          <div className="absolute inset-x-0 top-0 h-[58%]" style={{ background: ad.shape }}>
            <div
              className="absolute top-[12cqw] left-[12cqw] size-[30cqw] rounded-full"
              style={{ background: ad.bg }}
            />
            <div
              className="absolute top-[22cqw] left-[46cqw] size-[24cqw] rounded-full opacity-70"
              style={{ background: ad.bg }}
            />
            <div
              className="absolute top-[8cqw] right-[8cqw] size-[12cqw] rounded-full"
              style={{ background: ad.ink, opacity: 0.25 }}
            />
          </div>
          <div
            className="absolute inset-x-[5cqw] bottom-[5cqw] rounded-[3cqw] bg-white p-[6cqw]"
            style={{ color: ad.ink }}
          >
            <p {...inn(0)} className={`sign-wide text-[8.4cqw] leading-[1] font-extrabold ${inn(0).className}`}>
              {ad.headline}
            </p>
            <p {...inn(120)} className={`mt-[3cqw] text-[4.2cqw] font-medium opacity-75 ${inn(120).className}`}>
              {ad.detail}
            </p>
          </div>
        </>
      )}

      {ad.layout === "conveniencia" && (
        <>
          <div
            className="absolute top-[34%] -right-[20cqw] size-[66cqw] rounded-full opacity-70"
            style={{ background: ad.shape }}
          />
          <div className="absolute inset-x-0 top-0 p-[7cqw]">
            <p {...inn(0)} className={`sign-wide text-[10cqw] leading-[0.98] font-extrabold ${inn(0).className}`}>
              {ad.headline}
            </p>
            <p {...inn(120)} className={`mt-[4cqw] text-[4.4cqw] font-medium opacity-80 ${inn(120).className}`}>
              {ad.detail}
            </p>
          </div>
          <div
            className={`absolute inset-x-[7cqw] bottom-[8cqw] rounded-full py-[4cqw] text-center text-[4.8cqw] font-bold text-white ${inn(240).className}`}
            style={{ background: ad.ink, ...inn(240).style }}
          >
            {ad.cta}
          </div>
        </>
      )}
    </div>
  );
}

function Price({ ad, animate, className }: { ad: DemoAd; animate: boolean; className: string }) {
  return (
    <span
      className={`price-tag absolute -rotate-3 px-[5cqw] py-[2.6cqw] font-sign text-[7.4cqw] leading-none font-extrabold whitespace-nowrap text-white ${animate ? "lp-stamp" : ""} ${className}`}
    >
      {ad.price}
    </span>
  );
}
