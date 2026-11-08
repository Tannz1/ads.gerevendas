import type { Metadata } from "next";
import Link from "next/link";
import { ProductCard } from "@/components/simple/product-card";
import { bigButton, ScreenHeader, SimpleShell } from "@/components/simple/shell";
import { getAppContext } from "@/server/context";
import { loadProducts, type ProductSummary } from "@/server/products-data";

export const metadata: Metadata = { title: "Anúncios" };

export default async function ProductsPage() {
  const ctx = await getAppContext();
  if (ctx.mode !== "supabase" || !ctx.organization) {
    return (
      <SimpleShell>
        <ScreenHeader title="Seus anúncios" />
        <p className="text-ink-soft">Disponível no piloto com conta.</p>
      </SimpleShell>
    );
  }

  let products: ProductSummary[] = [];
  let failed = false;
  try {
    products = await loadProducts(ctx.organization.id);
  } catch {
    failed = true;
  }

  return (
    <SimpleShell>
      <ScreenHeader title="Seus anúncios" />
      <Link href="/app/anuncios/novo" className={bigButton}>
        Criar meu anúncio
      </Link>
      {failed && (
        <p role="alert" className="mt-6 rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">
          Não foi possível carregar seus anúncios. Recarregue a página.
        </p>
      )}
      {!failed && products.length === 0 ? (
        <p className="mt-8 rounded-2xl bg-surface-muted px-5 py-4 text-[15px] text-ink-soft">
          Você ainda não criou nenhum anúncio por aqui.
        </p>
      ) : (
        <ul className="mt-8 space-y-3">
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
