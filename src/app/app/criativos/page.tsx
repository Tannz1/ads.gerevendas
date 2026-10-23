import type { Metadata } from "next";
import Link from "next/link";
import { AdPreview, imageUrl } from "@/components/creatives/ad-preview";
import {
  GenerateButton,
  GenerateImagesButton,
  JOB_ERRORS,
  JobProgress,
} from "@/components/creatives/generation-controls";
import { PilotFeedbackBox } from "@/components/creatives/pilot-feedback-box";
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
          <h2 className="font-display text-xl font-bold">Disponível no piloto com conta</h2>
          <p className="mt-2 text-ink-soft">
            A estratégia e as peças são geradas a partir do cadastro salvo na sua conta. No modo demonstração nada é
            gravado, então esta etapa não está disponível.
          </p>
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
              Criamos cinco abordagens de venda, cada uma com uma peça pronta para editar. Usamos apenas o que você
              confirmou no cadastro; você revisa e aprova antes de qualquer uso.
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

  const { plan, simulated } = data.strategy;
  const generatingImage = new Set(data.image_jobs.map((j) => j.creative_id));
  const missingImages = data.creatives.filter((c) => !c.image_url && !generatingImage.has(c.id)).length;
  const aiImages = Boolean(selectImageProvider(serverEnv()));
  return (
    <div className="mx-auto max-w-6xl">
      <Header simulated={simulated} credits={credits} />
      {simulated && (
        <p className="mt-2 text-sm text-ink-faint">
          Textos montados a partir do seu cadastro, sem IA. Com a IA ativada, as sugestões ficam mais variadas.
        </p>
      )}

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

      <h2 className="mt-10 font-display text-xl font-bold">Peças</h2>
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
              <Card className="flex h-full flex-col gap-4 p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold">{TEMPLATE_LABELS[c.angle_key as AngleKey]}</p>
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    {generatingImage.has(c.id) && <Badge tone="brand">Gerando imagem</Badge>}
                    {c.status === "approved" ? <Badge tone="success">Aprovada</Badge> : <Badge>Rascunho</Badge>}
                  </div>
                </div>
                <AdPreview
                  width={300}
                  label={`Prévia: ${c.content.headline}`}
                  content={c.content}
                  format="feed"
                  businessName={c.business_name}
                  priceLabel={c.price_cents === null ? null : formatCents(c.price_cents, c.currency)}
                  imageSrc={c.image_url}
                />
                {angle && <p className="text-sm text-ink-soft">{angle.rationale}</p>}
                <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-2 text-sm font-medium">
                  <ButtonLink href={`/app/criativos/${c.id}`} size="sm" variant="secondary">
                    Editar
                  </ButtonLink>
                  <a href={imageUrl(c.id, "feed")} className="text-brand hover:underline" download>
                    Baixar feed
                  </a>
                  <a href={imageUrl(c.id, "stories")} className="text-brand hover:underline" download>
                    Baixar stories
                  </a>
                </div>
              </Card>
            </li>
          );
        })}
      </ul>
      <div className="mt-8">
        <PilotFeedbackBox stage="strategy" />
      </div>
      <p className="mt-6 text-sm text-ink-faint">
        Nenhuma peça é publicada automaticamente. Depois de aprovar as peças, você pode preparar a campanha em{" "}
        <Link href="/app/campanhas" className="font-medium text-brand hover:underline">
          Campanhas
        </Link>{" "}
        ou{" "}
        <Link href="/app/conta" className="font-medium text-brand hover:underline">
          ver status da conta
        </Link>
        .
      </p>
    </div>
  );
}
