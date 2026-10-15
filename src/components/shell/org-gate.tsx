import type { ReactNode } from "react";
import { getAppContext } from "@/server/context";
import { CreateOrganizationForm } from "./create-org-form";

/** Sem organização ainda (primeiro acesso), pede o nome da empresa antes de tudo. */
export async function OrgGate({ children }: { children: ReactNode }) {
  const ctx = await getAppContext();
  if (ctx.mode === "supabase" && !ctx.organization) return <CreateOrganizationForm />;
  return <>{children}</>;
}
