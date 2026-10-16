"use client";

import { Button, ButtonLink } from "@/components/ui/button";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-6 text-center">
      <h1 className="font-display text-3xl font-bold tracking-tight">Algo deu errado</h1>
      <p className="mt-3 text-ink-soft">Não conseguimos carregar esta página. Tente de novo em instantes.</p>
      {error.digest && <p className="mt-2 text-sm text-ink-faint">Código para o suporte: {error.digest}</p>}
      <div className="mt-8 flex gap-3">
        <Button size="lg" onClick={reset}>
          Tentar de novo
        </Button>
        <ButtonLink href="/" size="lg" variant="secondary">
          Início
        </ButtonLink>
      </div>
    </main>
  );
}
