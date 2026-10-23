import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { cache } from "react";
import { CORRELATION_HEADER, ensureCorrelationId } from "@/lib/correlation";
import { serverEnv } from "@/lib/env";
import { isSupabaseConfigured, publicUrl } from "@/lib/public-env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type MemberRole = "owner" | "admin" | "member" | "support";

export type AppContext =
  | { mode: "demo" }
  | {
      mode: "supabase";
      user: { id: string; email: string | null };
      organization: { id: string; name: string; role: MemberRole } | null;
    };

/**
 * Camada de acesso a dados: resolve usuário e organização atuais uma vez por requisição.
 * Redireciona para /entrar quando não há sessão.
 */
export const getAppContext = cache(async (): Promise<AppContext> => {
  if (!isSupabaseConfigured()) return { mode: "demo" };

  // A sessão do Supabase usa Date.now(); só pode rodar no momento da requisição (Cache Components).
  await connection();
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  // URL completa: em Route Handlers o redirect() relativo sai sem o basePath (/ads) e cai em 404.
  if (!auth.user) redirect(publicUrl("/entrar", serverEnv().NEXT_PUBLIC_APP_URL).toString());

  const { data: membership, error } = await supabase
    .from("organization_members")
    .select("role, organizations ( id, name )")
    .eq("user_id", auth.user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`Falha ao carregar organização: ${error.code}`);

  const org = membership?.organizations as unknown as { id: string; name: string } | null;
  return {
    mode: "supabase",
    user: { id: auth.user.id, email: auth.user.email ?? null },
    organization: org && membership ? { ...org, role: membership.role as MemberRole } : null,
  };
});

export async function getCorrelationId(): Promise<string> {
  return ensureCorrelationId((await headers()).get(CORRELATION_HEADER));
}
