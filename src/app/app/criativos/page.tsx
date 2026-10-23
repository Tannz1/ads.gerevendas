import type { Metadata } from "next";
import { AdPreview, imageUrl } from "@/components/creatives/ad-preview";
import {
  GenerateButton,
  GenerateImagesButton,
  JOB_ERRORS,
  JobProgress,
} from "@/components/creatives/generation-controls";
import { ResearchSection } from "@/components/creatives/research-section";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { TEMPLATE_LABELS, type AngleKey } from "@/contracts/creatives";
import { serverEnv } from "@/lib/env";
import { formatCents } from "@/lib/money";
import { selectImageProvider } from "@/server/ai/provider";
import { getAppContext } from "@/server/context";
import { loadCreativesOverview, loadCreditSummary, type CreditSummary } from "@/server/creatives-data";

export const metadata: Metadata = { title: "Criativos" };

function Header({ simulated, credits }: { simulated?: boolean; credits?: CreditSummary | null }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <h1 className="font-display text-3xl font-bold tracking-tight">Criativos</h1>
      {simulated && <Badge tone="demo">Simulação</Badge>}
      {credits && <CreditMeter credits={credits} />}
    </div>
  );
}

/** Gerações do mês. Simulações não contam. */
function CreditMeter({ credits }: { credits: CreditSummary }) {
  const item = (label: string, c: { used: number; limit: number }) => (
    <li className="flex items-center gap-1.5">
      <span className={c.used >= c.limit ? "font-semibold text-danger" : "font-semibold text-ink"}>
        {c.used} de {c.limit}
      </span>
      {label}
    </li>
  );
  return (
    <ul aria-label="Gerações com IA este mês" className="flex flex-wrap gap-x-4 text-sm text-ink-soft sm:ml-auto">
      {item("estratégias", credits.strategy)}
      {item("imagens com IA", credits.image)}
    </ul>
  );
}

export default async function CreativesPage() {
  const ctx = await getAppContext();
  if (ctx.mode === "demo") {
    return (
      <div className="mx-auto max-w-3xl">
        <Header />
        <Card className="mt-8 p-6 sm:p-8">
          <h2 className="font-display text-xl font-bold">Faça login para criar anúncios</h2>
          <p className="mt-2 text-ink-soft">A estratégia e as peças são geradas a partir do cadastro do seu negócio.</p>
        </Card>
      </div>
    );
  }
  if (!ctx.organization) return null;

  const [data, credits] = await Promise.all([
    loadCreativesOverview(ctx.organization.id),
    loadCreditSummary(ctx.organization.id),
  ]);
  if (data.state === "no_brief") {
    return (
      <div className="mx-auto max-w-3xl">
        <Header />
        <Card className="mt-8 p-6 sm:p-8">
          <h2 className="font-display text-xl font-bold">Primeiro, o cadastro do negócio</h2>
          <p className="mt-2 text-ink-soft">
            As peças usam só o que você informou e confirmou: oferta, preço, público e identidade.
          </p>
          <ButtonLink href="/app/onboarding" className="mt-5">
            Ir para o cadastro
          </ButtonLink>
        </Card>
      </div>
    );
  }

  const running = data.job?.status === "running" || data.job?.status === "queued";
  const failed = data.job?.status === "failed" ? data.job : null;
  const jobError = failed && (
    <Alert tone="danger" title="A última geração não deu certo" className="max-w-2xl">
      {JOB_ERRORS[failed.error_code ?? ""] ?? JOB_ERRORS.internal} Tente de novo.
    </Alert>
  );

  if (!data.strategy) {
    return (
      <div className="mx-auto max-w-3xl">
        <Header credits={credits} />
        <Card className="mt-8 flex flex-col gap-5 p-6 sm:p-8">
          <div>
            <h2 className="font-display text-xl font-bold">Sua estratégia e 5 anúncios</h2>
            <p className="mt-2 text-ink-soft">
              Pesquisamos sua região e seus concorrentes na web e criamos cinco abordagens de venda, cada uma com uma
              peça pronta. As peças usam só o que você confirmou no cadastro; você revisa e aprova antes de qualquer
              uso.
            </p>
          </div>
          {jobError}
          {running && data.job ? (
            <JobProgress jobId={data.job.id} />
          ) : (
            <GenerateButton briefId={data.brief_id} label={failed ? "Tentar de novo" : "Gerar estratégia e anúncios"} />
          )}
        </Card>
      </div>
    );
  }

  const { plan } = data.strategy;
  const generatingImage = new Set(data.image_jobs.map((j) => j.creative_id));
  const missingImages = data.creatives.filter((c) => !c.image_url && !generatingImage.has(c.id)).length;
  const aiImages = Boolean(selectImageProvider(serverEnv()));
  return (
    <div className="mx-auto max-w-6xl">
      <Header simulated={false} credits={credits} />

      <Card className="mt-8 p-6 sm:p-7">
        <h2 className="font-display text-xl font-bold">Sua estratégia</h2>
        <p className="mt-2 text-[15px] text-ink-soft">{plan.business_summary}</p>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="font-semibold">Onde anunciar</dt>
            <dd className="text-ink-soft">{plan.targeting_proposal.locations.join(" · ")}</dd>
          </div>
          <div>
            <dt className="font-semibold">Idade</dt>
            <dd className="text-ink-soft">{plan.targeting_proposal.age_range}</dd>
          </div>
        </dl>
        {plan.research && <ResearchSection research={plan.research} />}
        {plan.fields_requiring_confirmation.length > 0 && (
          <div className="mt-5">
            <p className="text-sm font-semibold">Precisa confirmar</p>
            <ul className="mt-2 flex flex-wrap gap-2">
              {plan.fields_requiring_confirmation.map((f) => (
                <li key={f}>
                  <Badge tone="warning">{f}</Badge>
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="mt-6 flex flex-col gap-3 border-t border-line pt-5">
          {jobError}
          {running && data.job ? (
            <JobProgress jobId={data.job.id} />
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <GenerateButton briefId={data.brief_id} label="Gerar nova versão" />
              <span className="text-sm text-ink-faint">A versão atual continua salva.</span>
            </div>
          )}
        </div>
      </Card>

      <h2 className="mt-10 font-display text-xl font-bold">Peças de Anúncio</h2>
      {data.image_jobs.length > 0 ? (
        <div className="mt-3">
          <JobProgress
            jobId={data.image_jobs[0].id}
            label={`Gerando a imagem de ${data.image_jobs.length === 1 ? "1 peça" : `${data.image_jobs.length} peças`}. Leva cerca de um minuto.`}
          />
        </div>
      ) : (
        aiImages &&
        missingImages > 0 &&
        !running && (
          <div className="mt-3">
            <GenerateImagesButton strategyId={data.strategy.id} missing={missingImages} />
          </div>
        )
      )}
      <ul className="mt-4 grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
        {data.creatives.map((c) => {
          const angle = plan.angles.find((a) => a.key === c.angle_key);
          return (
            <li key={c.id}>
              <Card className="flex h-full flex-col justify-between overflow-hidden p-5 transition-all duration-200 hover:shadow-[var(--shadow-lift)]">
                <div className="flex flex-col gap-3.5">
                  <div className="flex items-center justify-between gap-2 border-b border-line pb-3">
                    <p className="font-display text-sm font-bold tracking-tight text-ink">
                      {TEMPLATE_LABELS[c.angle_key as AngleKey]}
                    </p>
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      {generatingImage.has(c.id) && <Badge tone="brand">Gerando imagem</Badge>}
                      {c.status === "approved" ? <Badge tone="success">Aprovada</Badge> : <Badge>Rascunho</Badge>}
                    </div>
                  </div>
                  <div className="flex justify-center py-1">
                    <AdPreview
                      width={300}
                      label={`Prévia: ${c.content.headline}`}
                      content={c.content}
                      format="feed"
                      businessName={c.business_name}
                      priceLabel={c.price_cents === null ? null : formatCents(c.price_cents, c.currency)}
                      imageSrc={c.image_url}
                    />
                  </div>
                  {angle && (
                    <div className="rounded-xl bg-surface-muted/60 p-3 text-xs leading-relaxed text-ink-soft">
                      <span className="font-semibold text-ink">Ângulo: </span>
                      {angle.rationale}
                    </div>
                  )}
                </div>
                <div className="mt-4 flex items-center justify-between border-t border-line pt-3.5 text-sm font-medium">
                  <ButtonLink href={`/app/criativos/${c.id}`} size="sm" variant="secondary">
                    Editar peça
                  </ButtonLink>
                  <div className="flex items-center gap-3 text-xs font-semibold">
                    <a
                      href={imageUrl(c.id, "feed")}
                      className="rounded-lg px-2 py-1 text-brand hover:bg-brand-soft"
                      download
                    >
                      Feed
                    </a>
                    <a
                      href={imageUrl(c.id, "stories")}
                      className="rounded-lg px-2 py-1 text-brand hover:bg-brand-soft"
                      download
                    >
                      Stories
                    </a>
                  </div>
                </div>
              </Card>
            </li>
          );
        })}
      </ul>
      <div className="mt-8 flex items-center justify-between">
        <ButtonLink href="/app/campanhas/nova" size="lg" className="w-full sm:w-auto">
          Próximo passo: Preparar Campanha →
        </ButtonLink>
      </div>
    </div>
  );
}
