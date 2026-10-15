"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { describedBy, Field, Input } from "@/components/ui/field";
import { createOrganization, type CreateOrganizationState } from "@/server/organization";

export function CreateOrganizationForm() {
  const [state, action, pending] = useActionState<CreateOrganizationState, FormData>(createOrganization, {});
  return (
    <Card className="mx-auto max-w-lg p-6 sm:p-8">
      <h1 className="font-display text-2xl font-bold tracking-tight">Vamos começar pela sua empresa</h1>
      <p className="mt-1.5 text-[15px] text-ink-soft">
        É o espaço onde ficam seus anúncios. Você pode convidar sua equipe depois.
      </p>
      <form action={action} className="mt-6 flex flex-col gap-4">
        <Field id="org-name" label="Nome da empresa" error={state.error}>
          <Input
            id="org-name"
            name="name"
            required
            autoComplete="organization"
            aria-invalid={Boolean(state.error)}
            aria-describedby={describedBy("org-name", state.error)}
          />
        </Field>
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? "Criando…" : "Criar empresa"}
        </Button>
      </form>
    </Card>
  );
}
