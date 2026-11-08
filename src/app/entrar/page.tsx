import type { Metadata } from "next";
import { Suspense } from "react";
import { LegalLinks } from "@/components/marketing/legal-page";
import { SignInForm } from "@/components/auth/sign-in-form";
import { Card } from "@/components/ui/card";
import { Logo } from "@/components/ui/logo";
import { Skeleton } from "@/components/ui/skeleton";
import { isSupabaseConfigured } from "@/lib/public-env";

export const metadata: Metadata = { title: "Entrar" };

export default function SignInPage() {
  const demo = !isSupabaseConfigured();
  return (
    <main className="grid min-h-dvh place-items-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-8 flex justify-center">
          <Logo />
        </div>
        <Card className="p-6 sm:p-8">
          <h1 className="font-display text-2xl font-bold tracking-tight">Entrar</h1>
          <p className="mt-1.5 text-[15px] text-ink-soft">
            {demo
              ? "Este ambiente ainda não tem login configurado."
              : "Entre com sua senha ou receba um link de acesso no seu e-mail."}
          </p>
          <div className="mt-6">
            <Suspense fallback={<Skeleton className="h-28" />}>
              <SignInForm demo={demo} />
            </Suspense>
          </div>
        </Card>
        <LegalLinks className="mt-6 flex justify-center gap-4 text-sm text-ink-faint" />
      </div>
    </main>
  );
}
