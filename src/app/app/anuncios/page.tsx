import type { Metadata } from "next";
import Link from "next/link";
import { ProductCard } from "@/components/simple/product-card";
import { SimpleShell } from "@/components/simple/shell";
import { getAppContext } from "@/server/context";
import { loadProducts, type ProductSummary } from "@/server/products-data";

export const metadata: Metadata = { title: "Anúncios" };

const createButton =
  "inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-brand px-5 text-[15px] font-bold text-white transition-colors hover:bg-brand-strong";

export default async function ProductsPage() {
  const ctx = await getAppContext();
  let products: ProductSummary[] = [];
  let failed = false;
  if (ctx.mode === "supabase" && ctx.organization) {
    try {
      products = await loadProducts(ctx.organization.id);
    } catch {
      failed = true;
    }
  }

  const running = products.filter((p) => p.campaign?.status === "active").length;

  return (
    <SimpleShell layout="page">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[32px] leading-tight font-bold tracking-tight">Seus anúncios</h1>
          {products.length > 0 && (
            <p className="mt-1 text-[15px] text-ink-soft">
              {products.length} {products.length === 1 ? "anúncio" : "anúncios"}
              {running > 0 && ` · ${running} no ar`}
            </p>
          )}
        </div>
        {ctx.mode === "supabase" && (
          <Link href="/app/anuncios/novo" className={`${createButton} w-full sm:w-auto`}>
            <svg aria-hidden viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M12 5v14M5 12h14" strokeLinecap="round" />
            </svg>
            Criar meu anúncio
          </Link>
        )}
      </div>

      {ctx.mode !== "supabase" && (
        <p className="mt-8 rounded-2xl bg-surface-muted px-5 py-4 text-[15px] text-ink-soft">
          Disponível no piloto com conta.
        </p>
      )}

      {failed && (
        <div role="alert" className="mt-8 rounded-2xl border border-danger/20 bg-danger-soft px-5 py-4 text-danger">
          <p className="font-semibold">Não foi possível carregar seus anúncios.</p>
          <p className="mt-1 text-sm">Recarregue a página. Se continuar, fale com o suporte.</p>
        </div>
      )}

      {ctx.mode === "supabase" && !failed && products.length === 0 && (
        <div className="mt-8 rounded-3xl border border-dashed border-line-strong bg-surface px-6 py-12 text-center">
          <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-brand-soft text-brand">
            <svg aria-hidden viewBox="0 0 24 24" className="size-7" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M20.6 13.4l-7.2 7.2a2 2 0 01-2.8 0L3 13V3h10l7.6 7.6a2 2 0 010 2.8zM7.5 7.5h.01" />
            </svg>
          </span>
          <p className="mt-4 font-display text-xl font-bold">Nenhum anúncio ainda</p>
          <p className="mx-auto mt-1 max-w-sm text-[15px] text-ink-soft">
            Comece com a foto de um produto que você quer vender mais.
          </p>
        </div>
      )}

      {products.length > 0 && (
        <ul className="mt-8 grid gap-4 md:grid-cols-2">
          {products.map((p) => (
            <li key={p.brief_id}>
              <ProductCard product={p} />
            </li>
          ))}
        </ul>
      )}
    </SimpleShell>
  );
}
