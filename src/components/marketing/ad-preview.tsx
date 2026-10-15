/**
 * Peça ilustrativa (4:5) feita só com CSS. É um EXEMPLO visual, não um anúncio real:
 * negócio, oferta e preço são fictícios e o rótulo deixa isso explícito.
 */
export function AdPreview() {
  return (
    <figure className="relative">
      <div className="overflow-hidden rounded-[28px] border border-line bg-surface shadow-[var(--shadow-lift)]">
        <div className="flex items-center gap-3 px-4 py-3">
          <span
            aria-hidden
            className="grid size-9 place-items-center rounded-full bg-[#c2410c] font-display text-sm font-bold text-white"
          >
            PB
          </span>
          <div className="min-w-0 leading-tight">
            <p className="truncate text-sm font-semibold">Padaria do Bairro</p>
            <p className="text-xs text-ink-faint">Patrocinado</p>
          </div>
        </div>

        <div className="relative aspect-[4/5] overflow-hidden bg-[#fbe9d7]">
          <div aria-hidden className="absolute -top-16 -right-20 size-72 rounded-full bg-[#f6c89f]" />
          <div aria-hidden className="absolute -bottom-24 -left-16 size-80 rounded-full bg-[#ef9f63]/70" />
          <div
            aria-hidden
            className="absolute top-[38%] left-1/2 size-40 -translate-x-1/2 rounded-full bg-[#fff6ec] shadow-[0_20px_40px_-12px_rgb(124_45_18/0.45)]"
          >
            <div className="absolute inset-5 rounded-full bg-[#d9894a]" />
            <div className="absolute inset-9 rounded-full bg-[#b5652c]" />
          </div>
          <div className="absolute inset-x-0 top-0 p-6">
            <p className="font-display text-[26px] leading-[1.05] font-extrabold tracking-tight text-[#431407]">
              Café da manhã
              <br />
              completo
            </p>
            <p className="mt-2 text-sm font-medium text-[#7c2d12]">Pão na chapa, café e suco natural</p>
          </div>
          <div className="absolute right-5 bottom-5 left-5 flex items-end justify-between gap-3">
            <span className="rounded-2xl bg-[#431407] px-4 py-2 font-display text-2xl font-extrabold text-white">
              R$ 24,90
            </span>
            <span className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-[#431407]">
              Pedir no WhatsApp
            </span>
          </div>
        </div>
      </div>
      <figcaption className="absolute -top-3 left-5">
        <span className="rounded-full bg-accent px-3 py-1 text-xs font-bold text-ink shadow-sm">
          Exemplo ilustrativo
        </span>
      </figcaption>
    </figure>
  );
}
