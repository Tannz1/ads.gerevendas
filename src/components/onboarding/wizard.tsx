"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { ONBOARDING_STEPS } from "@/contracts/onboarding";
import { clearDemoStrategyAndCreatives } from "@/components/demo/demo-store";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { AppMode } from "@/lib/public-env";
import { completeOnboarding, saveOnboardingDraft } from "@/server/onboarding";
import {
  emptyForm,
  firstStepWithError,
  fromServerFieldErrors,
  hydrateForm,
  toPayload,
  validateAll,
  validateStep,
  type Errors,
  type FormState,
} from "./form-state";
import { DEMO_STORAGE_KEY, readDemoDraft, writeDemoDraft } from "./demo-storage";
import { AudienceStep, BusinessStep, GoalStep, IdentityStep, OfferStep, ReviewStep } from "./steps";

type SaveStatus = "idle" | "saving" | "saved" | "error";

export type WizardProps = {
  mode: AppMode;
  initial?: { step: number; data: unknown; completed: boolean } | null;
};

export function OnboardingWizard({ mode, initial }: WizardProps) {
  const demo = mode === "demo";
  const [ready, setReady] = useState(!demo);
  const [step, setStep] = useState(initial?.step ?? 1);
  const [form, setForm] = useState<FormState>(() => hydrateForm(initial?.data));
  const [completed, setCompleted] = useState(Boolean(initial?.completed));
  const [errors, setErrors] = useState<Errors>({});
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, startSubmit] = useTransition();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const dirty = useRef(false);

  // Modo demonstração: carrega o rascunho do navegador após montar.
  useEffect(() => {
    if (!demo) return;
    const saved = readDemoDraft();
    /* eslint-disable react-hooks/set-state-in-effect -- leitura única de localStorage após a hidratação */
    if (saved) {
      setForm(hydrateForm(saved.data));
      setStep(saved.step);
      setCompleted(saved.completed);
    }
    setReady(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [demo]);

  // Autosave com debounce.
  useEffect(() => {
    if (!ready || completed || !dirty.current) return;
    const timer = setTimeout(async () => {
      setSaveStatus("saving");
      if (demo) {
        setSaveStatus(writeDemoDraft({ step, data: form, completed: false }) ? "saved" : "error");
        return;
      }
      const res = await saveOnboardingDraft({ step, data: form });
      setSaveStatus(res.ok ? "saved" : "error");
    }, 800);
    return () => clearTimeout(timer);
  }, [form, step, ready, completed, demo]);

  useEffect(() => {
    if (dirty.current) headingRef.current?.focus();
  }, [step]);

  function update<K extends keyof FormState>(section: K, patch: Partial<FormState[K]>) {
    dirty.current = true;
    setForm((f) => ({ ...f, [section]: { ...f[section], ...patch } }));
    setErrors((e) => {
      const next = { ...e };
      for (const field of Object.keys(patch)) delete next[`${section}.${field}`];
      return next;
    });
  }

  function goTo(n: number) {
    dirty.current = true;
    setSubmitError(null);
    setStep(n);
  }

  function next() {
    const key = ONBOARDING_STEPS[step - 1].key;
    const stepErrors = validateStep(key, form);
    setErrors(stepErrors);
    if (Object.keys(stepErrors).length === 0) goTo(step + 1);
  }

  function submit() {
    const all = validateAll(form);
    setErrors(all);
    if (Object.keys(all).length > 0) {
      const target = firstStepWithError(all);
      if (target && target !== step) goTo(target);
      return;
    }
    setSubmitError(null);
    startSubmit(async () => {
      if (demo) {
        writeDemoDraft({ step, data: form, completed: true });
        setCompleted(true);
        return;
      }
      const res = await completeOnboarding(toPayload(form));
      if (res.ok) {
        setCompleted(true);
        return;
      }
      const fieldErrs = fromServerFieldErrors(res.error.field_errors);
      setErrors(fieldErrs);
      const target = firstStepWithError(fieldErrs);
      if (target) goTo(target);
      setSubmitError(`${res.error.message} (código ${res.error.correlation_id.slice(0, 8)})`);
    });
  }

  function restartDemo() {
    try {
      localStorage.removeItem(DEMO_STORAGE_KEY);
    } catch {
      // armazenamento indisponível: apenas reinicia o estado em memória
    }
    // A estratégia e as peças simuladas dependem do cadastro: recomeçar apaga tudo.
    clearDemoStrategyAndCreatives();
    dirty.current = false;
    setForm(emptyForm());
    setStep(1);
    setCompleted(false);
    setErrors({});
    setSaveStatus("idle");
  }

  if (!ready) return <WizardSkeleton />;

  if (completed) {
    return (
      <Card className="mx-auto max-w-2xl p-6 text-center sm:p-10">
        <span aria-hidden className="mx-auto grid size-12 place-items-center rounded-full bg-success-soft text-success">
          <svg
            viewBox="0 0 20 20"
            className="size-6"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M4.5 10.5l3.5 3.5 7.5-8" />
          </svg>
        </span>
        <h1 className="mt-4 font-display text-2xl font-bold tracking-tight">Cadastro concluído</h1>
        {demo ? (
          <>
            <div className="mt-2 flex justify-center">
              <Badge tone="demo">Simulação</Badge>
            </div>
            <p className="mt-3 text-ink-soft">
              Em modo demonstração nada foi enviado ao servidor. As informações ficaram só neste navegador.
            </p>
          </>
        ) : (
          <p className="mt-3 text-ink-soft">
            Recebemos as informações do seu negócio. Agora você já pode gerar a estratégia e as primeiras peças.
          </p>
        )}
        <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
          <ButtonLink href="/app/estrategia">Ir para a estratégia</ButtonLink>
          <ButtonLink href="/app" variant="secondary">
            Voltar ao início
          </ButtonLink>
          {demo && (
            <Button variant="secondary" onClick={restartDemo}>
              Recomeçar demonstração
            </Button>
          )}
        </div>
      </Card>
    );
  }

  const current = ONBOARDING_STEPS[step - 1];
  const isLast = step === ONBOARDING_STEPS.length;
  const props = { form, errors, update };

  return (
    <div className="mx-auto grid max-w-5xl gap-6 lg:grid-cols-[220px_1fr] lg:gap-10">
      <nav aria-label="Etapas do cadastro" className="lg:sticky lg:top-24 lg:self-start">
        <p className="mb-3 text-xs font-semibold tracking-wider text-ink-faint uppercase">
          Etapa {step} de {ONBOARDING_STEPS.length}
        </p>
        <div className="mb-4 h-1.5 overflow-hidden rounded-full bg-surface-muted lg:hidden" aria-hidden>
          <div
            className="h-full rounded-full bg-brand transition-all"
            style={{ width: `${(step / ONBOARDING_STEPS.length) * 100}%` }}
          />
        </div>
        <ol className="hidden flex-col gap-1 lg:flex">
          {ONBOARDING_STEPS.map((s, i) => {
            const n = i + 1;
            const state = n < step ? "done" : n === step ? "current" : "todo";
            return (
              <li key={s.key}>
                <button
                  type="button"
                  onClick={() => n < step && goTo(n)}
                  disabled={n > step}
                  aria-current={state === "current" ? "step" : undefined}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm transition-colors ${
                    state === "current"
                      ? "bg-surface font-semibold text-ink shadow-[var(--shadow-card)]"
                      : "text-ink-soft"
                  } ${state === "done" ? "hover:bg-surface" : ""} disabled:cursor-default`}
                >
                  <span
                    aria-hidden
                    className={`grid size-6 shrink-0 place-items-center rounded-full text-xs font-bold ${
                      state === "done"
                        ? "bg-success text-white"
                        : state === "current"
                          ? "bg-brand text-white"
                          : "border border-line-strong text-ink-faint"
                    }`}
                  >
                    {state === "done" ? "✓" : n}
                  </span>
                  {s.title}
                  {state === "done" && <span className="sr-only">(concluída)</span>}
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      <Card className="p-5 sm:p-8">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
          <h1
            ref={headingRef}
            tabIndex={-1}
            className="font-display text-2xl font-bold tracking-tight focus:outline-none"
          >
            {current.title}
          </h1>
          <SaveIndicator status={saveStatus} demo={demo} />
        </div>

        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            if (isLast) submit();
            else next();
          }}
        >
          {current.key === "business" && <BusinessStep {...props} />}
          {current.key === "offer" && <OfferStep {...props} />}
          {current.key === "audience" && <AudienceStep {...props} />}
          {current.key === "goal" && <GoalStep {...props} />}
          {current.key === "identity" && <IdentityStep {...props} />}
          {current.key === "review" && <ReviewStep {...props} onEdit={goTo} demo={demo} />}

          {submitError && (
            <Alert tone="danger" title="Não foi possível concluir" className="mt-6">
              {submitError}
            </Alert>
          )}

          <div className="mt-8 flex flex-col-reverse gap-3 border-t border-line pt-6 sm:flex-row sm:justify-between">
            {step > 1 ? (
              <Button type="button" variant="ghost" onClick={() => goTo(step - 1)}>
                Voltar
              </Button>
            ) : (
              <Link href="/app" className="self-center text-sm font-medium text-ink-soft hover:text-ink">
                Continuar depois
              </Link>
            )}
            <Button type="submit" size="lg" disabled={submitting}>
              {isLast ? (submitting ? "Concluindo…" : "Concluir cadastro") : "Continuar"}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}

function SaveIndicator({ status, demo }: { status: SaveStatus; demo: boolean }) {
  const label =
    status === "saving"
      ? "Salvando…"
      : status === "saved"
        ? demo
          ? "Salvo neste navegador"
          : "Rascunho salvo"
        : status === "error"
          ? "Falha ao salvar o rascunho"
          : demo
            ? "Rascunho fica neste navegador"
            : "Salvamento automático";
  return (
    <p
      aria-live="polite"
      className={`flex items-center gap-2 text-sm ${status === "error" ? "text-danger" : "text-ink-faint"}`}
    >
      {demo && <Badge tone="demo">DEMO</Badge>}
      {label}
    </p>
  );
}

function WizardSkeleton() {
  return (
    <div aria-busy className="mx-auto grid max-w-5xl gap-6 lg:grid-cols-[220px_1fr] lg:gap-10">
      <div className="hidden flex-col gap-2 lg:flex">
        {ONBOARDING_STEPS.map((s) => (
          <div key={s.key} className="h-10 animate-pulse rounded-xl bg-surface-muted" />
        ))}
      </div>
      <div className="h-[480px] animate-pulse rounded-2xl bg-surface-muted" />
    </div>
  );
}
