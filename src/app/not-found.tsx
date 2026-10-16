import type { Metadata } from "next";
import { ButtonLink } from "@/components/ui/button";

export const metadata: Metadata = { title: "Página não encontrada" };

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-6 text-center">
      <p className="text-sm font-semibold text-ink-faint">Erro 404</p>
      <h1 className="mt-2 font-display text-3xl font-bold tracking-tight">Página não encontrada</h1>
      <p className="mt-3 text-ink-soft">O endereço pode ter mudado ou não existir mais.</p>
      <ButtonLink href="/" size="lg" className="mt-8">
        Voltar ao início
      </ButtonLink>
    </main>
  );
}
