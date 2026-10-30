import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "@/components/ui/logo";
import { CURRENT_TERMS_VERSION } from "@/contracts/account";

/**
 * Dados do controlador exibidos nos Termos e na Política. Precisam ser confirmados pelo
 * responsável legal antes de ir para produção (AGENTS.md: nada de fatos não confirmados).
 */
export const LEGAL_ENTITY = {
  name: "[PREENCHER: razão social]",
  cnpj: "[PREENCHER: CNPJ]",
  address: "[PREENCHER: endereço]",
  contactEmail: "[PREENCHER: e-mail de contato]",
  dpoName: "[PREENCHER: nome do encarregado de dados]",
  dpoEmail: "[PREENCHER: e-mail do encarregado]",
  forum: "[PREENCHER: comarca do foro]",
};

export function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex max-w-3xl items-center justify-between px-4 py-5 sm:px-6">
        <Logo />
      </header>
      <main className="mx-auto max-w-3xl px-4 pb-16 sm:px-6">
        <h1 className="font-display text-3xl font-bold tracking-tight">{title}</h1>
        <p className="mt-2 text-sm text-ink-faint">Versão {CURRENT_TERMS_VERSION}</p>
        <div className="mt-8 space-y-6 text-[15px] leading-relaxed text-ink-soft [&_h2]:mt-10 [&_h2]:font-display [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-ink [&_li]:mt-1.5 [&_ul]:list-disc [&_ul]:pl-5">
          {children}
        </div>
      </main>
      <LegalFooter />
    </div>
  );
}

export function LegalLinks({ className }: { className?: string }) {
  return (
    <nav aria-label="Documentos legais" className={className}>
      <Link href="/termos" className="hover:text-ink">
        Termos de Uso
      </Link>
      <Link href="/privacidade" className="hover:text-ink">
        Política de Privacidade
      </Link>
    </nav>
  );
}

function LegalFooter() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex max-w-3xl flex-col gap-2 px-4 py-8 text-sm text-ink-faint sm:flex-row sm:justify-between sm:px-6">
        <p>© 2026 GereVendas Ads</p>
        <LegalLinks className="flex gap-4" />
      </div>
    </footer>
  );
}
