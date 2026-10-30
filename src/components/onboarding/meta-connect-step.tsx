"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { INSTAGRAM_MESSAGE } from "@/components/meta/connection-steps";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { META_PARTNERS_URL } from "@/lib/meta-links";
import { linkMetaPage, requestAdAccount } from "@/server/meta/actions";
import type { MetaOnboardingView } from "@/server/meta/steps";

export type MetaConnectProps = {
  connection: MetaOnboardingView | null;
  /** Conta compartilhada (ADR 0009): a conta de anúncios é ativada sozinha, sem passo do cliente. */
  shared: boolean;
  canManage: boolean;
  simulated: boolean;
  disabled: boolean;
  businessId: string | null;
};

type Message = { tone: "success" | "warning" | "danger"; text: string };

/** Etapa final do cadastro: o dono compartilha Página e Instagram com a BM da GereVendas. */
export function MetaConnectStep({ connection, shared, canManage, simulated, disabled, businessId }: MetaConnectProps) {
  const router = useRouter();
  const [pageUrl, setPageUrl] = useState("");
  const [instagram, setInstagram] = useState("");
  const [copied, setCopied] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);
  const [pending, start] = useTransition();
  const linked = connection?.page_access_status === "done" && connection.page_id;

  if (linked) {
    return (
      <div className="space-y-5">
        <Alert tone="success" title="Página conectada">
          {connection.page_name}.{" "}
          {connection.instagram_status === "done"
            ? "Instagram conectado."
            : "Instagram ainda não conectado: você pode ligar depois em Conexões."}
        </Alert>
        <ButtonLink href="/app/criativos" size="lg">
          Criar meus anúncios
        </ButtonLink>
      </div>
    );
  }

  // Estoque de contas (ADR 0005) tem mais passos; ficam na tela Conexões.
  if (!shared) {
    return (
      <div className="space-y-5">
        <p className="text-ink-soft">Ligue sua conta de anúncios, Página e Instagram à Meta em poucos passos.</p>
        <div className="flex flex-wrap gap-3">
          <ButtonLink href="/app/conexoes">Conectar agora</ButtonLink>
          <ButtonLink href="/app/criativos" variant="secondary">
            Fazer depois
          </ButtonLink>
        </div>
      </div>
    );
  }

  const interactive = canManage && !disabled;

  async function copyId() {
    if (!businessId) return;
    await navigator.clipboard.writeText(businessId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function verify(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    start(async () => {
      const account = await requestAdAccount();
      if (!account.ok) {
        setMessage({ tone: "danger", text: account.error.message });
        return;
      }
      const res = await linkMetaPage({ page_url: pageUrl, instagram_username: instagram });
      if (!res.ok) {
        setMessage({ tone: "danger", text: res.error.message });
        return;
      }
      if (res.data.instagram === "not_found" || res.data.instagram === "taken") {
        setMessage({ tone: "warning", text: INSTAGRAM_MESSAGE[res.data.instagram] });
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <p className="text-ink-soft">
        Para publicar, a GereVendas precisa de acesso de anúncios à sua Página e ao seu Instagram. Você continua dono
        deles.
        {simulated && (
          <>
            {" "}
            <Badge tone="demo">Simulação</Badge>
          </>
        )}
      </p>

      <ol className="space-y-3">
        <GuideStep n={1} title="Abra os parceiros no Business Suite">
          <a
            href={META_PARTNERS_URL}
            target="_blank"
            rel="noreferrer"
            className="font-semibold text-brand underline-offset-2 hover:underline"
          >
            Abrir Business Suite ↗
          </a>
          <p className="mt-1 text-xs text-ink-faint">Sem portfólio empresarial? A Meta pede para criar um ali.</p>
        </GuideStep>
        <GuideStep n={2} title="Adicione a GereVendas como parceira com este ID">
          <div className="flex flex-wrap items-center gap-2">
            <code className="rounded-lg bg-surface-muted px-3 py-1.5 font-mono text-base">
              {businessId ?? "000000000000000"}
            </code>
            {businessId && (
              <Button type="button" size="sm" variant="secondary" onClick={copyId}>
                {copied ? "Copiado" : "Copiar ID"}
              </Button>
            )}
          </div>
        </GuideStep>
        <GuideStep n={3} title="Marque sua Página e seu Instagram com permissão de anúncios e salve" />
        <GuideStep n={4} title="Cole o link da sua Página aqui e verifique">
          <form onSubmit={verify} className="grid gap-3 sm:grid-cols-[1fr_180px] sm:items-end">
            <Field id="onb_page_url" label="Link da Página">
              <Input
                id="onb_page_url"
                value={pageUrl}
                onChange={(e) => setPageUrl(e.target.value)}
                placeholder="facebook.com/seunegocio"
                disabled={!interactive}
              />
            </Field>
            <Field id="onb_instagram" label="@ do Instagram (opcional)">
              <Input
                id="onb_instagram"
                value={instagram}
                onChange={(e) => setInstagram(e.target.value)}
                placeholder="@seunegocio"
                disabled={!interactive}
              />
            </Field>
            <Button
              type="submit"
              className="sm:col-span-2 sm:justify-self-start"
              disabled={!interactive || pending || !pageUrl.trim()}
            >
              {pending ? "Verificando…" : "Verificar conexão"}
            </Button>
          </form>
        </GuideStep>
      </ol>

      {!canManage && <Alert tone="info">Só o proprietário da empresa pode conectar a Página.</Alert>}
      {disabled && <Alert tone="warning">A conexão com a Meta está indisponível agora. Tente mais tarde.</Alert>}
      {message && <Alert tone={message.tone}>{message.text}</Alert>}

      <div className="border-t border-line pt-5">
        <ButtonLink href="/app/criativos" variant="ghost">
          Fazer depois e criar meus anúncios
        </ButtonLink>
      </div>
    </div>
  );
}

function GuideStep({ n, title, children }: { n: number; title: string; children?: React.ReactNode }) {
  return (
    <li className="flex gap-3 rounded-xl border border-line p-4">
      <span
        aria-hidden
        className="grid size-7 shrink-0 place-items-center rounded-full bg-brand text-sm font-bold text-white"
      >
        {n}
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-ink">{title}</p>
        {children && <div className="mt-2 text-sm">{children}</div>}
      </div>
    </li>
  );
}
