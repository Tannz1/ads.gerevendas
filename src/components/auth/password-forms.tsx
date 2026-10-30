"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button, ButtonLink } from "@/components/ui/button";
import { describedBy, Field, Input } from "@/components/ui/field";
import { requestPasswordReset, setPassword, type PasswordState, type SignInState } from "@/server/auth";

/** Pede o e-mail para criar ou trocar a senha. */
export function PasswordResetForm() {
  const [state, action, pending] = useActionState<SignInState, FormData>(requestPasswordReset, { status: "idle" });

  if (state.status === "sent") {
    return (
      <Alert tone="success" title="E-mail enviado">
        Se houver uma conta com <strong className="text-ink">{state.email}</strong>, você vai receber um link para criar
        a nova senha. Ele vale por 1 hora.
      </Alert>
    );
  }

  const error = state.status === "error" ? state.message : undefined;
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <Field id="email" label="E-mail da sua conta" error={error}>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          defaultValue={state.email}
          aria-invalid={Boolean(error)}
          aria-describedby={describedBy("email", error)}
          placeholder="voce@empresa.com.br"
        />
      </Field>
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? "Enviando…" : "Enviar link"}
      </Button>
      <Link href="/entrar" className="text-center text-sm font-medium text-ink-soft hover:text-ink">
        Voltar para entrar
      </Link>
    </form>
  );
}

/** Define a senha da conta logada. */
export function NewPasswordForm() {
  const [state, action, pending] = useActionState<PasswordState, FormData>(setPassword, { status: "idle" });

  if (state.status === "saved") {
    return (
      <div className="flex flex-col gap-4">
        <Alert tone="success" title="Senha salva">
          Da próxima vez, entre com seu e-mail e esta senha.
        </Alert>
        <ButtonLink href="/app" size="lg">
          Continuar
        </ButtonLink>
      </div>
    );
  }

  const error = state.status === "error" ? state.message : undefined;
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <Field id="password" label="Nova senha" hint="Pelo menos 8 caracteres.">
        <Input id="password" name="password" type="password" autoComplete="new-password" required minLength={8} />
      </Field>
      <Field id="confirm" label="Repita a nova senha" error={error}>
        <Input
          id="confirm"
          name="confirm"
          type="password"
          autoComplete="new-password"
          required
          aria-invalid={Boolean(error)}
          aria-describedby={describedBy("confirm", error)}
        />
      </Field>
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? "Salvando…" : "Salvar senha"}
      </Button>
    </form>
  );
}
