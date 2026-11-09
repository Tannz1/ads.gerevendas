import type { Metadata } from "next";
import Link from "next/link";
import { AccountManagement } from "@/components/account/account-management";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { serverEnv } from "@/lib/env";
import { resolveFlags } from "@/lib/flags";
import { loadAccountManagementData } from "@/server/account-data";
import { getAppContext } from "@/server/context";

export const metadata: Metadata = { title: "Conta" };

const SHORTCUTS = [
  {
    href: "/app/onboarding",
    label: "Meu negócio",
    text: "Nome, cidade, WhatsApp e o que você vende.",
    icon: <path d="M4 7h16M4 7v12a1 1 0 001 1h14a1 1 0 001-1V7M4 7l2-3h12l2 3M9 11h6" />,
  },
  {
    href: "/app/conexoes",
    label: "Conexões",
    text: "Sua Página do Facebook e o Instagram.",
    icon: (
      <path d="M13.8 10.2a4 4 0 00-5.6 0l-4 4a4 4 0 105.6 5.6l1.1-1.1m-.7-4.9a4 4 0 005.6 0l4-4a4 4 0 00-5.6-5.6l-1.1 1.1" />
    ),
  },
  {
    href: "/app/assinatura",
    label: "Assinatura",
    text: "Seu plano e os créditos do mês.",
    icon: <path d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />,
  },
];

const ROLE_LABEL = {
  owner: "Proprietário",
  admin: "Administrador",
  member: "Membro",
  support: "Suporte (auditado)",
} as const;

export default async function AccountPage() {
  const ctx = await getAppContext();
  const flags = resolveFlags(serverEnv());

  const rows: Array<{ label: string; value: React.ReactNode }> =
    ctx.mode === "demo"
      ? [{ label: "Modo", value: <Badge tone="demo">Demonstração</Badge> }]
      : [
          { label: "E-mail", value: ctx.user.email ?? "—" },
          { label: "Empresa", value: ctx.organization?.name ?? "—" },
          { label: "Seu papel", value: ctx.organization ? ROLE_LABEL[ctx.organization.role] : "—" },
        ];

  const integrations = [
    { label: "Plano", value: <Badge tone="brand">{flags.pilotMode ? "Piloto" : "R$ 199/mês"}</Badge> },
    { label: "Cobrança", value: <Badge>Não ativada</Badge> },
    { label: "Integração Meta", value: <Badge>{flags.metaMode === "mock" ? "Simulação" : "Real"}</Badge> },
    {
      label: "Publicação real de anúncios",
      value: (
        <Badge tone={flags.realPublishing ? "warning" : "neutral"}>
          {flags.realPublishing ? "Ativada" : "Desativada"}
        </Badge>
      ),
    },
  ];

  const management =
    ctx.mode === "supabase" && ctx.organization
      ? await loadAccountManagementData(
          ctx.organization.id,
          ctx.user.id,
          ctx.organization.role === "owner" || ctx.organization.role === "admin",
        )
      : null;

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-3xl font-bold tracking-tight">Conta</h1>
        {ctx.mode === "supabase" && (
          <ButtonLink href="/app/senha" variant="secondary" size="sm">
            Definir ou trocar senha
          </ButtonLink>
        )}
      </div>
      <nav aria-label="Configurações" className="mt-8 grid gap-3 sm:grid-cols-3">
        {SHORTCUTS.map((s) => (
          <Link
            key={s.href}
            href={s.href}
            className="group flex flex-col gap-2 rounded-2xl border border-line bg-surface p-5 shadow-[var(--shadow-card)] transition-colors hover:border-brand/40"
          >
            <span className="grid size-10 place-items-center rounded-xl bg-brand-soft text-brand">
              <svg
                aria-hidden
                viewBox="0 0 24 24"
                className="size-5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                {s.icon}
              </svg>
            </span>
            <span className="font-display text-[17px] font-bold">{s.label}</span>
            <span className="text-sm text-ink-soft">{s.text}</span>
          </Link>
        ))}
      </nav>

      <Card className="mt-6 divide-y divide-line">
        {[...rows, ...integrations].map((r) => (
          <div key={r.label} className="flex items-center justify-between gap-4 px-5 py-4 sm:px-6">
            <span className="text-[15px] text-ink-soft">{r.label}</span>
            <span className="min-w-0 truncate text-right text-[15px] font-medium">{r.value}</span>
          </div>
        ))}
      </Card>
      {flags.killSwitch && (
        <p
          role="status"
          className="mt-4 rounded-xl border border-danger/20 bg-danger-soft px-4 py-3 text-sm text-danger"
        >
          Kill switch global ativo: todas as integrações externas estão bloqueadas.
        </p>
      )}

      {ctx.mode === "supabase" && ctx.organization && management && (
        <AccountManagement
          organizationId={ctx.organization.id}
          organizationName={ctx.organization.name}
          currentRole={ctx.organization.role}
          members={management.members}
          invites={management.invites}
          consents={management.consents}
          business={management.business}
        />
      )}
    </div>
  );
}
