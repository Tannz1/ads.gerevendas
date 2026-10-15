import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type DraftRow = { step: number; data: unknown; completed: boolean; touched: boolean };

/** Lê o rascunho de onboarding da organização (RLS garante o isolamento). */
export async function loadOnboardingDraft(organizationId: string): Promise<DraftRow> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("onboarding_drafts")
    .select("step, data, completed_brief_id")
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (error) throw new Error(`Falha ao carregar rascunho: ${error.code}`);
  const raw = (data?.data ?? {}) as Record<string, unknown>;
  return {
    step: data?.step ?? 1,
    data: raw,
    completed: Boolean(data?.completed_brief_id),
    touched: Object.keys(raw).length > 0,
  };
}
