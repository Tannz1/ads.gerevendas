import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { inviteTokenSchema } from "@/contracts/account";
import { AcceptInviteButton } from "@/components/account/accept-invite-button";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Logo } from "@/components/ui/logo";
import { Skeleton } from "@/components/ui/skeleton";
import { isSupabaseConfigured } from "@/lib/public-env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { inspectInviteByToken } from "@/server/account-data";

export const metadata: Metadata = { title: "Convite para empresa" };

const ROLE_LABEL = { admin: "Administrador", member: "Membro" } as const;

type InvitePageProps = { params: Promise<{ token: string }> };

export default function InvitePage(props: InvitePageProps) {
  return (
    <Suspense
      fallback={
        <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-5 py-12">
          <Logo />
          <Skeleton className="mt-8 h-40 w-full" />
        </main>
      }
    >
      <InviteContent {...props} />
    </Suspense>
  );
}

async function InviteContent({ params }: InvitePageProps) {
  const { token } = await params;
  const parsedToken = inviteTokenSchema.safeParse(token);

  if (!isSupabaseConfigured()) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-5 py-12">
        <Logo />
        <Card className="mt-8 p-6">
          <Badge tone="demo">Demonstração</Badge>
          <h1 className="mt-3 font-display text-2xl font-bold">Convite de equipe</h1>
          <p className="mt-2 text-sm text-ink-soft">
            Aceitação de convites está disponível no piloto com conta conectada.
          </p>
          <Link href="/app" className="mt-6 inline-block text-sm font-semibold text-brand hover:underline">
            Ir para o painel →
          </Link>
        </Card>
      </main>
    );
  }

  if (!parsedToken.success) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-5 py-12">
        <Logo />
        <Card className="mt-8 p-6">
          <Alert tone="danger">Este link de convite é inválido.</Alert>
        </Card>
      </main>
    );
  }

  await connection();
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();

  if (!auth.user) {
    const nextPath = encodeURIComponent(`/convite/${parsedToken.data}`);
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-5 py-12">
        <Logo />
        <Card className="mt-8 p-6">
          <h1 className="font-display text-2xl font-bold">Você recebeu um convite</h1>
          <p className="mt-2 text-sm text-ink-soft">
            Entre com o seu e-mail para visualizar e aceitar o convite da empresa.
          </p>
          <Link
            href={`/entrar?next=${nextPath}`}
            className="mt-6 inline-flex h-11 w-full items-center justify-center rounded-xl bg-brand px-5 text-sm font-semibold text-white hover:bg-brand-strong"
          >
            Entrar para aceitar convite
          </Link>
        </Card>
      </main>
    );
  }

  const invite = await inspectInviteByToken(parsedToken.data);

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-5 py-12">
      <Logo />
      <Card className="mt-8 p-6">
        {!invite ? (
          <Alert tone="danger">Convite não encontrado.</Alert>
        ) : invite.status !== "pending" || invite.expired ? (
          <Alert tone="warning">Este convite já foi utilizado, expirou ou foi revogado.</Alert>
        ) : (
          <>
            <Badge tone="brand">Convite pendente</Badge>
            <h1 className="mt-3 font-display text-2xl font-bold">{invite.organization_name}</h1>
            <p className="mt-2 text-sm text-ink-soft">
              Convite enviado para <strong>{invite.email}</strong> com papel de{" "}
              <strong>{ROLE_LABEL[invite.role]}</strong>.
            </p>
            <AcceptInviteButton token={parsedToken.data} />
          </>
        )}
      </Card>
    </main>
  );
}
