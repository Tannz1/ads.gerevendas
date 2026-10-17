"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { log } from "@/lib/logger";
import { isSupabaseConfigured } from "@/lib/public-env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCorrelationId } from "./context";

export type CreateOrganizationState = { error?: string };

const nameSchema = z.string().trim().min(2, "Mínimo de 2 caracteres").max(120, "Máximo de 120 caracteres");

export async function createOrganization(
  _prev: CreateOrganizationState,
  formData: FormData,
): Promise<CreateOrganizationState> {
  const correlationId = await getCorrelationId();
  // Sem ler o contexto aqui: o Next memoriza fetch GET por requisição e a página do redirect
  // receberia a leitura de antes da criação ("sem empresa"). A RPC exige sessão e limita a 5.
  if (!isSupabaseConfigured()) return { error: "Indisponível em modo demonstração." };

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
  // UserMenu e OrgGate vivem no layout de /app, que o roteador preserva entre navegações:
  // sem invalidar o layout, a tela continuaria em "Sem empresa" após o redirect.
  revalidatePath("/app", "layout");
  redirect("/app/onboarding");
}
