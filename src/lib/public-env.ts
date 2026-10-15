/**
 * Variáveis públicas (vão para o bundle do navegador). Somente URL e anon key do
 * Supabase, que são públicas por desenho; a proteção dos dados é o RLS.
 */
export const publicEnv = {
  /** Subcaminho da aplicação (ex.: "/ads"); vazio quando servida na raiz. */
  basePath: process.env.NEXT_PUBLIC_BASE_PATH ?? "",
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL || undefined,
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || undefined,
};

/**
 * URL pública da aplicação (origem + subcaminho) para montar redirecionamentos absolutos.
 * Atrás de proxy reverso (EasyPanel/Traefik) a origem da requisição pode ser a interna,
 * então a URL configurada tem prioridade.
 */
export function publicUrl(path: string, requestOrigin: string): URL {
  const origin = process.env.NEXT_PUBLIC_APP_URL ? new URL(process.env.NEXT_PUBLIC_APP_URL).origin : requestOrigin;
  return new URL(`${publicEnv.basePath}${path}`, origin);
}

/** Sem Supabase configurado o app roda em modo demonstração (dados só no navegador). */
export function isSupabaseConfigured(): boolean {
  return Boolean(publicEnv.supabaseUrl && publicEnv.supabaseAnonKey);
}

export type AppMode = "supabase" | "demo";
export function appMode(): AppMode {
  return isSupabaseConfigured() ? "supabase" : "demo";
}
