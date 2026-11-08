import type { Metadata } from "next";
import Link from "next/link";
import { ProductForm } from "@/components/simple/product-form";
import { bigButton, ScreenHeader, SimpleShell } from "@/components/simple/shell";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAppContext } from "@/server/context";
import { loadOnboardingDraft } from "@/server/drafts";

export const metadata: Metadata = { title: "Criar anúncio" };

export default async function NewProductPage() {
  const ctx = await getAppContext();
  if (ctx.mode !== "supabase" || !ctx.organization) {
    return (
      <SimpleShell tabs={false}>
        <ScreenHeader title="Criar meu anúncio" back="/app" />
        <p className="text-ink-soft">Disponível no piloto com conta.</p>
      </SimpleShell>
    );
  }

  // O anúncio usa o nome, a cidade e o WhatsApp do cadastro do negócio.
  const draft = await loadOnboardingDraft(ctx.organization.id);
  let whatsapp: string | null = null;
  if (draft.completed) {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase
      .from("businesses")
      .select("whatsapp_e164")
      .eq("organization_id", ctx.organization.id)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    whatsapp = data?.whatsapp_e164 ?? null;
  }

  if (!draft.completed || !whatsapp) {
    return (
      <SimpleShell tabs={false}>
        <ScreenHeader title="Antes, conte sobre o seu negócio" back="/app" />
        <p className="text-[15px] text-ink-soft">
          {draft.completed
            ? "O anúncio leva as pessoas para o seu WhatsApp. Adicione o número no cadastro do negócio."
            : "Precisamos do nome, da cidade e do WhatsApp do seu negócio para montar o anúncio."}
        </p>
        <Link href="/app/onboarding" className={`${bigButton} mt-8`}>
          {draft.completed ? "Adicionar WhatsApp" : "Fazer o cadastro"}
        </Link>
      </SimpleShell>
    );
  }

  return (
    <SimpleShell tabs={false}>
      <ProductForm />
    </SimpleShell>
  );
}
