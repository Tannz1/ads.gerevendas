"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

const TABS = [
  {
    href: "/app",
    label: "Início",
    match: (p: string) => p === "/app",
    icon: <path d="M3 10.5L12 3l9 7.5V20a1 1 0 01-1 1h-5v-6H9v6H4a1 1 0 01-1-1v-9.5z" />,
  },
  {
    href: "/app/anuncios",
    label: "Anúncios",
    match: (p: string) => p.startsWith("/app/anuncios"),
    icon: <path d="M20.6 13.4l-7.2 7.2a2 2 0 01-2.8 0L3 13V3h10l7.6 7.6a2 2 0 010 2.8zM7.5 7.5h.01" />,
  },
  {
    href: "/app/conta",
    label: "Conta",
    match: (p: string) => p.startsWith("/app/conta"),
    icon: <path d="M12 12a4 4 0 100-8 4 4 0 000 8zm-7 9a7 7 0 0114 0" />,
  },
];

export function TabBarLinks() {
  const pathname = usePathname();
  return (
    <ul className="mx-auto grid h-16 max-w-md grid-cols-3 px-2">
      {TABS.map((t) => {
        const active = t.match(pathname);
        return (
          <li key={t.href} className="flex">
            <Link
              href={t.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "m-1.5 flex flex-1 flex-col items-center justify-center gap-0.5 rounded-xl text-xs font-semibold",
                active ? "bg-brand-soft text-brand-strong" : "text-ink-soft",
              )}
            >
              <svg
                aria-hidden
                viewBox="0 0 24 24"
                className="size-5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                {t.icon}
              </svg>
              {t.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
