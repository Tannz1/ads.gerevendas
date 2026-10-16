import type { Metadata } from "next";
import { DemoStrategyPage } from "@/components/strategy/demo-strategy";
import { EmptyState, ErrorNotice, PageHeader } from "@/components/strategy/page-states";
import { StrategyScreen } from "@/components/strategy/strategy-screen";
import { log } from "@/lib/logger";
import { getAppContext, getCorrelationId } from "@/server/context";
import { aiAvailability, loadStrategyPageData, type StrategyPageData } from "@/server/strategy-page";

export const metadata: Metadata = { title: "Estratégia" };

export default async function StrategyPage() {
  const ctx = await getAppContext();
  if (ctx.mode === "demo") return <DemoStrategyPage />;
  if (!ctx.organization) return null;

  let data: StrategyPageData;
  let availability: ReturnType<typeof aiAvailability>;
  try {
    data = await loadStrategyPageData(ctx.organization.id);
    availability = aiAvailability();
  } catch (error) {
    const correlationId = await getCorrelationId();
    log("error", "strategy.page_failed", {
      correlation_id: correlationId,
      organization_id: ctx.organization.id,
      error_name: error instanceof Error ? error.name : "unknown",
    });
    return (
      <div className="mx-auto max-w-6xl">
        <PageHeader title="Estratégia" />
        <ErrorNotice
          className="mt-8"
          title="Não foi possível carregar a estratégia"
          message="Tente recarregar a página em instantes."
          correlationId={correlationId}
        />
      </div>
    );
  }

  if (!data.brief) {
    return (
      <div className="mx-auto max-w-6xl">
        <PageHeader title="Estratégia" />
        <EmptyState
          className="mt-8"
          title="Primeiro, conte sobre o seu negócio"
          action={{ href: "/app/onboarding", label: "Ir para o cadastro" }}
        >
          A estratégia é montada só com as informações que você confirmar no cadastro. Conclua as seis etapas para gerar
          a sua.
        </EmptyState>
      </div>
    );
  }

  const { facts } = data;
  return (
    <StrategyScreen
      key={data.strategy?.id ?? "sem-estrategia"}
      facts={{
        business_name: facts.business_name,
        brand_color: facts.brand_primary_color,
        price_cents: facts.price_cents,
        currency: facts.currency,
      }}
      strategy={data.strategy}
      activeJob={data.activeJob}
      availability={availability}
    />
  );
}
