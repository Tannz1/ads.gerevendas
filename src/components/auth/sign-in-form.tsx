"use client";

import { useSearchParams } from "next/navigation";
import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { describedBy, Field, Input } from "@/components/ui/field";
import { signInWithEmail, type SignInState } from "@/server/auth";

export function SignInForm({ demo }: { demo: boolean }) {
  const params = useSearchParams();
  const [state, action, pending] = useActionState<SignInState, FormData>(signInWithEmail, { status: "idle" });

  if (demo) {
    return (
      <div className="flex flex-col gap-4">
        <Alert tone="warning" title="Modo demonstração">
          Os dados ficam apenas neste navegador e nada é enviado a servidores. Configure o Supabase para habilitar
          contas reais.
        </Alert>
        <ButtonLink href="/app" size="lg">
          Entrar em modo demonstração
        </ButtonLink>
        <div className="flex justify-center">
          <Badge tone="demo">DEMO</Badge>
        </div>
      </div>
    );
  }

  if (state.status === "sent") {
    return (
      <Alert tone="success" title="Link enviado">
        Abra o e-mail enviado para <strong className="text-ink">{state.email}</strong> e toque no link para entrar. Ele
        expira em alguns minutos.
      </Alert>
    );
  }

  const linkError = params.get("erro") === "link";
  const error = state.status === "error" ? state.message : undefined;

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      {linkError && (
        <Alert tone="danger" title="Link inválido ou expirado">
          Peça um novo link abaixo.
        </Alert>
      )}
      <input type="hidden" name="next" value={params.get("next") ?? "/app"} />
      <Field id="email" label="E-mail" error={error}>
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
      <Field id="password" label="Senha" optional hint="Deixe em branco para receber um link de acesso por e-mail.">
        <Input id="password" name="password" type="password" autoComplete="current-password" />
      </Field>
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? "Entrando…" : "Entrar"}
      </Button>
    </form>
  );
}
