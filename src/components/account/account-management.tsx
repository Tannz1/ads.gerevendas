"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createInvite,
  deleteOrganizationData,
  exportOrganizationData,
  revokeInvite,
  saveUserConsents,
  uploadBusinessLogo,
} from "@/server/account";
import type { ConsentKind } from "@/contracts/account";
import type { BusinessLogoView, InviteView, MemberView } from "@/server/account-data";
import type { MemberRole } from "@/server/context";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

const ROLE_LABELS: Record<MemberRole, string> = {
  owner: "Proprietário",
  admin: "Administrador",
  member: "Membro",
  support: "Suporte (auditado)",
};

type Props = {
  organizationId: string;
  organizationName: string;
  currentRole: MemberRole;
  members: MemberView[];
  invites: InviteView[];
  consents: ConsentKind[];
  business: BusinessLogoView | null;
};

export function AccountManagement({
  organizationId,
  organizationName,
  currentRole,
  members,
  invites,
  consents,
  business,
}: Props) {
  const router = useRouter();
  const canManageTeam = currentRole === "owner" || currentRole === "admin";
  const isOwner = currentRole === "owner";

  // Convite
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"admin" | "member">("member");
  const [inviteMessage, setInviteMessage] = useState<{ tone: "info" | "error"; text: string } | null>(null);
  const [createdToken, setCreatedToken] = useState<string | null>(null);
  const [isInviting, startInvite] = useTransition();

  // Logo
  const [logoRights, setLogoRights] = useState(false);
  const [logoMessage, setLogoMessage] = useState<{ tone: "info" | "error"; text: string } | null>(null);
  const [isUploadingLogo, startLogoUpload] = useTransition();

  // Consentimentos
  const [termsChecked, setTermsChecked] = useState(consents.includes("terms_of_use"));
  const [privacyChecked, setPrivacyChecked] = useState(consents.includes("privacy_policy"));
  const [aiChecked, setAiChecked] = useState(consents.includes("ai_processing"));
  const [pilotChecked, setPilotChecked] = useState(consents.includes("pilot_participation"));
  const [consentMessage, setConsentMessage] = useState<{ tone: "info" | "error"; text: string } | null>(null);
  const [isSavingConsents, startConsentSave] = useTransition();

  // LGPD Export & Delete
  const [lgpdMessage, setLgpdMessage] = useState<{ tone: "info" | "error"; text: string } | null>(null);
  const [confirmName, setConfirmName] = useState("");
  const [isExporting, startExport] = useTransition();
  const [isDeleting, startDelete] = useTransition();

  function handleCreateInvite(e: React.FormEvent) {
    e.preventDefault();
    setInviteMessage(null);
    setCreatedToken(null);
    startInvite(async () => {
      const res = await createInvite({ email: inviteEmail, role: inviteRole });
      if (!res.ok) {
        setInviteMessage({ tone: "error", text: res.error.message });
        return;
      }
      setInviteEmail("");
      setCreatedToken(res.data.token);
      setInviteMessage({
        tone: "info",
        text: "Convite criado. Compartilhe o link abaixo com a pessoa convidada.",
      });
    });
  }

  function handleRevoke(id: string) {
    setInviteMessage(null);
    startInvite(async () => {
      const res = await revokeInvite(id);
      if (!res.ok) setInviteMessage({ tone: "error", text: res.error.message });
    });
  }

  function handleLogoSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLogoMessage(null);
    const formData = new FormData(e.currentTarget);
    startLogoUpload(async () => {
      const res = await uploadBusinessLogo(formData);
      if (!res.ok) {
        setLogoMessage({ tone: "error", text: res.error.message });
        return;
      }
      setLogoMessage({ tone: "info", text: "Logotipo atualizado com sucesso." });
    });
  }

  function handleSaveConsents(e: React.FormEvent) {
    e.preventDefault();
    setConsentMessage(null);
    startConsentSave(async () => {
      const res = await saveUserConsents({
        terms_of_use: termsChecked,
        privacy_policy: privacyChecked,
        ai_processing: aiChecked,
        pilot_participation: pilotChecked,
      });
      if (!res.ok) {
        setConsentMessage({ tone: "error", text: res.error.message });
        return;
      }
      setConsentMessage({ tone: "info", text: "Preferências e consentimentos registrados." });
    });
  }

  function handleExport() {
    setLgpdMessage(null);
    startExport(async () => {
      const res = await exportOrganizationData();
      if (!res.ok) {
        setLgpdMessage({ tone: "error", text: res.error.message });
        return;
      }
      const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `dados-empresa-${organizationId.slice(0, 8)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setLgpdMessage({ tone: "info", text: "Arquivo JSON exportado com sucesso." });
    });
  }

  function handleDelete(e: React.FormEvent) {
    e.preventDefault();
    setLgpdMessage(null);
    startDelete(async () => {
      const res = await deleteOrganizationData({
        organization_id: organizationId,
        confirmation_name: confirmName,
      });
      if (!res.ok) {
        setLgpdMessage({ tone: "error", text: res.error.message });
        return;
      }
      router.push("/app");
      router.refresh();
    });
  }

  return (
    <div className="mt-8 space-y-8">
      {/* Logotipo da marca */}
      {business && (
        <Card className="p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="font-display text-lg font-semibold">Logotipo da marca</h2>
              <p className="mt-1 text-sm text-ink-soft">
                Usado para identificar a empresa <strong>{business.name}</strong> nas peças.
              </p>
            </div>
            {business.logo_url && (
              // eslint-disable-next-line @next/next/no-img-element -- URL assinada temporária do Storage
              <img
                src={business.logo_url}
                alt={`Logo ${business.name}`}
                className="h-14 w-14 rounded-xl border border-line object-cover"
              />
            )}
          </div>
          <form onSubmit={handleLogoSubmit} className="mt-4 space-y-3">
            <input type="hidden" name="business_id" value={business.id} />
            <input
              type="file"
              name="file"
              accept="image/png,image/jpeg"
              className="block w-full text-sm text-ink-soft file:mr-3 file:rounded-lg file:border-0 file:bg-surface-muted file:px-3 file:py-2 file:text-sm file:font-medium file:text-ink"
            />
            <label className="flex items-start gap-2.5 text-sm text-ink-soft">
              <input
                type="checkbox"
                name="rights"
                checked={logoRights}
                onChange={(e) => setLogoRights(e.target.checked)}
                className="mt-1 h-4 w-4 rounded border-line text-brand"
              />
              <span>Declaro que tenho autorização para usar este logotipo nos anúncios desta empresa.</span>
            </label>
            {logoMessage && <Alert tone={logoMessage.tone === "error" ? "danger" : "info"}>{logoMessage.text}</Alert>}
            <Button type="submit" variant="secondary" disabled={isUploadingLogo}>
              {isUploadingLogo ? "Enviando…" : "Salvar logotipo"}
            </Button>
          </form>
        </Card>
      )}

      {/* Membros e Convites */}
      <Card className="p-5 sm:p-6">
        <h2 className="font-display text-lg font-semibold">Equipe e convites</h2>
        <p className="mt-1 text-sm text-ink-soft">
          Pessoas com acesso à empresa <strong>{organizationName}</strong>.
        </p>

        <ul className="mt-4 divide-y divide-line border-t border-line">
          {members.map((m) => (
            <li key={m.user_id} className="flex items-center justify-between py-3 text-sm">
              <span className="font-mono text-xs text-ink-soft">{m.user_id.slice(0, 8)}…</span>
              <Badge tone={m.role === "owner" ? "brand" : "neutral"}>{ROLE_LABELS[m.role]}</Badge>
            </li>
          ))}
        </ul>

        {canManageTeam && (
          <form onSubmit={handleCreateInvite} className="mt-5 space-y-3 border-t border-line pt-5">
            <h3 className="text-sm font-semibold">Convidar novo membro</h3>
            <div className="grid gap-3 sm:grid-cols-3">
              <input
                type="email"
                required
                placeholder="pessoa@empresa.com.br"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                className="h-10 rounded-lg border border-line bg-surface px-3 text-sm sm:col-span-2"
              />
              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as "admin" | "member")}
                className="h-10 rounded-lg border border-line bg-surface px-3 text-sm"
              >
                <option value="member">Membro (edita peças)</option>
                <option value="admin">Administrador (aprova peças)</option>
              </select>
            </div>
            {inviteMessage && (
              <Alert tone={inviteMessage.tone === "error" ? "danger" : "info"}>{inviteMessage.text}</Alert>
            )}
            {createdToken && (
              <div className="rounded-lg border border-line bg-surface-muted p-3 text-xs">
                <span className="font-medium text-ink">Link do convite: </span>
                <code className="break-all text-brand">{`/convite/${createdToken}`}</code>
              </div>
            )}
            <Button type="submit" variant="secondary" disabled={isInviting}>
              {isInviting ? "Criando convite…" : "Gerar link de convite"}
            </Button>
          </form>
        )}

        {canManageTeam && invites.length > 0 && (
          <div className="mt-5 border-t border-line pt-4">
            <h3 className="text-xs font-semibold tracking-wider text-ink-soft uppercase">Convites enviados</h3>
            <ul className="mt-2 divide-y divide-line">
              {invites.map((inv) => (
                <li key={inv.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                  <div>
                    <span className="font-medium">{inv.email}</span>{" "}
                    <span className="text-xs text-ink-soft">({ROLE_LABELS[inv.role]})</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge
                      tone={inv.status === "accepted" ? "success" : inv.status === "pending" ? "warning" : "neutral"}
                    >
                      {inv.status === "pending" ? "Pendente" : inv.status === "accepted" ? "Aceito" : "Revogado"}
                    </Badge>
                    {inv.status === "pending" && (
                      <button
                        type="button"
                        onClick={() => handleRevoke(inv.id)}
                        className="text-xs font-medium text-danger hover:underline"
                      >
                        Revogar
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>

      {/* Termos e Consentimentos LGPD */}
      <Card className="p-5 sm:p-6">
        <h2 className="font-display text-lg font-semibold">Termos e consentimentos (LGPD)</h2>
        <p className="mt-1 text-sm text-ink-soft">
          Gerencie suas autorizações de uso da plataforma e processamento de dados.
        </p>
        <form onSubmit={handleSaveConsents} className="mt-4 space-y-3">
          <label className="flex items-start gap-2.5 text-sm">
            <input
              type="checkbox"
              checked={termsChecked}
              onChange={(e) => setTermsChecked(e.target.checked)}
              className="mt-1 h-4 w-4 rounded border-line text-brand"
            />
            <span>Aceito os Termos de Uso do GereVendas Ads (obrigatório).</span>
          </label>
          <label className="flex items-start gap-2.5 text-sm">
            <input
              type="checkbox"
              checked={privacyChecked}
              onChange={(e) => setPrivacyChecked(e.target.checked)}
              className="mt-1 h-4 w-4 rounded border-line text-brand"
            />
            <span>Estou ciente da Política de Privacidade e proteção de dados LGPD (obrigatório).</span>
          </label>
          <label className="flex items-start gap-2.5 text-sm">
            <input
              type="checkbox"
              checked={aiChecked}
              onChange={(e) => setAiChecked(e.target.checked)}
              className="mt-1 h-4 w-4 rounded border-line text-brand"
            />
            <span>
              Autorizo o envio das informações confirmadas do negócio para geração de propostas de texto e imagem por IA
              (obrigatório).
            </span>
          </label>
          <label className="flex items-start gap-2.5 text-sm text-ink-soft">
            <input
              type="checkbox"
              checked={pilotChecked}
              onChange={(e) => setPilotChecked(e.target.checked)}
              className="mt-1 h-4 w-4 rounded border-line text-brand"
            />
            <span>
              Opcional: concordo em participar de pesquisas rápidas do piloto e compartilhar métricas agregadas e
              anonimizadas.
            </span>
          </label>
          {consentMessage && (
            <Alert tone={consentMessage.tone === "error" ? "danger" : "info"}>{consentMessage.text}</Alert>
          )}
          <Button type="submit" variant="secondary" disabled={isSavingConsents}>
            {isSavingConsents ? "Salvando…" : "Registrar consentimentos"}
          </Button>
        </form>
      </Card>

      {/* Privacidade, Exportação e Exclusão LGPD */}
      {canManageTeam && (
        <Card className="p-5 sm:p-6">
          <h2 className="font-display text-lg font-semibold">Portabilidade e exclusão de dados (LGPD)</h2>
          <p className="mt-1 text-sm text-ink-soft">
            Exporte todos os dados cadastrados da sua empresa em formato aberto (JSON) ou solicite a exclusão
            definitiva.
          </p>

          <div className="mt-4">
            <Button type="button" variant="secondary" onClick={handleExport} disabled={isExporting}>
              {isExporting ? "Exportando…" : "Baixar dados da empresa (JSON)"}
            </Button>
          </div>

          {isOwner && (
            <form onSubmit={handleDelete} className="mt-6 space-y-3 border-t border-line pt-5">
              <h3 className="text-sm font-semibold text-danger">Zona de exclusão definitiva</h3>
              <p className="text-xs text-ink-soft">
                Esta ação apaga permanentemente a empresa <strong>{organizationName}</strong>, estratégias, criativos e
                histórico. Digite <strong>{organizationName}</strong> abaixo para confirmar.
              </p>
              <input
                type="text"
                placeholder={organizationName}
                value={confirmName}
                onChange={(e) => setConfirmName(e.target.value)}
                className="h-10 w-full max-w-sm rounded-lg border border-line bg-surface px-3 text-sm"
              />
              <div>
                <Button
                  type="submit"
                  variant="secondary"
                  disabled={isDeleting || confirmName.trim() !== organizationName}
                  className="border-danger/30 text-danger hover:bg-danger-soft"
                >
                  {isDeleting ? "Excluindo…" : "Excluir empresa e todos os dados"}
                </Button>
              </div>
            </form>
          )}

          {lgpdMessage && (
            <div className="mt-4">
              <Alert tone={lgpdMessage.tone === "error" ? "danger" : "info"}>{lgpdMessage.text}</Alert>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
