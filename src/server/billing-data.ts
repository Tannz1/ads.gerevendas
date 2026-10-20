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
