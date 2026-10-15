import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { publicEnv } from "../public-env";

/**
 * Renova a sessão Supabase a cada requisição e devolve o id do usuário (validado
 * pela assinatura do JWT via getClaims). Os cookies atualizados seguem na resposta.
 */
export async function refreshSession(request: NextRequest, requestHeaders: Headers) {
  let response = NextResponse.next({ request: { headers: requestHeaders } });

  const supabase = createServerClient(publicEnv.supabaseUrl!, publicEnv.supabaseAnonKey!, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        requestHeaders.set("cookie", request.cookies.toString());
        response = NextResponse.next({ request: { headers: requestHeaders } });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
        for (const [key, value] of Object.entries(headers)) response.headers.set(key, value);
      },
    },
  });

  const { data } = await supabase.auth.getClaims();
  const userId = typeof data?.claims?.sub === "string" ? data.claims.sub : null;
  return { response, userId };
}
