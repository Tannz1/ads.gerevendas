import "server-only";
import type { BillingEventType, SubscriptionStatus } from "@/contracts/billing";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type SubscriptionView = {
  status: SubscriptionStatus;
  plan_code: string;
  amount_cents: number;
  currency: string;
  provider: string;
  simulated: boolean;
  current_period_start: string;
  current_period_end: string;
};

export type BillingEventView = {
  id: string;
  provider: string;
  event_id: string;
  event_type: BillingEventType;
  amount_cents: number;
  currency: string;
  simulated: boolean;
  created_at: string;
};

export async function loadBillingOverview(organizationId: string, canViewEvents: boolean) {
  const supabase = await createSupabaseServerClient();
  const [subRes, eventsRes] = await Promise.all([
    supabase
      .from("subscriptions")
      .select(
        "status, plan_code, amount_cents, currency, provider, simulated, current_period_start, current_period_end",
      )
      .eq("organization_id", organizationId)
      .maybeSingle(),
    canViewEvents
      ? supabase
          .from("billing_events")
          .select("id, provider, event_id, event_type, amount_cents, currency, simulated, created_at")
          .eq("organization_id", organizationId)
          .order("created_at", { ascending: false })
          .limit(20)
      : Promise.resolve({ data: [] }),
  ]);

  return {
    subscription: (subRes.data as SubscriptionView | null) ?? null,
    events: (eventsRes.data ?? []) as BillingEventView[],
  };
}

export type MediaWalletView = {
  balance_cents: number;
  reserved_cents: number;
  currency: string;
};

export type MediaWalletEntryView = {
  id: string;
  campaign_id: string | null;
  kind: "topup_confirmed" | "campaign_reserved" | "campaign_released";
  amount_cents: number;
  currency: string;
  provider: string;
  external_reference: string;
  simulated: boolean;
  created_at: string;
};

export async function loadMediaWallet(
  organizationId: string,
  includeEntries = false,
): Promise<{ wallet: MediaWalletView; entries: MediaWalletEntryView[] }> {
  const supabase = await createSupabaseServerClient();
  const [walletRes, entriesRes] = await Promise.all([
    supabase
      .from("media_wallets")
      .select("balance_cents, reserved_cents, currency")
      .eq("organization_id", organizationId)
      .maybeSingle(),
    includeEntries
      ? supabase
          .from("media_wallet_entries")
          .select("id, campaign_id, kind, amount_cents, currency, provider, external_reference, simulated, created_at")
          .eq("organization_id", organizationId)
          .order("created_at", { ascending: false })
          .limit(20)
      : Promise.resolve({ data: [] }),
  ]);
  const w = walletRes.data as MediaWalletView | null;
  return {
    wallet: w ?? { balance_cents: 0, reserved_cents: 0, currency: "BRL" },
    entries: (entriesRes.data ?? []) as MediaWalletEntryView[],
  };
}
