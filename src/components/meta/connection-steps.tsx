"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ApiResult } from "@/contracts/api";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink, buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/field";
import { META_PARTNERS_URL, metaBillingUrl } from "@/lib/meta-links";
import {
  linkMetaInstagram,
  linkMetaPage,
  refreshMetaStatus,
  requestAdAccount,
  sendMetaInvite,
  unlinkMetaPage,
} from "@/server/meta/actions";
import { computeSteps, type MetaOnboardingView, type StepKey, type StepState } from "@/server/meta/steps";

type Props = {
  connection: MetaOnboardingView | null;
  canManage: boolean;
  demo: boolean;
  simulated: boolean;
  disabledReason: "kill_switch" | "config_missing" | null;
  businessId: string | null;
  defaultInviteEmail: string;
  /** Conta compartilhada da GereVendas (ADR 0009): só conta e Página. */
  shared: boolean;
};

type Message = { tone: "info" | "success" | "warning" | "danger"; text: string };

const BADGE: Record<StepState, { label: string; tone: "neutral" | "success" | "warning" | "danger" }> = {
  locked: { label: "Depois", tone: "neutral" },
  todo: { label: "A fazer", tone: "warning" },
  waiting: { label: "Aguardando", tone: "warning" },
  done: { label: "Concluído", tone: "success" },
  error: { label: "Precisa de atenção", tone: "danger" },
};

const TITLE: Record<StepKey, string> = {
  ad_account: "1. Conta de anúncios",
  page: "2. Página e Instagram",
  invite: "3. Convite da Meta",
  billing: "4. Forma de pagamento",
};

const INSTAGRAM_MESSAGE = {
  linked: "Instagram conectado.",
  not_found: "Não encontramos o Instagram com esse @ compartilhado com a GereVendas. Compartilhe e tente de novo.",
  taken: "Esse Instagram já está ligado a outra empresa no GereVendas Ads. Fale com o suporte.",
  skipped: "",
} as const;

export function ConnectionSteps({
  connection,
  canManage,
  demo,
  simulated,
  disabledReason,
  businessId,
  defaultInviteEmail,
  shared,
}: Props) {
  const router = useRouter();
  const steps = computeSteps(connection, shared);
  const stateOf = (key: StepKey) => steps.find((s) => s.key === key)?.state ?? "locked";
  const interactive = !demo && canManage && disabledReason === null;
  const anyWaiting = steps.some((s) => s.state === "waiting");
  const allDone = steps.every((s) => s.state === "done");

  const [message, setMessage] = useState<Message | null>(null);
  const [pending, start] = useTransition();
  const [pageUrl, setPageUrl] = useState("");
  const [instagram, setInstagram] = useState("");
  const [email, setEmail] = useState(connection?.client_invite_email ?? defaultInviteEmail);
  const [copied, setCopied] = useState(false);

  // Ao abrir a tela, confere na Meta o que estava aguardando (o servidor limita a 1 checagem a cada 15 s).
  useEffect(() => {
    if (!interactive || !anyWaiting) return;
    let cancelled = false;
    void refreshMetaStatus().then((res) => {
      if (!cancelled && res.ok && res.data.changed) router.refresh();
    });
    return () => {
      cancelled = true;
    };
  }, [interactive, anyWaiting, router]);

  function run<T>(action: () => Promise<ApiResult<T>>, onOk?: (data: T) => Message | null) {
    setMessage(null);
    start(async () => {
      const res = await action();
      if (!res.ok) {
        setMessage({ tone: "danger", text: res.error.message });
        return;
      }
      setMessage(onOk ? onOk(res.data) : null);
      router.refresh();
    });
  }

  async function copyBusinessId() {
    if (!businessId) return;
    await navigator.clipboard.writeText(businessId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const shownBusinessId = businessId ?? "000000000000000";

  return (
    <div className="mt-8 space-y-5">
      {demo && (
        <Alert tone="info" title="Só para conhecer">
          No piloto com conta, estes passos ligam sua empresa à Meta. Aqui você só vê como funciona.
        </Alert>
      )}
      {disabledReason === "kill_switch" && (
        <Alert tone="warning" title="Integração suspensa">
          A conexão com a Meta está pausada pela nossa equipe. Seus dados continuam salvos.
        </Alert>
      )}
      {disabledReason === "config_missing" && (
        <Alert tone="danger" title="Integração indisponível">
          A conexão com a Meta não está configurada. Nossa equipe foi avisada.
        </Alert>
      )}
      {!demo && !canManage && (
        <Alert tone="info">Apenas o proprietário da empresa pode fazer a conexão com a Meta.</Alert>
      )}
      {shared ? (
        <Alert tone="info" title="Verba de mídia">
          Seus anúncios rodam na conta da GereVendas na Meta. A verba de cada campanha é paga à GereVendas, separada da
          assinatura.
        </Alert>
      ) : (
        <Alert tone="info" title="Cobrança de mídia separada">
          Os anúncios são pagos direto à Meta, com o cartão ou Pix que você cadastrar lá. O GereVendas Ads nunca recebe
          dados de pagamento da mídia.
        </Alert>
      )}

      {message && <Alert tone={message.tone}>{message.text}</Alert>}

      {/* Passo 1 */}
      <StepCard title={TITLE.ad_account} state={stateOf("ad_account")} simulated={simulated}>
        {stateOf("ad_account") === "done" && connection && shared && (
          <p>Seus anúncios vão rodar na conta da GereVendas. Cada campanha leva o nome da sua empresa.</p>
        )}
        {stateOf("ad_account") === "done" && connection && !shared && (
          <p>
            Sua conta <strong>{connection.ad_account_name}</strong> ({connection.ad_account_id}) está reservada na BM da
            GereVendas.
          </p>
        )}
        {stateOf("ad_account") === "waiting" && (
          <p>Estamos preparando sua conta de anúncios. Volte em breve; você não precisa fazer nada agora.</p>
        )}
        {stateOf("ad_account") === "todo" && (
          <>
            <p>
              {shared
                ? "Seus anúncios rodam na conta de anúncios da GereVendas. Leva um clique."
                : "Reservamos uma conta de anúncios só sua, dentro da BM da GereVendas. Leva um clique."}
            </p>
            {interactive && (
              <Button
                className="mt-3"
                disabled={pending}
                onClick={() =>
                  run(requestAdAccount, (d) =>
                    d.pool_empty
                      ? { tone: "info", text: "Estamos preparando sua conta. Volte em breve." }
                      : { tone: "success", text: "Conta de anúncios reservada." },
                  )
                }
              >
                {pending ? "Ativando…" : shared ? "Ativar minha conta" : "Reservar minha conta de anúncios"}
              </Button>
            )}
          </>
        )}
      </StepCard>

      {/* Passo 2 */}
      <StepCard title={TITLE.page} state={stateOf("page")} simulated={simulated}>
        {stateOf("page") === "locked" && <p>Disponível depois da conta de anúncios.</p>}
        {stateOf("page") === "done" && connection && (
          <>
            <p>
              Página <strong>{connection.page_name}</strong> conectada.{" "}
              {connection.instagram_status === "done"
                ? "Instagram conectado."
                : "Instagram ainda não conectado: os anúncios saem só no Facebook até você ligar o Instagram."}
            </p>
            {interactive && (
              <div className="mt-3 flex flex-wrap items-end gap-3">
                {connection.instagram_status !== "done" && (
                  <form
                    className="flex flex-wrap items-end gap-3"
                    onSubmit={(e) => {
                      e.preventDefault();
                      run(
                        () => linkMetaInstagram({ instagram_username: instagram }),
                        (d) => ({
                          tone: d.instagram === "linked" ? "success" : "warning",
                          text: INSTAGRAM_MESSAGE[d.instagram],
                        }),
                      );
                    }}
                  >
                    <Field id="instagram_retry" label="@ do Instagram">
                      <Input
                        id="instagram_retry"
                        value={instagram}
                        onChange={(e) => setInstagram(e.target.value)}
                        placeholder="@seunegocio"
                      />
                    </Field>
                    <Button type="submit" variant="secondary" disabled={pending || !instagram.trim()}>
                      Ligar Instagram
                    </Button>
                  </form>
                )}
                <Button type="button" variant="secondary" disabled={pending} onClick={() => run(unlinkMetaPage)}>
                  Trocar Página
                </Button>
              </div>
            )}
          </>
        )}
        {stateOf("page") === "todo" && (
          <>
            <p>Compartilhe sua Página e seu Instagram com a GereVendas na Meta. Você continua dono deles.</p>
            <ol className="mt-3 list-decimal space-y-1.5 pl-5">
              <li>
                Abra as{" "}
                <a
                  href={META_PARTNERS_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium text-brand underline"
                >
                  configurações de parceiros no Business Suite
                </a>
                .
              </li>
              <li>Escolha a opção para dar a um parceiro acesso aos seus ativos.</li>
              <li>
                Cole o ID da GereVendas:{" "}
                <code className="rounded bg-surface-muted px-1.5 py-0.5">{shownBusinessId}</code>{" "}
                {businessId && (
                  <button
                    type="button"
                    onClick={copyBusinessId}
                    className="text-sm font-medium text-brand hover:underline"
                  >
                    {copied ? "Copiado" : "Copiar"}
                  </button>
                )}
              </li>
              <li>Marque sua Página e seu Instagram, com a permissão de anúncios, e salve.</li>
              <li>Volte aqui, cole o link da sua Página e clique em Verificar.</li>
            </ol>
            <p className="mt-2 text-xs text-ink-faint">
              Ainda não tem portfólio empresarial? A Meta pede para criar um quando você abre o Business Suite.
              {simulated &&
                " Em Simulação, qualquer link de Página funciona; um link com “nao-compartilhada” mostra o erro."}
            </p>
            {interactive && (
              <form
                className="mt-4 grid gap-3 sm:grid-cols-[1fr_200px_auto] sm:items-end"
                onSubmit={(e) => {
                  e.preventDefault();
                  run(
                    () => linkMetaPage({ page_url: pageUrl, instagram_username: instagram }),
                    (d) => ({
                      tone: d.instagram === "not_found" || d.instagram === "taken" ? "warning" : "success",
                      text: `Página ${d.page_name} conectada. ${INSTAGRAM_MESSAGE[d.instagram]}`.trim(),
                    }),
                  );
                }}
              >
                <Field id="page_url" label="Link da sua Página">
                  <Input
                    id="page_url"
                    value={pageUrl}
                    onChange={(e) => setPageUrl(e.target.value)}
                    placeholder="facebook.com/seunegocio"
                  />
                </Field>
                <Field id="instagram_username" label="@ do Instagram (opcional)">
                  <Input
                    id="instagram_username"
                    value={instagram}
                    onChange={(e) => setInstagram(e.target.value)}
                    placeholder="@seunegocio"
                  />
                </Field>
                <Button type="submit" disabled={pending || !pageUrl.trim()}>
                  {pending ? "Verificando…" : "Verificar"}
                </Button>
              </form>
            )}
          </>
        )}
      </StepCard>

      {!shared && (
        <>
          {/* Passo 3 */}
          <StepCard title={TITLE.invite} state={stateOf("invite")} simulated={simulated}>
            {stateOf("invite") === "locked" && <p>Disponível depois de conectar a Página.</p>}
            {stateOf("invite") === "done" && <p>Você é administrador da sua conta de anúncios.</p>}
            {stateOf("invite") === "waiting" && (
              <>
                <p>
                  A Meta enviou um convite para <strong>{connection?.client_invite_email}</strong>. Abra o e-mail,
                  aceite o convite da GereVendas e volte aqui.
                </p>
                {interactive && (
                  <Button
                    className="mt-3"
                    variant="secondary"
                    disabled={pending}
                    onClick={() =>
                      run(refreshMetaStatus, (d) =>
                        d.changed
                          ? { tone: "success", text: "Convite aceito." }
                          : { tone: "info", text: "Ainda não aparece como aceito. Tente de novo em 1 minuto." },
                      )
                    }
                  >
                    Verificar agora
                  </Button>
                )}
              </>
            )}
            {(stateOf("invite") === "todo" || stateOf("invite") === "error") && (
              <>
                <p>
                  {stateOf("invite") === "error"
                    ? "O convite expirou. Envie de novo."
                    : "Para você cadastrar o pagamento, a Meta precisa te colocar como administrador da sua conta. Enviamos um convite por e-mail."}
                </p>
                {interactive && (
                  <form
                    className="mt-3 flex flex-wrap items-end gap-3"
                    onSubmit={(e) => {
                      e.preventDefault();
                      run(
                        () => sendMetaInvite({ email }),
                        () => ({ tone: "success", text: "Convite enviado. Confira seu e-mail." }),
                      );
                    }}
                  >
                    <Field id="invite_email" label="Seu e-mail">
                      <Input id="invite_email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                    </Field>
                    <Button type="submit" disabled={pending || !email.trim()}>
                      {pending ? "Enviando…" : "Enviar convite"}
                    </Button>
                  </form>
                )}
              </>
            )}
          </StepCard>

          {/* Passo 4 */}
          <StepCard title={TITLE.billing} state={stateOf("billing")} simulated={simulated}>
            {stateOf("billing") === "locked" && <p>Disponível depois de aceitar o convite.</p>}
            {stateOf("billing") === "done" && <p>A Meta confirmou uma forma de pagamento na sua conta.</p>}
            {stateOf("billing") === "todo" && connection?.ad_account_id && (
              <>
                <p>Cadastre cartão ou Pix na tela oficial da Meta. Depois volte e clique em verificar.</p>
                {interactive && (
                  <div className="mt-3 flex flex-wrap gap-3">
                    <a
                      href={metaBillingUrl(connection.ad_account_id)}
                      target="_blank"
                      rel="noreferrer"
                      className={buttonClasses("primary")}
                    >
                      Cadastrar pagamento na Meta
                    </a>
                    <Button
                      variant="secondary"
                      disabled={pending}
                      onClick={() =>
                        run(refreshMetaStatus, (d) =>
                          d.changed
                            ? { tone: "success", text: "Forma de pagamento confirmada." }
                            : {
                                tone: "info",
                                text: "A Meta ainda não mostra forma de pagamento. Tente de novo em 1 minuto.",
                              },
                        )
                      }
                    >
                      Já cadastrei, verificar
                    </Button>
                  </div>
                )}
              </>
            )}
          </StepCard>
        </>
      )}

      {allDone && (
        <Alert tone="success" title="Tudo pronto">
          Sua empresa está conectada à Meta.
          <div className="mt-3">
            <ButtonLink href="/app/campanhas" size="sm">
              Ir para Campanhas
            </ButtonLink>
          </div>
        </Alert>
      )}
    </div>
  );
}

function StepCard({
  title,
  state,
  simulated,
  children,
}: {
  title: string;
  state: StepState;
  simulated: boolean;
  children: React.ReactNode;
}) {
  return (
    <Card className={state === "locked" ? "p-5 opacity-70 sm:p-6" : "p-5 sm:p-6"}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-lg font-bold">{title}</h2>
        <div className="flex items-center gap-2">
          {simulated && <Badge tone="demo">Simulação</Badge>}
          <Badge tone={BADGE[state].tone}>{BADGE[state].label}</Badge>
        </div>
      </div>
      <div className="mt-2 text-[15px] text-ink-soft">{children}</div>
    </Card>
  );
}
