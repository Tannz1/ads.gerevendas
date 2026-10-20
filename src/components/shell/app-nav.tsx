"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, useState, type ReactNode } from "react";
import { Logo } from "@/components/ui/logo";
import { cn } from "@/lib/cn";

const items = [
  {
    href: "/app",
    label: "Início",
    icon: <path d="M3 10.5L12 3l9 7.5V20a1 1 0 01-1 1h-5v-6H9v6H4a1 1 0 01-1-1v-9.5z" />,
  },
  {
    href: "/app/onboarding",
    label: "Meu negócio",
    icon: <path d="M4 7h16M4 7v12a1 1 0 001 1h14a1 1 0 001-1V7M4 7l2-3h12l2 3M9 11h6" />,
  },
  {
    href: "/app/criativos",
    label: "Criativos",
    icon: (
      <path d="M4 5a1 1 0 011-1h14a1 1 0 011 1v14a1 1 0 01-1 1H5a1 1 0 01-1-1V5zm0 11l4.5-4.5 3.5 3.5 2.5-2.5L20 16M15 9h.01" />
    ),
  },
  {
    href: "/app/campanhas",
    label: "Campanhas",
    icon: (
      <path d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" />
    ),
  },
  {
    href: "/app/conexoes",
    label: "Conexões",
    icon: (
      <path d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
    ),
  },
  { href: "/app/conta", label: "Conta", icon: <path d="M12 12a4 4 0 100-8 4 4 0 000 8zm-7 9a7 7 0 0114 0" /> },
];

// O item ativo depende da URL, que em rotas dinâmicas só existe na requisição (Cache Components):
// fica em <Suspense>, com a lista sem destaque como fallback.
function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <Suspense fallback={<NavList pathname={null} onNavigate={onNavigate} />}>
      <ActiveNavLinks onNavigate={onNavigate} />
    </Suspense>
  );
}

function ActiveNavLinks({ onNavigate }: { onNavigate?: () => void }) {
  return <NavList pathname={usePathname()} onNavigate={onNavigate} />;
}

function NavList({ pathname, onNavigate }: { pathname: string | null; onNavigate?: () => void }) {
  return (
    <ul className="flex flex-col gap-1">
      {items.map((item) => {
        const active =
          pathname !== null && (item.href === "/app" ? pathname === "/app" : pathname.startsWith(item.href));
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] font-medium transition-colors",
                active ? "bg-ink text-white" : "text-ink-soft hover:bg-surface-muted hover:text-ink",
              )}
            >
              <svg
                aria-hidden
                viewBox="0 0 24 24"
                className="size-5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                {item.icon}
              </svg>
              {item.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export function Sidebar({ footer }: { footer?: ReactNode }) {
  return (
    <div className="hidden border-r border-line bg-surface lg:block">
      <aside className="sticky top-0 flex h-dvh flex-col px-4 py-5">
        <div className="px-2">
          <Logo href="/app" />
        </div>
        <nav aria-label="Aplicativo" className="mt-8 flex-1">
          <NavLinks />
        </nav>
        {footer}
      </aside>
    </div>
  );
}

export function MobileNav({ footer }: { footer?: ReactNode }) {
  // Fecha ao navegar pelos links (onNavigate); sem ler a URL aqui, fora de <Suspense>.
  const [open, setOpen] = useState(false);

  return (
    <div className="lg:hidden">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="grid size-10 place-items-center rounded-xl border border-line-strong bg-surface"
        aria-label="Abrir menu"
        aria-expanded={open}
        aria-controls="mobile-nav"
      >
        <svg
          aria-hidden
          viewBox="0 0 24 24"
          className="size-5"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        >
          <path d="M4 7h16M4 12h16M4 17h16" />
        </svg>
      </button>
      {open && (
        <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Menu">
          <button
            type="button"
            aria-label="Fechar menu"
            className="absolute inset-0 bg-ink/40"
            onClick={() => setOpen(false)}
          />
          <div
            id="mobile-nav"
            className="absolute inset-y-0 left-0 flex w-[min(300px,85vw)] flex-col bg-surface px-4 py-5 shadow-[var(--shadow-lift)]"
          >
            <div className="flex items-center justify-between px-2">
              <Logo href="/app" />
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="grid size-9 place-items-center rounded-lg hover:bg-surface-muted"
                aria-label="Fechar menu"
              >
                <svg
                  aria-hidden
                  viewBox="0 0 24 24"
                  className="size-5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                >
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>
            <nav aria-label="Aplicativo" className="mt-8 flex-1">
              <NavLinks onNavigate={() => setOpen(false)} />
            </nav>
            {footer}
          </div>
        </div>
      )}
    </div>
  );
}
