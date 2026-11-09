import { DemoHome } from "@/components/home/demo-home";
import { HomeStatus } from "@/components/home/home-status";
import { SimpleHome } from "@/components/simple/home";
import { SimpleShell } from "@/components/simple/shell";
import { getAppContext } from "@/server/context";
import { loadOnboardingDraft } from "@/server/drafts";
import { loadProducts, type ProductSummary } from "@/server/products-data";

export default async function AppHome() {
  const ctx = await getAppContext();
  if (ctx.mode === "demo") return <DemoHome />;
  if (!ctx.organization) return null;

  const draft = await loadOnboardingDraft(ctx.organization.id);
  if (!draft.completed) {
    const state = draft.touched ? "in_progress" : "not_started";
    return <HomeStatus status={{ state, step: draft.step }} demo={false} />;
  }

  // Cadastro concluído: o início é o fluxo simples (ADR 0010).
  let products: ProductSummary[] = [];
  let failed = false;
  try {
    products = await loadProducts(ctx.organization.id);
  } catch {
    failed = true;
  }
  return (
    <SimpleShell layout="page">
      <SimpleHome businessName={ctx.organization.name} products={products} failed={failed} />
    </SimpleShell>
  );
}
