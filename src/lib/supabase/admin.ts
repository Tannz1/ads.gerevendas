import "server-only";
import { createClient } from "@supabase/supabase-js";
import { serverEnv } from "../env";

/**
 * Cliente com service role: só para gravar o que a Meta confirmou (RPCs `meta_set_*`). Nunca usar
 * para ler dados do usuário nem expor ao navegador.
 */
export function createSupabaseAdminClient() {
  const env = serverEnv();
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Supabase service role não configurado");
  }
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
