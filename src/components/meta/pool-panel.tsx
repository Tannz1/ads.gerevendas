"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { PoolAccountView, PoolOverview } from "@/server/meta/data";
import {
  createPoolAccount,
  listImportCandidates,
  registerPoolAccounts,
  retirePoolAccount,
} from "@/server/meta/operator-actions";

type Props = {
  overview: PoolOverview;
  accounts: PoolAccountView[];
  simulated: boolean;
  minAvailable: number;
  disabledMessage: string | null;
};

const STATUS_LABEL = { available: "Livre", assigned: "Atribuída", retired: "Aposentada" } as const;

export function PoolPanel({ overview, accounts, simulated, minAvailable, disabledMessage }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ tone: "success" | "danger" | "info"; text: string } | null>(null);
  const [candidates, setCandidates] = useState<Array<{ id: string; name: string }> | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  function act(fn: () => Promise<{ ok: boolean; error?: { message: string } }>, success: string) {
    setMessage(null);
    start(async () => {
      const res = await fn();
      if (!res.ok) {
        setMessage({ tone: "danger", text: res.error?.message ?? "Erro." });
        return;
      }
      setMessage({ tone: "success", text: success });
      setCandidates(null);
      setSelected(new Set());
      router.refresh();
    });
  }

  function loadCandidates() {
    setMessage(null);
    start(async () => {
      const res = await listImportCandidates();
      if (!res.ok) {
        setMessage({ tone: "danger", text: res.error.message });
        return;
      }
      setCandidates(res.data.accounts);
      if (res.data.accounts.length === 0) setMessage({ tone: "info", text: "Nenhuma conta nova ativa em BRL na BM." });
    });
  }

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="mt-8 space-y-5">
      {disabledMessage && <Alert tone="danger">{disabledMessage}</Alert>}
      {overview.available < minAvailable && (
        <Alert tone="warning" title="Estoque baixo">
          {overview.available} conta(s) livre(s); mínimo configurado: {minAvailable}.
          {overview.waiting > 0 && ` ${overview.waiting} empresa(s) aguardando conta.`}
        </Alert>
      )}
      {message && <Alert tone={message.tone}>{message.text}</Alert>}

      <div className="grid gap-4 sm:grid-cols-4">
        {(
          [
            ["Livres", overview.available],
            ["Atribuídas", overview.assigned],
            ["Aposentadas", overview.retired],
            ["Na fila", overview.waiting],
          ] as const
        ).map(([label, value]) => (
          <Card key={label} className="p-4">
            <p className="text-sm text-ink-soft">{label}</p>
            <p className="font-display text-2xl font-bold">{value}</p>
          </Card>
        ))}
      </div>

      <Card className="p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-lg font-bold">Abastecer o estoque</h2>
          {simulated && <Badge tone="demo">Simulação</Badge>}
        </div>
        <p className="mt-1 text-sm text-ink-soft">
          Crie contas no Business Suite (ou pela API, até 5 por BM) e registre aqui só as que são para clientes.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Button disabled={pending || Boolean(disabledMessage)} onClick={loadCandidates}>
            Buscar contas da BM
          </Button>
          <Button
            variant="secondary"
            disabled={pending || Boolean(disabledMessage)}
            onClick={() => act(createPoolAccount, "Conta criada pela API e registrada.")}
          >
            Criar 1 conta pela API
          </Button>
        </div>

        {candidates && candidates.length > 0 && (
          <div className="mt-5 space-y-2">
            {candidates.map((c) => (
              <label key={c.id} className="flex items-center gap-2.5 text-sm">
                <input
                  type="checkbox"
                  checked={selected.has(c.id)}
                  onChange={() => toggle(c.id)}
                  className="size-4 accent-[var(--color-brand)]"
                />
                <span>
                  {c.name} <span className="text-ink-faint">({c.id})</span>
                </span>
              </label>
            ))}
            <Button
              className="mt-2"
              disabled={pending || selected.size === 0}
              onClick={() =>
                act(() => registerPoolAccounts({ ad_account_ids: [...selected] }), "Contas registradas no estoque.")
              }
            >
              Registrar {selected.size} conta(s)
            </Button>
          </div>
        )}
      </Card>

      <Card className="overflow-x-auto p-5 sm:p-6">
        <h2 className="font-display text-lg font-bold">Contas</h2>
        {accounts.length === 0 ? (
          <p className="mt-2 text-sm text-ink-soft">Nenhuma conta no estoque ainda.</p>
        ) : (
          <table className="mt-3 w-full text-left text-sm">
            <thead className="text-ink-faint">
              <tr>
                <th className="py-2 pr-3">Conta</th>
                <th className="py-2 pr-3">Situação</th>
                <th className="py-2 pr-3">Origem</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {accounts.map((a) => (
                <tr key={a.id} className="border-t border-line">
                  <td className="py-2 pr-3">
                    {a.name}
                    <div className="text-xs text-ink-faint">{a.ad_account_id}</div>
                  </td>
                  <td className="py-2 pr-3">
                    {STATUS_LABEL[a.status]}
                    {a.status === "assigned" && !a.organization_id && " (empresa excluída)"}
                  </td>
                  <td className="py-2 pr-3">{a.source === "api" ? "API" : "Importada"}</td>
                  <td className="py-2 text-right">
                    {a.status === "available" && (
                      <Button
                        variant="secondary"
                        disabled={pending}
                        onClick={() => act(() => retirePoolAccount({ id: a.id }), "Conta aposentada.")}
                      >
                        Aposentar
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
