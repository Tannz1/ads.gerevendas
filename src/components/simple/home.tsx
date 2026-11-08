import Link from "next/link";
import type { ProductSummary } from "@/server/products-data";
import { ProductCard } from "./product-card";
import { bigButton } from "./shell";

/** Tela 1 (Início): um botão para criar e o anúncio que está rodando. */
export function SimpleHome({ products, failed }: { products: ProductSummary[]; failed: boolean }) {
  const withCampaign = products.filter((p) => p.campaign);
  const featured = withCampaign.find((p) => p.campaign?.status === "active") ?? withCampaign[0] ?? null;
  const drafts = products.filter((p) => !p.campaign).slice(0, 2);

  return (
    <div>
      <div className="flex items-start justify-between gap-4 pt-4">
        <h1 className="font-display text-[34px] leading-[1.1] font-bold tracking-tight">Vamos vender mais?</h1>
        <StoreIcon />
      </div>

      <Link href="/app/anuncios/novo" className={`${bigButton} mt-8`}>
        <svg aria-hidden viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M12 5v14M5 12h14" strokeLinecap="round" />
        </svg>
        Criar meu anúncio
      </Link>

      {failed && (
        <p role="alert" className="mt-6 rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">
          Não foi possível carregar seus anúncios. Recarregue a página.
        </p>
      )}

      {featured && (
        <section aria-labelledby="ativo" className="mt-10">
          <h2 id="ativo" className="font-display text-lg font-bold">
            {featured.campaign?.status === "active" ? "Meu anúncio ativo" : "Meu último anúncio"}
          </h2>
          <div className="mt-3">
            <ProductCard product={featured} />
          </div>
        </section>
      )}

      {drafts.length > 0 && (
        <section aria-labelledby="continuar" className="mt-8">
          <h2 id="continuar" className="font-display text-lg font-bold">
            Continuar de onde parou
          </h2>
          <ul className="mt-3 space-y-3">
            {drafts.map((p) => (
              <li key={p.brief_id}>
                <ProductCard product={p} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {!failed && products.length === 0 && (
        <p className="mt-10 rounded-2xl bg-surface-muted px-5 py-4 text-[15px] text-ink-soft">
          Tire uma foto do produto que você quer vender. Em poucos passos ela vira um anúncio que leva clientes para o
          seu WhatsApp.
        </p>
      )}

      <p className="mt-12 text-center text-sm text-ink-faint">
        Prefere o modo completo?{" "}
        <Link href="/app/criativos" className="font-semibold text-ink-soft underline">
          Criativos
        </Link>{" "}
        e{" "}
        <Link href="/app/campanhas" className="font-semibold text-ink-soft underline">
          Campanhas
        </Link>
      </p>
    </div>
  );
}

function StoreIcon() {
  return (
    <svg aria-hidden viewBox="0 0 64 56" className="h-16 w-20 shrink-0">
      <path d="M8 6l4-4M4 14H0M14 4l1-4" stroke="var(--brand)" strokeWidth="3" strokeLinecap="round" />
      <rect x="14" y="26" width="44" height="28" rx="3" fill="#fff" stroke="var(--brand)" strokeWidth="3" />
      <rect x="20" y="32" width="14" height="14" rx="2" fill="#cfeaff" />
      <rect x="38" y="32" width="14" height="22" rx="2" fill="#cfeaff" />
      <path
        d="M12 14h48l2 10a6 6 0 01-12 1 6 6 0 01-12 0 6 6 0 01-12 0 6 6 0 01-12-1z"
        fill="var(--brand)"
        stroke="var(--brand-strong)"
        strokeWidth="2"
      />
      <path d="M24 14l-2 11M36 14v11M48 14l2 11" stroke="#fff" strokeWidth="2" />
    </svg>
  );
}
