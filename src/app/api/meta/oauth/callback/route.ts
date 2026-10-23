import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { serverEnv } from "@/lib/env";
import { log } from "@/lib/logger";
import { exchangeCodeAndDiscoverMetaAssets, verifyOAuthState } from "@/lib/meta-oauth";
import { publicUrl } from "@/lib/public-env";
import { getAppContext, getCorrelationId } from "@/server/context";
import { META_DISCOVERED_COOKIE, saveDiscovery } from "@/server/meta-discovery";
import { META_OAUTH_STATE_COOKIE } from "../start/route";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const correlationId = await getCorrelationId();
  const ctx = await getAppContext();
  if (ctx.mode !== "supabase" || !ctx.organization) {
    return NextResponse.redirect(publicUrl("/entrar", origin));
  }

  const errorParam = searchParams.get("error");
  if (errorParam) {
    log("warn", "meta.oauth_denied", { correlation_id: correlationId, error: errorParam });
    return NextResponse.redirect(publicUrl("/app/conexoes?oauth=cancelled", origin));
  }

  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const env = serverEnv();
  const jar = await cookies();
  const storedState = jar.get(META_OAUTH_STATE_COOKIE)?.value;
  jar.delete(META_OAUTH_STATE_COOKIE);

  if (
    !code ||
    !state ||
    !storedState ||
    state !== storedState ||
    !env.META_APP_ID ||
    !env.META_APP_SECRET ||
    !verifyOAuthState(state, ctx.organization.id, env.META_APP_SECRET)
  ) {
    log("warn", "meta.oauth_invalid_state", { correlation_id: correlationId });
    return NextResponse.redirect(publicUrl("/app/conexoes?oauth=invalid_state", origin));
  }

  try {
    const redirectUri = publicUrl("/api/meta/oauth/callback", origin).toString();
    const discovered = await exchangeCodeAndDiscoverMetaAssets({
      code,
      appId: env.META_APP_ID,
      appSecret: env.META_APP_SECRET,
      redirectUri,
    });

    jar.set(META_DISCOVERED_COOKIE, saveDiscovery(ctx.organization.id, discovered), {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 600,
    });

    log("info", "meta.oauth_discovered", {
      correlation_id: correlationId,
      organization_id: ctx.organization.id,
      ad_accounts_count: discovered.ad_accounts.length,
      pages_count: discovered.pages.length,
    });

    return NextResponse.redirect(publicUrl("/app/conexoes?oauth=ready", origin));
  } catch (err) {
    log("error", "meta.oauth_exchange_error", {
      correlation_id: correlationId,
      reason: err instanceof Error ? err.message : "unknown",
    });
    return NextResponse.redirect(publicUrl("/app/conexoes?oauth=error", origin));
  }
}
