import type { Metadata } from "next";
import { NewPasswordForm } from "@/components/auth/password-forms";
import { Card } from "@/components/ui/card";

export const metadata: Metadata = { title: "Senha" };

export default function NewPasswordPage() {
  return (
    <div className="mx-auto max-w-md">
      <h1 className="font-display text-3xl font-bold tracking-tight">Senha</h1>
      <Card className="mt-6 p-6 sm:p-8">
        <NewPasswordForm />
      </Card>
    </div>
  );
}
