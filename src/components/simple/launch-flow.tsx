"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLayoutEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { AdPreview } from "@/components/creatives/ad-preview";
import { TEMPLATE_LABELS, type AngleKey } from "@/contracts/creatives";
import { DAILY_BUDGET_CHOICES_CENTS, DURATION_CHOICES_DAYS, REACH_OPTIONS, type ReachKey } from "@/contracts/products";
import { cn } from "@/lib/cn";
import { formatCents } from "@/lib/money";
import { formatBrazilWhatsapp } from "@/lib/phone";
import { publishPausedCampaign } from "@/server/campaigns";
import type { CreativeView } from "@/server/creatives-data";
import { linkMetaPage, updateBusinessContacts } from "@/server/meta/actions";
import { approveProductCreatives, setProductReach } from "@/server/products";
import { ProductThumb, WhatsAppIcon } from "./product-card";
import { bigButton, CheckBadge, choiceClasses, outlineButton, ScreenHeader, SimulationTag } from "./shell";

export type LaunchStep = "previa" | "regiao" | "investimento" | "publicar";

type Props = {
  initialStep: LaunchStep;
  briefId: string;
  strategyId: string;
  creatives: CreativeView[];
  product: {
    name: string;
    price_cents: number | null;
    currency: string;
    highlights: string[];
    photo_url: string | null;
  };
  business: { name: string; city: string; state: string; whatsapp_e164: string | null };
  initialReach: ReachKey;
  canApprove: boolean;
  isOwner: boolean;
  meta: { connected: boolean; shared_account: boolean };
  /** Publicação em Simulação: nada vai para a Meta. */
  simulated: boolean;
};

const STEP_NUMBER: Record<LaunchStep, string> = {
  previa: "3 de 6",
  regiao: "4 de 6",
  investimento: "5 de 6",
  publicar: "6 de 6",
};

/** Telas 4 a 7. A campanha nasce PAUSADA; a ativação é outra confirmação (AGENTS.md). */
export function LaunchFlow(props: Props) {
  const router = useRouter();
  const [step, setStepState] = useState<LaunchStep>(props.initialStep);
  const [reach, setReach] = useState<ReachKey>(props.initialReach);
  const [daily, setDaily] = useState<number>(DAILY_BUDGET_CHOICES_CENTS[1]);
  const [days, setDays] = useState<number>(7);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function setStep(s: LaunchStep) {
    setError(null);
    setStepState(s);
    // Só a URL muda (para recarregar na mesma etapa); os dados já estão na tela.
    window.history.replaceState(null, "", `?etapa=${s}`);
    window.scrollTo({ top: 0 });
  }

  const allApproved = props.creatives.every((c) => c.status === "approved");

  if (step === "previa") {
    return (
      <Preview
        {...props}
        pending={pending}
        error={error}
        onApprove={() => {
          if (allApproved) return setStep("regiao");
          start(async () => {
            const res = await approveProductCreatives(props.strategyId).catch(() => null);
            if (!res) return setError("Não foi possível confirmar. Recarregue a página e tente de novo.");
            if (!res.ok) return setError(res.error.message);
            setStep("regiao");
          });
        }}
      />
    );
  }

  if (step === "regiao") {
    return (
      <div>
        <ScreenHeader title="Onde estão seus clientes?" back={() => setStep("previa")} step={STEP_NUMBER.regiao} />
        <div className="flex h-13 items-center gap-3 rounded-2xl border border-line-strong px-4">
          <PinIcon />
          <span className="text-[16px] font-semibold">
            {props.business.city}, {props.business.state}
          </span>
        </div>
        <p className="mt-1.5 text-sm text-ink-faint">A cidade do cadastro do seu negócio.</p>
        <ReachMap reach={reach} />
        <div className="mt-4 grid grid-cols-2 gap-3" role="radiogroup" aria-label="Alcance">
          {(Object.keys(REACH_OPTIONS) as ReachKey[]).map((k) => (
            <label key={k} className={choiceClasses(reach === k, "flex cursor-pointer flex-col px-4 py-3")}>
              <input type="radio" name="reach" className="sr-only" checked={reach === k} onChange={() => setReach(k)} />
              <span className="text-[15px] font-bold">{REACH_OPTIONS[k].label}</span>
              <span className="text-xs text-ink-soft">{REACH_OPTIONS[k].hint}</span>
            </label>
          ))}
        </div>
        <ErrorBox error={error} />
        <button
          type="button"
          className={`${bigButton} mt-8`}
          disabled={pending}
          onClick={() =>
            start(async () => {
              const res = await setProductReach({ brief_id: props.briefId, reach }).catch(() => null);
              if (!res) return setError("Não foi possível salvar. Tente de novo.");
              if (!res.ok) return setError(res.error.message);
              setStep("investimento");
            })
          }
        >
          {pending ? "Salvando…" : "Continuar"}
        </button>
      </div>
    );
  }

  const total = daily * days;

  if (step === "investimento") {
    return (
      <div>
        <ScreenHeader title="Quanto quer investir?" back={() => setStep("regiao")} step={STEP_NUMBER.investimento} />
        <div className="grid grid-cols-3 gap-3" role="radiogroup" aria-label="Valor por dia">
          {DAILY_BUDGET_CHOICES_CENTS.map((c) => (
            <label
              key={c}
              className={choiceClasses(daily === c, "flex cursor-pointer flex-col items-center gap-1 px-2 py-4")}
            >
              <input type="radio" name="daily" className="sr-only" checked={daily === c} onChange={() => setDaily(c)} />
              {daily === c && <CheckBadge />}
              <CoinsIcon />
              <span className="font-display text-xl font-bold">{formatCents(c).replace(",00", "")}</span>
              <span className={cn("text-sm", daily === c ? "text-brand-strong" : "text-ink-soft")}>por dia</span>
            </label>
          ))}
        </div>

        <div className="mt-6 flex flex-col gap-1.5">
          <label htmlFor="days" className="text-sm font-semibold">
            Por quanto tempo?
          </label>
          <select
            id="days"
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="h-13 rounded-2xl border border-line-strong bg-white px-4 text-[16px] font-semibold focus:border-brand focus:ring-4 focus:ring-brand/15 focus:outline-none"
          >
            {DURATION_CHOICES_DAYS.map((d) => (
              <option key={d} value={d}>
                {d} dias
              </option>
            ))}
          </select>
        </div>

        <div className="mt-6 rounded-2xl bg-brand-soft px-5 py-5 text-center">
          <p className="text-sm font-semibold text-ink-soft">Total em anúncios</p>
          <p className="mt-1 font-display text-4xl font-bold">{formatCents(total, props.product.currency)}</p>
          <p className="mt-1 text-sm text-ink-soft">
            {formatCents(daily)} por dia × {days} dias. Nada é gasto antes da ativação.
          </p>
        </div>

        <button type="button" className={`${bigButton} mt-8`} onClick={() => setStep("publicar")}>
          Revisar e anunciar
        </button>
      </div>
    );
  }

  return (
    <Publish
      {...props}
      reach={reach}
      daily={daily}
      days={days}
      onBack={() => setStep("investimento")}
      onPublished={() => router.push(`/app/anuncios/${props.briefId}/resultados`)}
    />
  );
}

/* ------------------------------------------------------------------ Tela 4 */

function Preview({
  creatives,
  briefId,
  product,
  business,
  canApprove,
  pending,
  error,
  onApprove,
}: Props & { pending: boolean; error: string | null; onApprove: () => void }) {
  const [i, setI] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const width = useWidth(box);
  const c = creatives[i];
  const simulated = creatives.some((x) => x.simulated);
  const priceLabel = product.price_cents === null ? null : formatCents(product.price_cents, product.currency);

  return (
    <div>
      <ScreenHeader
        title="Olha como ficou!"
        back="/app/anuncios"
        step={STEP_NUMBER.previa}
        aside={simulated ? <SimulationTag /> : undefined}
      />
      <div ref={box}>
        {width > 0 && (
          <AdPreview
            width={width}
            label={`Versão ${i + 1}: ${c.content.headline}`}
            format="feed"
            content={c.content}
            businessName={business.name}
            priceLabel={priceLabel}
            imageSrc={c.image_url}
          />
        )}
      </div>

      <div className="mt-3 flex items-center justify-between gap-3">
        <button
          type="button"
          aria-label="Versão anterior"
          disabled={i === 0}
          onClick={() => setI(i - 1)}
          className="grid size-10 place-items-center rounded-full border border-line disabled:opacity-30"
        >
          <Chevron dir="left" />
        </button>
        <div className="text-center">
          <p className="text-sm font-semibold">
            Versão {i + 1} de {creatives.length}
          </p>
          <p className="text-xs text-ink-faint">{TEMPLATE_LABELS[c.angle_key as AngleKey] ?? c.angle_key}</p>
        </div>
        <button
          type="button"
          aria-label="Próxima versão"
          disabled={i === creatives.length - 1}
          onClick={() => setI(i + 1)}
          className="grid size-10 place-items-center rounded-full border border-line disabled:opacity-30"
        >
          <Chevron dir="right" />
        </button>
      </div>

      <p className="mt-4 rounded-2xl bg-surface-muted px-4 py-3 text-sm text-ink-soft">
        Criamos {creatives.length} versões com a sua foto. Elas rodam juntas e a Meta mostra mais a que trouxer mais
        conversas. Ao continuar, você aprova as {creatives.length}.
      </p>

      <ErrorBox error={error} />
      {canApprove ? (
        <button type="button" className={`${bigButton} mt-6`} disabled={pending} onClick={onApprove}>
          {pending ? "Aprovando…" : "Gostei, continuar"}
        </button>
      ) : (
        <p className="mt-6 rounded-xl bg-warning-soft px-4 py-3 text-sm text-warning">
          Só o dono ou um administrador da empresa pode aprovar o anúncio.
        </p>
      )}
      <Link href={`/app/criativos/${c.id}?voltar=/app/anuncios/${briefId}`} className={`${outlineButton} mt-3`}>
        Quero mudar algo
      </Link>
    </div>
  );
}

/* ------------------------------------------------------------------ Tela 7 */

function Publish({
  creatives,
  product,
  business,
  strategyId,
  isOwner,
  meta,
  simulated,
  reach,
  daily,
  days,
  onBack,
  onPublished,
}: Props & { reach: ReachKey; daily: number; days: number; onBack: () => void; onPublished: () => void }) {
  const router = useRouter();
  const [spendOk, setSpendOk] = useState(false);
  const [categoryOk, setCategoryOk] = useState(false);
  const [idempotencyKey] = useState(() => `pub_${crypto.randomUUID()}`);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [pageUrl, setPageUrl] = useState("");
  const [whatsappInput, setWhatsappInput] = useState(
    business.whatsapp_e164 ? formatBrazilWhatsapp(business.whatsapp_e164) : "",
  );
  const [editingWhatsapp, setEditingWhatsapp] = useState(!business.whatsapp_e164);
  const [pending, start] = useTransition();
  const total = daily * days;
  const lead = creatives.find((c) => c.angle_key === "oferta") ?? creatives[0];
  const money = (c: number) => formatCents(c, product.currency);
  const canPublish = isOwner && meta.connected;

  const payment = simulated
    ? "Simulação: nada é enviado à Meta e nada é cobrado."
    : meta.shared_account
      ? `O anúncio é criado pausado. Você adiciona ${money(total)} de saldo de mídia e a GereVendas coloca no ar assim que confirmado.`
      : "O anúncio é criado pausado. Depois você confirma a ativação, e a verba é cobrada pela Meta na forma de pagamento cadastrada lá.";

  function connectInlinePage() {
    setError(null);
    setInfo(null);
    start(async () => {
      const res = await linkMetaPage({
        page_url: pageUrl,
        whatsapp_phone: whatsappInput,
      }).catch(() => null);
      if (!res) return setError("Não foi possível verificar a Página agora.");
      if (!res.ok) return setError(res.error.message);
      setInfo(`Página ${res.data.page_name} conectada automaticamente.`);
      router.refresh();
    });
  }

  function saveInlineWhatsapp() {
    setError(null);
    setInfo(null);
    start(async () => {
      const res = await updateBusinessContacts({ whatsapp_phone: whatsappInput }).catch(() => null);
      if (!res) return setError("Não foi possível salvar o WhatsApp agora.");
      if (!res.ok) return setError(res.error.message);
      setEditingWhatsapp(false);
      setInfo("Número do WhatsApp atualizado.");
      router.refresh();
    });
  }

  function publish() {
    setError(null);
    setInfo(null);
    start(async () => {
      const res = await publishPausedCampaign({
        strategy_id: strategyId,
        name: `Anúncio — ${product.name}`.slice(0, 120),
        objective: "mensagens_whatsapp",
        daily_budget_cents: daily,
        currency: "BRL",
        duration_days: days,
        creative_ids: creatives.map((c) => c.id),
        spend_confirmed_by_owner: spendOk,
        no_special_category_confirmed: categoryOk,
        idempotency_key: idempotencyKey,
      }).catch(() => null);
      if (!res) return setError("Não foi possível confirmar. Abra Anúncios antes de tentar de novo.");
      if (!res.ok) return setError(res.error.message);
      onPublished();
    });
  }

  return (
    <div>
      <ScreenHeader
        title="Tudo pronto!"
        back={onBack}
        step={STEP_NUMBER.publicar}
        aside={simulated ? <SimulationTag /> : undefined}
      />
      <div className="flex gap-4 rounded-2xl border border-line p-3">
        <ProductThumb url={lead?.image_url ?? product.photo_url} name={product.name} className="size-24" />
        <div className="min-w-0 py-1">
          <p className="font-display text-[17px] leading-snug font-bold">{lead?.content.headline ?? product.name}</p>
          <p className="mt-1 text-sm text-ink-soft">
            {[product.price_cents !== null ? money(product.price_cents) : null, product.highlights[0]]
              .filter(Boolean)
              .join(" • ")}
          </p>
        </div>
      </div>

      <dl className="mt-5 divide-y divide-line text-[15px]">
        <SummaryRow icon={<PinIcon />} label="Região">
          {business.city} · {REACH_OPTIONS[reach].label.toLowerCase()}
        </SummaryRow>
        <SummaryRow icon={<CalendarIcon />} label="Duração">
          {days} dias
        </SummaryRow>
        <SummaryRow icon={<CoinsIcon small />} label="Investimento">
          {money(total)} ({money(daily)}/dia)
        </SummaryRow>
        <SummaryRow icon={<WhatsAppIcon className="size-5 text-brand" />} label="Destino">
          <span className="inline-flex flex-wrap items-center gap-2">
            <span>
              seu WhatsApp {business.whatsapp_e164 ? formatBrazilWhatsapp(business.whatsapp_e164) : "(não informado)"}
            </span>
            {isOwner && !editingWhatsapp && (
              <button
                type="button"
                onClick={() => setEditingWhatsapp(true)}
                className="text-xs font-semibold text-brand underline"
              >
                Trocar
              </button>
            )}
          </span>
        </SummaryRow>
      </dl>

      {isOwner && editingWhatsapp && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-2xl border border-line p-3">
          <input
            type="tel"
            value={whatsappInput}
            onChange={(e) => setWhatsappInput(e.target.value)}
            placeholder="(11) 98765-4321"
            aria-label="WhatsApp com DDD"
            className="h-11 min-w-0 flex-1 rounded-xl border border-line-strong px-3 text-sm"
          />
          <button
            type="button"
            disabled={pending || !whatsappInput.trim()}
            onClick={saveInlineWhatsapp}
            className="h-11 rounded-xl bg-brand px-4 text-sm font-bold text-white disabled:opacity-50"
          >
            Salvar WhatsApp
          </button>
        </div>
      )}

      {meta.connected ? (
        <p className="mt-4 flex items-center justify-center gap-2 rounded-2xl bg-brand-soft px-4 py-3 text-sm font-semibold text-brand-strong">
          <svg aria-hidden viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="3">
            <path d="M5 12l5 5 9-10" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Conta conectada
        </p>
      ) : (
        <div className="mt-4 space-y-3 rounded-2xl bg-warning-soft px-4 py-3 text-sm text-warning">
          <p>
            Falta conectar a sua Página do Facebook.{" "}
            <Link href="/app/conexoes" className="font-semibold underline">
              Abrir Conexões
            </Link>
          </p>
          {isOwner && (
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                value={pageUrl}
                onChange={(e) => setPageUrl(e.target.value)}
                placeholder="facebook.com/seunegocio"
                aria-label="Link da sua Página do Facebook"
                className="h-11 min-w-0 flex-1 rounded-xl border border-line-strong bg-white px-3 text-sm text-ink"
              />
              <button
                type="button"
                disabled={pending || !pageUrl.trim()}
                onClick={connectInlinePage}
                className="h-11 rounded-xl bg-brand px-4 text-sm font-bold text-white disabled:opacity-50"
              >
                {pending ? "Conectando…" : "Conectar Página"}
              </button>
            </div>
          )}
        </div>
      )}

      {info && (
        <p role="status" className="mt-3 rounded-xl bg-brand-soft px-4 py-2.5 text-sm font-medium text-brand-strong">
          {info}
        </p>
      )}

      <p className="mt-4 text-sm text-ink-soft">{payment}</p>

      <div className="mt-4 space-y-3">
        <label className="flex items-start gap-3 rounded-2xl bg-surface-muted p-4 text-sm text-ink-soft">
          <input
            type="checkbox"
            checked={spendOk}
            disabled={!canPublish || pending}
            onChange={(e) => setSpendOk(e.target.checked)}
            className="mt-0.5 size-5 accent-[var(--brand)]"
          />
          <span>
            Autorizo criar o anúncio <strong>pausado</strong> com {money(daily)} por dia durante {days} dias (até{" "}
            {money(total)}). Ele só começa a rodar depois de uma nova confirmação.
          </span>
        </label>
        <label className="flex items-start gap-3 rounded-2xl bg-surface-muted p-4 text-sm text-ink-soft">
          <input
            type="checkbox"
            checked={categoryOk}
            disabled={!canPublish || pending}
            onChange={(e) => setCategoryOk(e.target.checked)}
            className="mt-0.5 size-5 accent-[var(--brand)]"
          />
          <span>
            O anúncio <strong>não</strong> é sobre crédito ou empréstimo, vagas de emprego, imóveis, política ou temas
            sociais.
          </span>
        </label>
      </div>

      <ErrorBox error={error} />
      {!isOwner && (
        <p className="mt-6 rounded-xl bg-warning-soft px-4 py-3 text-sm text-warning">
          Só o dono da empresa pode autorizar a verba e publicar.
        </p>
      )}
      <button
        type="button"
        className={`${bigButton} mt-6`}
        disabled={!canPublish || !spendOk || !categoryOk || pending}
        onClick={publish}
      >
        {pending ? "Publicando…" : simulated ? "Publicar anúncio (Simulação)" : "Publicar anúncio"}
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ peças auxiliares */

function useWidth(ref: React.RefObject<HTMLElement | null>) {
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(Math.floor(el.clientWidth)));
    ro.observe(el);
    setW(Math.floor(el.clientWidth));
    return () => ro.disconnect();
  }, [ref]);
  return w;
}

function ErrorBox({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <p role="alert" className="mt-5 rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">
      {error}
    </p>
  );
}

function SummaryRow({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-3 py-3">
      <span className="grid size-6 place-items-center text-ink-soft">{icon}</span>
      <dt className="font-semibold">{label}:</dt>
      <dd className="min-w-0 text-ink-soft">{children}</dd>
    </div>
  );
}

/** Mapa ilustrativo: mostra a ideia do alcance, não a área exata que a Meta usa. */
function ReachMap({ reach }: { reach: ReachKey }) {
  const r = reach === "cidade" ? 52 : 86;
  return (
    <figure className="mt-5">
      <svg viewBox="0 0 320 200" className="w-full rounded-2xl bg-[#eef1ec]" role="img" aria-label="Mapa ilustrativo">
        {Array.from({ length: 9 }, (_, k) => (
          <path key={`v${k}`} d={`M${20 + k * 36} 0v200`} stroke="#fff" strokeWidth={k % 3 ? 4 : 7} />
        ))}
        {Array.from({ length: 6 }, (_, k) => (
          <path key={`h${k}`} d={`M0 ${14 + k * 36}h320`} stroke="#fff" strokeWidth={k % 2 ? 4 : 7} />
        ))}
        <rect x="24" y="18" width="28" height="28" fill="#cfe8d2" />
        <rect x="240" y="126" width="64" height="28" fill="#cfe8d2" />
        <rect x="132" y="162" width="28" height="28" fill="#cfe8d2" />
        <circle
          cx="160"
          cy="100"
          r={r}
          fill="var(--brand)"
          fillOpacity="0.16"
          stroke="var(--brand)"
          strokeWidth="2"
          className="transition-all duration-300"
        />
        <circle cx="160" cy="100" r="15" fill="var(--brand)" />
        <path d="M153 98h14l-1.5-5h-11zM155 98v7h10v-7" stroke="#fff" strokeWidth="1.8" fill="none" />
      </svg>
      <figcaption className="mt-1 text-center text-xs text-ink-faint">Mapa ilustrativo</figcaption>
    </figure>
  );
}

function Chevron({ dir }: { dir: "left" | "right" }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2">
      <path d={dir === "left" ? "M15 6l-6 6 6 6" : "M9 6l6 6-6 6"} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PinIcon() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 21s7-6.2 7-12a7 7 0 10-14 0c0 5.8 7 12 7 12z" strokeLinejoin="round" />
      <circle cx="12" cy="9" r="2.5" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="4" y="5" width="16" height="15" rx="2" />
      <path d="M4 10h16M9 3v4M15 3v4" strokeLinecap="round" />
    </svg>
  );
}

function CoinsIcon({ small = false }: { small?: boolean }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className={small ? "size-5" : "size-7 text-ink-soft"}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <ellipse cx="12" cy="6" rx="7" ry="2.5" />
      <path d="M5 6v4c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5V6M5 10v4c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5v-4M5 14v4c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5v-4" />
    </svg>
  );
}
