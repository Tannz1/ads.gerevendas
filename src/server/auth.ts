"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { serverEnv } from "@/lib/env";
import { log } from "@/lib/logger";
import { isSupabaseConfigured, publicUrl } from "@/lib/public-env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCorrelationId } from "./context";

export type SignInState = { status: "idle" | "sent" | "error"; message?: string; email?: string };

const emailSchema = z.email("Informe um e-mail válido");

/** Envia link mágico de acesso (Supabase Auth, fluxo PKCE). */
export async function signInWithEmail(_prev: SignInState, formData: FormData): Promise<SignInState> {
  if (!isSupabaseConfigured()) return { status: "error", message: "Login indisponível em modo demonstração." };
  const parsed = emailSchema.safeParse(String(formData.get("email") ?? "").trim());
  if (!parsed.success) return { status: "error", message: parsed.error.issues[0]?.message };

  const next = String(formData.get("next") ?? "/app");
  const safeNext = next.startsWith("/app") ? next : "/app";
  const hdrs = await headers();
  const host = hdrs.get("x-forwarded-host") ?? hdrs.get("host");
  const proto = hdrs.get("x-forwarded-proto") ?? "http";
  const base = host ? `${proto}://${host}` : serverEnv().NEXT_PUBLIC_APP_URL;
  const callback = publicUrl("/auth/callback", base);
  callback.searchParams.set("next", safeNext);

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data,
    options: { emailRedirectTo: callback.toString() },
  });
  if (error) {
    log("warn", "auth.otp_failed", { correlation_id: await getCorrelationId(), status: error.status });
    return { status: "error", message: "Não foi possível enviar o link. Tente em instantes.", email: parsed.data };
  }
  return { status: "sent", email: parsed.data };
}

export async function signOut() {
  if (isSupabaseConfigured()) {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut();
  }
  redirect("/");
}
