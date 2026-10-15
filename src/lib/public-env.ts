/**
 * Variáveis públicas (vão para o bundle do navegador). Somente URL e anon key do
 * Supabase, que são públicas por desenho; a proteção dos dados é o RLS.
 */
export const publicEnv = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL || undefined,
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || undefined,
};

/** Sem Supabase configurado o app roda em modo demonstração (dados só no navegador). */
export function isSupabaseConfigured(): boolean {
  return Boolean(publicEnv.supabaseUrl && publicEnv.supabaseAnonKey);
}

export type AppMode = "supabase" | "demo";
export function appMode(): AppMode {
  return isSupabaseConfigured() ? "supabase" : "demo";
}
