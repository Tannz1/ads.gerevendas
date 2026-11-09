import Link from "next/link";
import type { ProductSummary } from "@/server/products-data";
import { ProductCard } from "./product-card";

/** Tela 1 (Início): um botão para criar e o anúncio que está rodando. */
export function SimpleHome({
  businessName,
  products,
  failed,
}: {
  businessName: string;
  products: ProductSummary[];
  failed: boolean;
}) {
  const withCampaign = products.filter((p) => p.campaign);
  const featured = withCampaign.find((p) => p.campaign?.status === "active") ?? withCampaign[0] ?? null;
  const others = products.filter((p) => p !== featured).slice(0, 3);

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:items-start">
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand to-brand-strong p-6 text-white shadow-[var(--shadow-lift)] sm:p-8">
        <p className="text-sm font-medium text-white/80">Olá, {businessName}</p>
        <div className="mt-2 flex items-start justify-between gap-4">
          <h1 className="font-display text-[34px] leading-[1.08] font-bold tracking-tight sm:text-[40px]">
            Vamos vender mais?
          </h1>
          <StoreIcon />
        </div>
        <p className="mt-3 max-w-sm text-[15px] text-white/85">
          Mande a foto de um produto. A gente monta o anúncio e leva os clientes direto para o seu WhatsApp.
        </p>
        <Link
          href="/app/anuncios/novo"
          className="mt-6 inline-flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-white px-6 text-[17px] font-bold text-brand-strong shadow-[0_8px_20px_-10px_rgb(0_0_0/0.45)] transition-transform hover:scale-[1.01] sm:w-auto"
        >
          <svg aria-hidden viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M12 5v14M5 12h14" strokeLinecap="round" />
          </svg>
          Criar meu anúncio
        </Link>
        <ol className="mt-8 grid grid-cols-3 gap-2 text-center text-xs font-semibold text-white/90 sm:text-sm">
          {["Foto do produto", "Sua oferta", "Clientes no WhatsApp"].map((s, i) => (
            <li key={s} className="rounded-xl bg-white/12 px-2 py-3 ring-1 ring-white/15">
              <span className="mx-auto mb-1 grid size-6 place-items-center rounded-full bg-white text-xs font-bold text-brand-strong">
                {i + 1}
              </span>
              {s}
            </li>
          ))}
        </ol>
      </section>

      <div className="space-y-8">
        {failed && (
          <p role="alert" className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">
            Não foi possível carregar seus anúncios. Recarregue a página.
          </p>
        )}

        {featured && (
          <section aria-labelledby="ativo">
            <h2 id="ativo" className="font-display text-lg font-bold">
              {featured.campaign?.status === "active" ? "Meu anúncio ativo" : "Meu último anúncio"}
            </h2>
            <div className="mt-3">
              <ProductCard product={featured} />
            </div>
          </section>
        )}

        {others.length > 0 && (
          <section aria-labelledby="outros">
            <div className="flex items-center justify-between">
              <h2 id="outros" className="font-display text-lg font-bold">
                {featured ? "Outros anúncios" : "Continuar de onde parou"}
              </h2>
              <Link href="/app/anuncios" className="text-sm font-semibold text-brand hover:underline">
                Ver todos
              </Link>
            </div>
            <ul className="mt-3 space-y-3">
              {others.map((p) => (
                <li key={p.brief_id}>
                  <ProductCard product={p} />
                </li>
              ))}
            </ul>
          </section>
        )}

        {!failed && products.length === 0 && (
          <section className="rounded-3xl border border-dashed border-line-strong bg-surface p-6 text-center">
            <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-brand-soft text-brand">
              <svg aria-hidden viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="2">
                <path
                  d="M4 8a2 2 0 012-2h1.5l1.5-2h6l1.5 2H18a2 2 0 012 2v10a2 2 0 01-2 2H6a2 2 0 01-2-2V8z"
                  strokeLinejoin="round"
                />
                <circle cx="12" cy="13" r="3.5" />
              </svg>
            </span>
            <p className="mt-3 font-display text-lg font-bold">Seu primeiro anúncio começa com uma foto</p>
            <p className="mx-auto mt-1 max-w-xs text-sm text-ink-soft">
              Pode ser do celular mesmo. Em poucos minutos ele fica pronto para você revisar.
            </p>
          </section>
        )}
      </div>
    </div>
  );
}

function StoreIcon() {
  return (
    <svg aria-hidden viewBox="0 0 64 56" className="h-14 w-16 shrink-0 sm:h-16 sm:w-20">
      <rect x="10" y="24" width="44" height="28" rx="3" fill="#fff" />
      <rect x="16" y="30" width="14" height="14" rx="2" fill="#cfeaff" />
      <rect x="34" y="30" width="14" height="22" rx="2" fill="#cfeaff" />
      <path d="M8 12h48l2 10a6 6 0 01-12 1 6 6 0 01-12 0 6 6 0 01-12 0 6 6 0 01-12-1z" fill="#fff" />
      <path d="M20 12l-2 11M32 12v11M44 12l2 11" stroke="var(--brand)" strokeWidth="2.5" />
    </svg>
  );
}
