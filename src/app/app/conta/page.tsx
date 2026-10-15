import type { Metadata } from "next";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { serverEnv } from "@/lib/env";
import { resolveFlags } from "@/lib/flags";
import { getAppContext } from "@/server/context";

export const metadata: Metadata = { title: "Conta" };

const ROLE_LABEL = { owner: "Proprietário", admin: "Administrador", member: "Membro" } as const;

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

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="font-display text-3xl font-bold tracking-tight">Conta</h1>
      <Card className="mt-8 divide-y divide-line">
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
    </div>
  );
}
