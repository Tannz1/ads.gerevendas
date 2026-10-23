import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { serverEnv } from "@/lib/env";
import { buildMetaAuthorizeUrl, createOAuthState } from "@/lib/meta-oauth";
import { publicUrl } from "@/lib/public-env";
import { getAppContext } from "@/server/context";

export const META_OAUTH_STATE_COOKIE = "gv_meta_oauth_state";

export async function GET(request: NextRequest) {
  const { origin } = request.nextUrl;
  const ctx = await getAppContext();
  if (ctx.mode !== "supabase" || !ctx.organization) {
    return NextResponse.redirect(publicUrl("/entrar", origin));
  }
  if (ctx.organization.role !== "owner" && ctx.organization.role !== "admin") {
    return NextResponse.redirect(publicUrl("/app/conexoes?oauth=forbidden", origin));
  }

  const env = serverEnv();
  const jar = await cookies();

  // Se o App da Meta (META_APP_ID + META_APP_SECRET) estiver configurado, redireciona para o OAuth real da Meta
  if (env.META_APP_ID && env.META_APP_SECRET) {
    const state = createOAuthState(ctx.organization.id, env.META_APP_SECRET);
    jar.set(META_OAUTH_STATE_COOKIE, state, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 600,
    });

    const redirectUri = publicUrl("/api/meta/oauth/callback", origin).toString();
    const authorizeUrl = buildMetaAuthorizeUrl({
      appId: env.META_APP_ID,
      redirectUri,
      state,
    });
    return NextResponse.redirect(authorizeUrl);
  }

  // Modo Simulação: redireciona para o callback simulado sinalizando descoberta automática
  return NextResponse.redirect(publicUrl("/app/conexoes?oauth=simulated", origin));
}
