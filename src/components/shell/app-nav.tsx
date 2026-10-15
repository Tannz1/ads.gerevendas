"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
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
  { href: "/app/conta", label: "Conta", icon: <path d="M12 12a4 4 0 100-8 4 4 0 000 8zm-7 9a7 7 0 0114 0" /> },
];

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <ul className="flex flex-col gap-1">
      {items.map((item) => {
        const active = item.href === "/app" ? pathname === "/app" : pathname.startsWith(item.href);
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
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  // eslint-disable-next-line react-hooks/set-state-in-effect -- fecha o menu ao trocar de rota
  useEffect(() => setOpen(false), [pathname]);

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
