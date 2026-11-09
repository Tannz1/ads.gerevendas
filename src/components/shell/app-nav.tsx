"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, useState, type ReactNode } from "react";
import { Logo } from "@/components/ui/logo";
import { cn } from "@/lib/cn";

type Item = { href: string; label: string; icon: ReactNode; match: (p: string) => boolean };

/** Menu enxuto (ADR 0010): o dia a dia do dono. Negócio, conexões e assinatura ficam dentro de Conta. */
const MAIN: Item[] = [
  {
    href: "/app",
    label: "Início",
    match: (p) => p === "/app",
    icon: <path d="M3 10.5L12 3l9 7.5V20a1 1 0 01-1 1h-5v-6H9v6H4a1 1 0 01-1-1v-9.5z" />,
  },
  {
    href: "/app/anuncios",
    label: "Anúncios",
    match: (p) => p.startsWith("/app/anuncios"),
    icon: <path d="M20.6 13.4l-7.2 7.2a2 2 0 01-2.8 0L3 13V3h10l7.6 7.6a2 2 0 010 2.8zM7.5 7.5h.01" />,
  },
  {
    href: "/app/painel",
    label: "Resultados",
    match: (p) => p.startsWith("/app/painel"),
    icon: <path d="M4 20h16M7 16V9m5 7V4m5 12v-5" />,
  },
  {
    href: "/app/conta",
    label: "Conta",
    match: (p) =>
      ["/app/conta", "/app/onboarding", "/app/conexoes", "/app/assinatura", "/app/senha"].some((x) => p.startsWith(x)),
    icon: <path d="M12 12a4 4 0 100-8 4 4 0 000 8zm-7 9a7 7 0 0114 0" />,
  },
];

/** Modo completo: estratégia com 5 peças, editor e campanhas manuais. */
const ADVANCED: Item[] = [
  {
    href: "/app/criativos",
    label: "Criativos",
    match: (p) => p.startsWith("/app/criativos"),
    icon: (
      <path d="M4 5a1 1 0 011-1h14a1 1 0 011 1v14a1 1 0 01-1 1H5a1 1 0 01-1-1V5zm0 11l4.5-4.5 3.5 3.5 2.5-2.5L20 16M15 9h.01" />
    ),
  },
  {
    href: "/app/campanhas",
    label: "Campanhas",
    match: (p) => p.startsWith("/app/campanhas"),
    icon: <path d="M4 13h3l9 5V6L7 11H4v2zm16-3v4" />,
  },
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

function NavItem({ item, active, onNavigate }: { item: Item; active: boolean; onNavigate?: () => void }) {
  return (
    <li>
      <Link
        href={item.href}
        onClick={onNavigate}
        aria-current={active ? "page" : undefined}
        className={cn(
          "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] font-medium transition-colors",
          active
            ? "bg-brand-soft font-semibold text-brand-strong"
            : "text-ink-soft hover:bg-surface-muted hover:text-ink",
        )}
      >
        <svg
          aria-hidden
          viewBox="0 0 24 24"
          className={cn("size-5", active ? "text-brand" : "text-ink-faint group-hover:text-ink")}
          fill="none"
          stroke="currentColor"
          strokeWidth={active ? "2.2" : "1.8"}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {item.icon}
        </svg>
        {item.label}
      </Link>
    </li>
  );
}

function NavList({ pathname, onNavigate }: { pathname: string | null; onNavigate?: () => void }) {
  const is = (i: Item) => pathname !== null && i.match(pathname);
  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/app/anuncios/novo"
        onClick={onNavigate}
        className="flex h-12 items-center justify-center gap-2 rounded-xl bg-brand text-[15px] font-bold text-white shadow-[0_6px_16px_-8px_rgb(26_138_60/0.7)] transition-colors hover:bg-brand-strong"
      >
        <svg aria-hidden viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M12 5v14M5 12h14" strokeLinecap="round" />
        </svg>
        Criar anúncio
      </Link>
      <ul className="flex flex-col gap-1">
        {MAIN.map((i) => (
          <NavItem key={i.href} item={i} active={is(i)} onNavigate={onNavigate} />
        ))}
      </ul>
      <div>
        <p className="px-3 text-xs font-semibold tracking-wider text-ink-faint uppercase">Modo completo</p>
        <ul className="mt-2 flex flex-col gap-1">
          {ADVANCED.map((i) => (
            <NavItem key={i.href} item={i} active={is(i)} onNavigate={onNavigate} />
          ))}
        </ul>
      </div>
    </div>
  );
}

export function Sidebar({ footer }: { footer?: ReactNode }) {
  return (
    <div className="hidden border-r border-line bg-surface lg:block">
      <aside className="sticky top-0 flex h-dvh flex-col justify-between px-4 py-6">
        <div>
          <div className="px-2">
            <Logo href="/app" />
          </div>
          <nav aria-label="Aplicativo" className="mt-8">
            <NavLinks />
          </nav>
        </div>
        {footer && <div className="pt-4">{footer}</div>}
      </aside>
    </div>
  );
}

export function MobileNav({ footer }: { footer?: ReactNode }) {
  // Fecha ao navegar pelos links (onNavigate); sem ler a URL aqui, fora de <Suspense>.
  const [open, setOpen] = useState(false);

  return (
    <div className="flex items-center gap-3 lg:hidden">
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
      <Logo href="/app" />
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
