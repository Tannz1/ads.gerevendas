"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { connectMetaAssets, disconnectMetaAssets } from "@/server/campaigns";
import type { MetaConnectionView } from "@/server/campaigns-data";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/field";

type Props = {
  connection: MetaConnectionView | null;
  canManage: boolean;
  metaMode: "mock" | "real";
  defaultBusinessName: string;
  defaultWhatsapp: string | null;
};

export function MetaConnectionPanel({ connection, canManage, metaMode, defaultBusinessName, defaultWhatsapp }: Props) {
  const router = useRouter();
  const isConnected = connection?.status === "connected";

  const [adAccountId, setAdAccountId] = useState(connection?.ad_account_id ?? "act_1020304050");
  const [adAccountName, setAdAccountName] = useState(connection?.ad_account_name ?? `${defaultBusinessName} Ads`);
  const [pageId, setPageId] = useState(connection?.page_id ?? "page_99887766");
  const [pageName, setPageName] = useState(connection?.page_name ?? defaultBusinessName);
  const [instagramId, setInstagramId] = useState(connection?.instagram_actor_id ?? "");
  const [whatsappPhone, setWhatsappPhone] = useState(connection?.whatsapp_phone_e164 ?? defaultWhatsapp ?? "");
  const [billingVerified, setBillingVerified] = useState(connection?.billing_verified_on_meta ?? false);
  const [message, setMessage] = useState<{ tone: "info" | "success" | "danger"; text: string } | null>(null);
  const [pending, start] = useTransition();

  function handleConnect(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    start(async () => {
      const res = await connectMetaAssets({
        ad_account_id: adAccountId,
        ad_account_name: adAccountName,
        page_id: pageId,
        page_name: pageName,
        instagram_actor_id: instagramId.trim() || undefined,
        whatsapp_phone_e164: whatsappPhone.trim() || undefined,
        billing_verified_on_meta: billingVerified,
      });
      if (!res.ok) {
        setMessage({ tone: "danger", text: res.error.message });
        return;
      }
      setMessage({
        tone: "success",
        text: res.data.simulated ? "Ativos vinculados em modo Simulação." : "Ativos Meta conectados com sucesso.",
      });
      router.refresh();
    });
  }

  function handleDisconnect() {
    setMessage(null);
    start(async () => {
      const res = await disconnectMetaAssets();
      if (!res.ok) {
        setMessage({ tone: "danger", text: res.error.message });
        return;
      }
      setMessage({ tone: "info", text: "Conexão Meta removida." });
      router.refresh();
    });
  }

  return (
    <div className="mt-8 space-y-6">
      <Card className="p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-bold">Status dos ativos Meta</h2>
            <p className="mt-1 text-sm text-ink-soft">
              Conta de anúncios, Página do Facebook, Instagram e WhatsApp Business pertencem à sua empresa.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {metaMode === "mock" && <Badge tone="demo">Simulação</Badge>}
            <Badge tone={isConnected ? "success" : "neutral"}>{isConnected ? "Conectada" : "Desconectada"}</Badge>
          </div>
        </div>

        <Alert tone="info" className="mt-4" title="Cobrança de mídia separada">
          O pagamento pelos anúncios veiculados (Pix ou cartão da mídia) é feito diretamente no Gerenciador de Anúncios
          oficial da Meta. O GereVendas Ads nunca coleta saldo de mídia nem armazena cartão Meta.
        </Alert>

        <form onSubmit={handleConnect} className="mt-6 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="ad_account_id" label="ID da Conta de Anúncios" hint="Ex.: act_1020304050">
              <Input
                id="ad_account_id"
                value={adAccountId}
                disabled={!canManage || pending}
                onChange={(e) => setAdAccountId(e.target.value)}
              />
            </Field>
            <Field id="ad_account_name" label="Nome da Conta de Anúncios">
              <Input
                id="ad_account_name"
                value={adAccountName}
                disabled={!canManage || pending}
                onChange={(e) => setAdAccountName(e.target.value)}
              />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="page_id" label="ID da Página do Facebook">
              <Input
                id="page_id"
                value={pageId}
                disabled={!canManage || pending}
                onChange={(e) => setPageId(e.target.value)}
              />
            </Field>
            <Field id="page_name" label="Nome da Página do Facebook">
              <Input
                id="page_name"
                value={pageName}
                disabled={!canManage || pending}
                onChange={(e) => setPageName(e.target.value)}
              />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="instagram_id" label="ID da Conta Instagram (opcional)">
              <Input
                id="instagram_id"
                placeholder="ig_123456"
                value={instagramId}
                disabled={!canManage || pending}
                onChange={(e) => setInstagramId(e.target.value)}
              />
            </Field>
            <Field id="whatsapp_phone" label="WhatsApp vinculado na Página (opcional)" hint="Ex.: +5519999990000">
              <Input
                id="whatsapp_phone"
                placeholder="+5519999990000"
                value={whatsappPhone}
                disabled={!canManage || pending}
                onChange={(e) => setWhatsappPhone(e.target.value)}
              />
            </Field>
          </div>

          <label className="flex items-start gap-2.5 pt-2 text-sm">
            <input
              type="checkbox"
              checked={billingVerified}
              disabled={!canManage || pending}
              onChange={(e) => setBillingVerified(e.target.checked)}
              className="mt-1 size-4 accent-[var(--color-brand)]"
            />
            <span>
              Confirmo que já configurei uma forma de pagamento válida diretamente no Gerenciador de Anúncios da Meta.
            </span>
          </label>

          {message && <Alert tone={message.tone}>{message.text}</Alert>}

          {canManage ? (
            <div className="flex flex-wrap gap-3 pt-2">
              <Button type="submit" disabled={pending}>
                {pending
                  ? "Salvando…"
                  : metaMode === "mock"
                    ? "Conectar ativos (Simulação)"
                    : "Salvar ativos conectados"}
              </Button>
              {isConnected && (
                <Button type="button" variant="secondary" onClick={handleDisconnect} disabled={pending}>
                  Desconectar
                </Button>
              )}
            </div>
          ) : (
            <p className="text-sm text-ink-faint">
              Apenas proprietários ou administradores podem alterar a conexão Meta.
            </p>
          )}
        </form>
      </Card>
    </div>
  );
}
