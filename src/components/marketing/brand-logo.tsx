import Link from "next/link";
import { BrandMark } from "./brand-mark";

/**
 * Logo oficial Gere Vendas (mesmos traços do site do CRM, `marketing/site/assets/logo.svg`)
 * com o selo "Ads". O símbolo fica verde (identidade do app); o nome usa a cor do texto.
 */
export function BrandLogo({ tone = "dark" }: { tone?: "dark" | "light" }) {
  const ink = tone === "light" ? "text-white" : "text-gv-ink";
  return (
    <Link href="/" aria-label="GereVendas Ads, início" className={`flex items-center gap-2.5 ${ink}`}>
      <BrandMark className="h-7 w-auto sm:h-8" />
      <span className="rounded-md bg-gv-green px-1.5 py-0.5 text-xs leading-none font-bold text-white">Ads</span>
    </Link>
  );
}
