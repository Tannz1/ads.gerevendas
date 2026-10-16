"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, useEffect, useState, type ReactNode } from "react";
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
    href: "/app/estrategia",
    label: "Estratégia",
    icon: (
      <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3zM19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15z" />
    ),
  },
  {
    href: "/app/criativos",
    label: "Criativos",
    icon: (
      <path d="M5 5h10a2 2 0 012 2v12a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2zM7 3h12a2 2 0 012 2v12M3 16l4-4 3 3 2-2 5 5" />
    ),
  },
  { href: "/app/conta", label: "Conta", icon: <path d="M12 12a4 4 0 100-8 4 4 0 000 8zm-7 9a7 7 0 0114 0" /> },
];

/** Lista de links; `pathname` null = sem item ativo (prerender de rotas com parâmetro dinâmico). */
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

function ActiveNavList({ onNavigate }: { onNavigate?: () => void }) {
  return <NavList pathname={usePathname()} onNavigate={onNavigate} />;
}

/**
 * Com cacheComponents, `usePathname` suspende no prerender de rotas com parâmetro dinâmico
 * (ex.: /app/criativos/[id]); o fallback mostra os mesmos links sem destaque.
 */
function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <Suspense fallback={<NavList pathname={null} onNavigate={onNavigate} />}>
      <ActiveNavList onNavigate={onNavigate} />
    </Suspense>
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

/** Fecha o menu ao trocar de rota (isolado para suspender sem esconder o botão do menu). */
function CloseOnRouteChange({ onChange }: { onChange: () => void }) {
  const pathname = usePathname();
  useEffect(() => {
    onChange();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reage só à troca de rota
  }, [pathname]);
  return null;
}

export function MobileNav({ footer }: { footer?: ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="lg:hidden">
      <Suspense fallback={null}>
        <CloseOnRouteChange onChange={() => setOpen(false)} />
      </Suspense>
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
