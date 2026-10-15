import { NextResponse, type NextRequest } from "next/server";
import { CORRELATION_HEADER, ensureCorrelationId } from "@/lib/correlation";
import { isSupabaseConfigured, publicUrl } from "@/lib/public-env";
import { refreshSession } from "@/lib/supabase/proxy-session";

export async function proxy(request: NextRequest) {
  const correlationId = ensureCorrelationId(request.headers.get(CORRELATION_HEADER));
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(CORRELATION_HEADER, correlationId);

  // Modo demonstração: sem autenticação, dados só no navegador.
  if (!isSupabaseConfigured()) {
    const response = NextResponse.next({ request: { headers: requestHeaders } });
    response.headers.set(CORRELATION_HEADER, correlationId);
    return response;
  }

  const { response, userId } = await refreshSession(request, requestHeaders);

  if (!userId && request.nextUrl.pathname.startsWith("/app")) {
    // nextUrl.pathname vem sem o basePath; publicUrl o adiciona de volta.
    const url = publicUrl("/entrar", request.nextUrl.origin);
    url.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }

  response.headers.set(CORRELATION_HEADER, correlationId);
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
