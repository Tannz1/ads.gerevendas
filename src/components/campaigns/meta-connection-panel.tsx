"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { connectMetaAssets, disconnectMetaAssets } from "@/server/campaigns";
import type { MetaConnectionView } from "@/server/campaigns-data";
import type { DiscoveredMetaAssets } from "@/lib/meta-oauth";
import { publicEnv } from "@/lib/public-env";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/field";

type Props = {
  connection: MetaConnectionView | null;
  canManage: boolean;
  metaMode: "mock" | "real";
  hasRealMetaOAuthApp: boolean;
  oauthStatus: string | null;
  discoveredAssets: DiscoveredMetaAssets | null;
  defaultBusinessName: string;
  defaultWhatsapp: string | null;
};

export function MetaConnectionPanel({
  connection,
  canManage,
  metaMode,
  hasRealMetaOAuthApp,
  oauthStatus,
  discoveredAssets,
  defaultBusinessName,
  defaultWhatsapp,
}: Props) {
  const router = useRouter();
  const isConnected = connection?.status === "connected";

  const firstDiscoveredAccount = discoveredAssets?.ad_accounts[0];
  const firstDiscoveredPage = discoveredAssets?.pages[0];
  // Com o app Meta configurado, nada de IDs de exemplo: só ativos descobertos ou uma conexão real já salva.
  const savedSimulation = hasRealMetaOAuthApp && connection?.simulated === true;
  const saved = savedSimulation ? null : connection;
  const sample = !hasRealMetaOAuthApp;

  const [adAccountId, setAdAccountId] = useState(
    firstDiscoveredAccount?.id ?? saved?.ad_account_id ?? (sample ? "act_1020304050" : ""),
  );
  const [adAccountName, setAdAccountName] = useState(
    firstDiscoveredAccount?.name ?? saved?.ad_account_name ?? (sample ? `${defaultBusinessName} Ads` : ""),
  );
  const [pageId, setPageId] = useState(firstDiscoveredPage?.id ?? saved?.page_id ?? (sample ? "page_99887766" : ""));
  const [pageName, setPageName] = useState(
    firstDiscoveredPage?.name ?? saved?.page_name ?? (sample ? defaultBusinessName : ""),
  );
  const [instagramId, setInstagramId] = useState(
    firstDiscoveredPage?.instagram_actor_id ?? saved?.instagram_actor_id ?? "",
  );
  const [whatsappPhone, setWhatsappPhone] = useState(
    firstDiscoveredPage?.whatsapp_phone_e164 ?? saved?.whatsapp_phone_e164 ?? defaultWhatsapp ?? "",
  );
  const [billingVerified, setBillingVerified] = useState(
    firstDiscoveredAccount?.has_funding_source ?? saved?.billing_verified_on_meta ?? false,
  );
  const [showManualFields, setShowManualFields] = useState(false);
  const [message, setMessage] = useState<{ tone: "info" | "success" | "danger"; text: string } | null>(() => {
    if (oauthStatus === "error") {
      return { tone: "danger", text: "Erro ao comunicar com a Meta. Tente novamente." };
    }
    if (oauthStatus === "cancelled") {
      return { tone: "info", text: "Conexão cancelada na janela da Meta." };
    }
    if (oauthStatus === "forbidden") {
      return { tone: "danger", text: "Apenas proprietários podem conectar ativos da Meta." };
    }
    if (oauthStatus === "ready") {
      return { tone: "success", text: "Ativos descobertos via Meta! Selecione as contas abaixo e confirme." };
    }
    if (oauthStatus === "simulated") {
      return { tone: "info", text: "Ativos simulados carregados com 1 clique. Você já pode vincular." };
    }
    return null;
  });
  const [pending, start] = useTransition();

  function handleConnect(e?: React.FormEvent) {
    if (e) e.preventDefault();
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
        text: res.data.simulated
          ? "Ativos vinculados com sucesso em modo Simulação."
          : "Ativos Meta conectados com sucesso.",
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

  function handleSelectAdAccount(id: string) {
    const acc = discoveredAssets?.ad_accounts.find((a) => a.id === id);
    if (acc) {
      setAdAccountId(acc.id);
      setAdAccountName(acc.name);
      if (acc.has_funding_source) {
        setBillingVerified(true);
      }
    }
  }

  function handleSelectPage(id: string) {
    const pg = discoveredAssets?.pages.find((p) => p.id === id);
    if (pg) {
      setPageId(pg.id);
      setPageName(pg.name);
      if (pg.instagram_actor_id) setInstagramId(pg.instagram_actor_id);
      if (pg.whatsapp_phone_e164) setWhatsappPhone(pg.whatsapp_phone_e164);
    }
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

        {savedSimulation && (
          <Alert tone="warning" className="mt-4" title="A conexão salva é de simulação">
            Os IDs atuais são de exemplo, não das suas contas. Clique em Conectar com Facebook para escolher sua conta
            de anúncios e sua página reais.
          </Alert>
        )}

        <Alert tone="info" className="mt-4" title="Cobrança de mídia separada">
          O pagamento pelos anúncios veiculados (Pix ou cartão da mídia) é feito diretamente no Gerenciador de Anúncios
          oficial da Meta. O GereVendas Ads nunca coleta saldo de mídia nem armazena cartão Meta.
        </Alert>

        {/* Bloco 1-Clique Principal */}
        <div className="mt-6 rounded-xl border border-line bg-surface-muted/50 p-4 sm:p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="font-semibold text-ink">
                {hasRealMetaOAuthApp ? "Conectar com Facebook (Meta)" : "Conectar com 1 Clique (Simulação)"}
              </h3>
              <p className="mt-1 text-xs text-ink-soft">
                {hasRealMetaOAuthApp
                  ? "Abre a janela de autorização da Meta para descobrir suas contas de anúncios e páginas automaticamente."
                  : "Não precisa digitar IDs: clique para preencher automaticamente os ativos e testar a vinculação imediata."}
              </p>
            </div>
            {canManage && (
              <a
                href={`${publicEnv.basePath}/api/meta/oauth/start`}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#1877F2] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#166fe5] focus-visible:ring-2 focus-visible:ring-[#1877F2]/50 focus-visible:outline-none"
              >
                <svg className="size-4 fill-current" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                </svg>
                <span>{hasRealMetaOAuthApp ? "Conectar com Facebook" : "Descobrir Ativos (1 Clique)"}</span>
              </a>
            )}
          </div>

          {discoveredAssets && (discoveredAssets.ad_accounts.length === 0 || discoveredAssets.pages.length === 0) && (
            <Alert tone="warning" className="mt-5" title="A Meta não devolveu tudo o que precisamos">
              {discoveredAssets.ad_accounts.length === 0 && "Nenhuma conta de anúncios foi liberada. "}
              {discoveredAssets.pages.length === 0 && "Nenhuma página foi liberada. "}
              Clique em Conectar com Facebook de novo e, na janela da Meta, marque a conta de anúncios e a página da
              empresa.
            </Alert>
          )}

          {/* Seletores Automáticos de Ativos Descobertos */}
          {discoveredAssets && discoveredAssets.ad_accounts.length > 0 && discoveredAssets.pages.length > 0 && (
            <div className="mt-5 space-y-4 border-t border-line pt-4">
              <div className="text-xs font-semibold tracking-wider text-ink-soft uppercase">
                Ativos Encontrados {discoveredAssets.simulated ? "(Simulação)" : "(Meta)"}
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="discovered_account" className="block text-xs font-medium text-ink-soft">
                    Conta de Anúncios Descoberta
                  </label>
                  <select
                    id="discovered_account"
                    value={adAccountId}
                    onChange={(e) => handleSelectAdAccount(e.target.value)}
                    className="mt-1 w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink focus:ring-2 focus:ring-[var(--color-brand)] focus:outline-none"
                  >
                    {discoveredAssets.ad_accounts.map((acc) => (
                      <option key={acc.id} value={acc.id}>
                        {acc.name} ({acc.id}) {acc.has_funding_source ? "✓ Pagamento OK" : "⚠ Sem cartão"}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="discovered_page" className="block text-xs font-medium text-ink-soft">
                    Página do Facebook Descoberta
                  </label>
                  <select
                    id="discovered_page"
                    value={pageId}
                    onChange={(e) => handleSelectPage(e.target.value)}
                    className="mt-1 w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink focus:ring-2 focus:ring-[var(--color-brand)] focus:outline-none"
                  >
                    {discoveredAssets.pages.map((pg) => (
                      <option key={pg.id} value={pg.id}>
                        {pg.name} ({pg.id})
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Alternância para edição manual avançada */}
        <div className="mt-6 flex items-center justify-between">
          <button
            type="button"
            onClick={() => setShowManualFields(!showManualFields)}
            className="text-xs font-medium text-ink-soft underline decoration-dotted hover:text-ink"
          >
            {showManualFields ? "Ocultar campos manuais avançados" : "Mostrar / Editar campos manuais avançados"}
          </button>
        </div>

        <form onSubmit={handleConnect} className="mt-4 space-y-4">
          {showManualFields && (
            <div className="space-y-4 rounded-xl border border-line/60 bg-surface/50 p-4">
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
            </div>
          )}

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
              <Button type="submit" disabled={pending || !adAccountId.trim() || !pageId.trim()}>
                {pending
                  ? "Salvando…"
                  : metaMode === "mock"
                    ? "Vincular ativos selecionados (Simulação)"
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
