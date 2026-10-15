"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { log } from "@/lib/logger";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAppContext, getCorrelationId } from "./context";

export type CreateOrganizationState = { error?: string };

const nameSchema = z.string().trim().min(2, "Mínimo de 2 caracteres").max(120, "Máximo de 120 caracteres");

export async function createOrganization(
  _prev: CreateOrganizationState,
  formData: FormData,
): Promise<CreateOrganizationState> {
  const correlationId = await getCorrelationId();
  const ctx = await getAppContext();
  if (ctx.mode !== "supabase") return { error: "Indisponível em modo demonstração." };
  if (ctx.organization) redirect("/app");

  const parsed = nameSchema.safeParse(formData.get("name"));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("create_organization", {
    p_name: parsed.data,
    p_correlation_id: correlationId,
  });
  if (error) {
    log("error", "organization.create_failed", { correlation_id: correlationId, code: error.code });
    if (error.message.includes("organization_limit_reached")) {
      return { error: "Limite de empresas atingido para este usuário." };
    }
    return { error: "Não foi possível criar agora. Tente novamente." };
  }
  redirect("/app/onboarding");
}
