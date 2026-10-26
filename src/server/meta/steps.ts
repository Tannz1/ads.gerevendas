import type { MetaConnectionStatus } from "@/contracts/campaigns";
import type { MetaInviteStatus, MetaStepStatus } from "@/contracts/meta";

/** Linha de `meta_connections` que a trilha de 4 passos precisa. */
export type MetaOnboardingView = {
  status: MetaConnectionStatus;
  simulated: boolean;
  ad_account_id: string | null;
  ad_account_name: string | null;
  ad_account_status: MetaStepStatus;
  pool_requested_at: string | null;
  page_id: string | null;
  page_name: string | null;
  page_access_status: MetaStepStatus;
  instagram_actor_id: string | null;
  instagram_status: MetaStepStatus;
  client_invite_status: MetaInviteStatus;
  client_invite_email: string | null;
  billing_status: "unverified" | "verified";
};

export const META_ONBOARDING_COLUMNS =
  "status, simulated, ad_account_id, ad_account_name, ad_account_status, pool_requested_at, page_id, page_name, page_access_status, instagram_actor_id, instagram_status, client_invite_status, client_invite_email, billing_status";

export type StepKey = "ad_account" | "page" | "invite" | "billing";
export type StepState = "locked" | "todo" | "waiting" | "done" | "error";
export type StepView = { key: StepKey; state: StepState };

/** Um passo por vez: cada um só libera quando o anterior está concluído. */
export function computeSteps(row: MetaOnboardingView | null): StepView[] {
  const adAccount: StepState =
    row?.ad_account_status === "error" && row.ad_account_id
      ? "error"
      : row?.ad_account_status === "done" && row.ad_account_id
        ? "done"
        : row?.pool_requested_at
          ? "waiting"
          : "todo";
  const page: StepState =
    adAccount !== "done" ? "locked" : row?.page_access_status === "done" && row.page_id ? "done" : "todo";
  const invite: StepState =
    page !== "done"
      ? "locked"
      : row?.client_invite_status === "accepted"
        ? "done"
        : row?.client_invite_status === "pending"
          ? "waiting"
          : row?.client_invite_status === "expired"
            ? "error"
            : "todo";
  const billing: StepState = invite !== "done" ? "locked" : row?.billing_status === "verified" ? "done" : "todo";
  return [
    { key: "ad_account", state: adAccount },
    { key: "page", state: page },
    { key: "invite", state: invite },
    { key: "billing", state: billing },
  ];
}

// account_status da Meta: 1 = ativa, 9 = período de carência (ainda veicula). Os demais
// (desativada, pendências de pagamento, revisão de risco, encerramento) impedem anúncios.
const USABLE_AD_ACCOUNT_STATUSES = new Set([1, 9]);

export function isAdAccountUsable(accountStatus: number): boolean {
  return USABLE_AD_ACCOUNT_STATUSES.has(accountStatus);
}
