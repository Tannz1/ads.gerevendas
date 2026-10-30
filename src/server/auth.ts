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

/** URL de retorno do e-mail (link mágico ou nova senha), na mesma origem em que o usuário está. */
async function callbackUrl(next: string): Promise<string> {
  const hdrs = await headers();
  const host = hdrs.get("x-forwarded-host") ?? hdrs.get("host");
  const proto = hdrs.get("x-forwarded-proto") ?? "http";
  const base = host ? `${proto}://${host}` : serverEnv().NEXT_PUBLIC_APP_URL;
  const callback = publicUrl("/auth/callback", base);
  callback.searchParams.set("next", next);
  return callback.toString();
}

/** Envia link mágico de acesso (Supabase Auth, fluxo PKCE). */
export async function signInWithEmail(_prev: SignInState, formData: FormData): Promise<SignInState> {
  if (!isSupabaseConfigured()) return { status: "error", message: "Login indisponível em modo demonstração." };
  const parsed = emailSchema.safeParse(String(formData.get("email") ?? "").trim());
  if (!parsed.success) return { status: "error", message: parsed.error.issues[0]?.message };

  const next = String(formData.get("next") ?? "/app");
  const safeNext = next.startsWith("/app") ? next : "/app";

  // Senha é opcional: contas com senha definida entram direto; sem senha, segue o link mágico.
  const password = String(formData.get("password") ?? "");
  if (password) {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.signInWithPassword({ email: parsed.data, password });
    if (error) {
      log("warn", "auth.password_failed", { correlation_id: await getCorrelationId(), status: error.status });
      return { status: "error", message: "E-mail ou senha incorretos.", email: parsed.data };
    }
    redirect(safeNext);
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data,
    options: { emailRedirectTo: await callbackUrl(safeNext) },
  });
  if (error) {
    log("warn", "auth.otp_failed", { correlation_id: await getCorrelationId(), status: error.status });
    return { status: "error", message: "Não foi possível enviar o link. Tente em instantes.", email: parsed.data };
  }
  return { status: "sent", email: parsed.data };
}

/**
 * Envia o e-mail para criar ou trocar a senha. Responde "enviado" mesmo para e-mail sem conta, para não
 * revelar quem é cliente.
 */
export async function requestPasswordReset(_prev: SignInState, formData: FormData): Promise<SignInState> {
  if (!isSupabaseConfigured()) return { status: "error", message: "Indisponível em modo demonstração." };
  const parsed = emailSchema.safeParse(String(formData.get("email") ?? "").trim());
  if (!parsed.success) return { status: "error", message: parsed.error.issues[0]?.message };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data, {
    redirectTo: await callbackUrl("/app/senha"),
  });
  if (error) {
    log("warn", "auth.reset_failed", { correlation_id: await getCorrelationId(), status: error.status });
    if (error.status === 429) {
      return { status: "error", message: "Muitos pedidos seguidos. Tente em alguns minutos.", email: parsed.data };
    }
  }
  return { status: "sent", email: parsed.data };
}

export type PasswordState = { status: "idle" | "saved" | "error"; message?: string };

const newPasswordSchema = z
  .object({
    password: z.string().min(8, "Use pelo menos 8 caracteres").max(72, "Use no máximo 72 caracteres"),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { message: "As senhas não são iguais", path: ["confirm"] });

/** Define a senha da conta logada (depois do e-mail de nova senha ou a partir de Conta). */
export async function setPassword(_prev: PasswordState, formData: FormData): Promise<PasswordState> {
  if (!isSupabaseConfigured()) return { status: "error", message: "Indisponível em modo demonstração." };
  const parsed = newPasswordSchema.safeParse({
    password: String(formData.get("password") ?? ""),
    confirm: String(formData.get("confirm") ?? ""),
  });
  if (!parsed.success) return { status: "error", message: parsed.error.issues[0]?.message };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    log("warn", "auth.set_password_failed", { correlation_id: await getCorrelationId(), status: error.status });
    return {
      status: "error",
      message:
        error.status === 401 || error.status === 403
          ? "Sua sessão expirou. Peça um novo e-mail de senha."
          : "Não foi possível salvar a senha. Escolha outra e tente de novo.",
    };
  }
  return { status: "saved" };
}

export async function signOut() {
  if (isSupabaseConfigured()) {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut();
  }
  redirect("/");
}
