import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { publicEnv } from "../public-env";

/** Cliente Supabase com a sessão do usuário (anon key + RLS). Nunca usa service role. */
export async function createSupabaseServerClient() {
  if (!publicEnv.supabaseUrl || !publicEnv.supabaseAnonKey) {
    throw new Error("Supabase não configurado");
  }
  const cookieStore = await cookies();
  return createServerClient(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Chamado de um Server Component: o proxy renova a sessão na próxima requisição.
        }
      },
    },
  });
}
