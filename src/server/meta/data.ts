import "server-only";
import type { MetaPoolStatus } from "@/contracts/meta";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { META_ONBOARDING_COLUMNS, type MetaOnboardingView } from "./steps";

export async function loadMetaOnboarding(organizationId: string): Promise<MetaOnboardingView | null> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("meta_connections")
    .select(META_ONBOARDING_COLUMNS)
    .eq("organization_id", organizationId)
    .maybeSingle();
  return (data as MetaOnboardingView | null) ?? null;
}

export type PoolOverview = { available: number; assigned: number; retired: number; waiting: number };
export type PoolAccountView = {
  id: string;
  ad_account_id: string;
  name: string;
  status: MetaPoolStatus;
  organization_id: string | null;
  assigned_at: string | null;
  source: "api" | "imported";
  created_at: string;
};

export async function isPlatformOperator(): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.rpc("am_i_platform_operator");
  return data === true;
}

export async function loadPool(simulated: boolean): Promise<{ overview: PoolOverview; accounts: PoolAccountView[] }> {
  const supabase = await createSupabaseServerClient();
  const [{ data: overview }, { data: accounts }] = await Promise.all([
    supabase.rpc("meta_pool_overview", { p_simulated: simulated }),
    supabase
      .from("meta_ad_account_pool")
      .select("id, ad_account_id, name, status, organization_id, assigned_at, source, created_at")
      .eq("simulated", simulated)
      .order("created_at", { ascending: false })
      .limit(200),
  ]);
  return {
    overview: (overview as PoolOverview | null) ?? { available: 0, assigned: 0, retired: 0, waiting: 0 },
    accounts: (accounts ?? []) as PoolAccountView[],
  };
}
