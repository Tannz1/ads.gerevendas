import { NextResponse, type NextRequest } from "next/server";
import { log } from "@/lib/logger";
import { publicUrl } from "@/lib/public-env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as "magiclink" | "email" | null;
  const flowId = searchParams.get("sb_flow_id");
  const next = searchParams.get("next") ?? "/app";
  const safeNext = next.startsWith("/app") ? next : "/app";

  if (code) {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code, flowId ? { flowId } : undefined);
    if (!error) return NextResponse.redirect(publicUrl(safeNext, origin));
    log("warn", "auth.callback_failed", { status: error.status });
  } else if (tokenHash && type) {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (!error) return NextResponse.redirect(publicUrl(safeNext, origin));
    log("warn", "auth.callback_otp_failed", { status: error.status });
  }
  return NextResponse.redirect(publicUrl("/entrar?erro=link", origin));
}
