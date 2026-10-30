import type { Metadata } from "next";
import { PasswordResetForm } from "@/components/auth/password-forms";
import { Card } from "@/components/ui/card";
import { Logo } from "@/components/ui/logo";

export const metadata: Metadata = { title: "Criar ou trocar senha" };

export default function PasswordResetPage() {
  return (
    <main className="grid min-h-dvh place-items-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-8 flex justify-center">
          <Logo />
        </div>
        <Card className="p-6 sm:p-8">
          <h1 className="font-display text-2xl font-bold tracking-tight">Criar ou trocar senha</h1>
          <p className="mt-1.5 text-[15px] text-ink-soft">Enviamos um link para você definir a senha.</p>
          <div className="mt-6">
            <PasswordResetForm />
          </div>
        </Card>
      </div>
    </main>
  );
}
