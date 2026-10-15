import Link from "next/link";

/** Marca provisória até a identidade oficial ser entregue. */
export function Logo({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="flex items-center gap-2.5" aria-label="GereVendas Ads, início">
      <span aria-hidden className="grid size-8 place-items-center rounded-[10px] bg-ink text-white">
        <svg
          viewBox="0 0 24 24"
          className="size-4.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M4 17l5-5 4 4 7-8" />
          <path d="M15 8h5v5" />
        </svg>
      </span>
      <span className="font-display text-[17px] font-bold tracking-tight text-ink">
        GereVendas <span className="text-brand">Ads</span>
      </span>
    </Link>
  );
}
