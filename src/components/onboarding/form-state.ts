import type { z } from "zod";
import {
  ONBOARDING_STEPS,
  onboardingSchema,
  type OnboardingInput,
  type OnboardingStepKey,
} from "@/contracts/onboarding";
import { parseBRLToCents } from "@/lib/money";
import { normalizeBrazilWhatsapp } from "@/lib/phone";

/**
 * Estado do formulário como o usuário digita (strings). É o que vai para o rascunho
 * (autosave). A conversão para o contrato canônico acontece em `toPayload`.
 */
export type FormState = {
  business: {
    name: string;
    segment: string;
    city: string;
    state: string;
    instagram_handle: string;
    whatsapp: string;
    website_url: string;
    competitors: string[];
  };
  offer: {
    name: string;
    description: string;
    show_price: boolean;
    price: string;
    price_confirmed_by_client: boolean;
    differentiators: string[];
  };
  audience: { description: string; age_min: string; age_max: string; service_radius_km: string };
  goal: { objective: string };
  identity: { brand_primary_color: string; tone_of_voice: string };
  review: { facts_confirmed: boolean };
};

export const DEFAULT_BRAND_COLOR = "#2A45E8";

export function emptyForm(): FormState {
  return {
    business: {
      name: "",
      segment: "",
      city: "",
      state: "",
      instagram_handle: "",
      whatsapp: "",
      website_url: "",
      competitors: ["", "", ""],
    },
    offer: {
      name: "",
      description: "",
      show_price: false,
      price: "",
      price_confirmed_by_client: false,
      differentiators: ["", "", ""],
    },
    audience: { description: "", age_min: "25", age_max: "55", service_radius_km: "" },
    goal: { objective: "" },
    identity: { brand_primary_color: DEFAULT_BRAND_COLOR, tone_of_voice: "" },
    review: { facts_confirmed: false },
  };
}

/** Mescla um rascunho salvo (possivelmente de versão antiga) com os padrões. */
export function hydrateForm(saved: unknown): FormState {
  const base = emptyForm();
  if (!saved || typeof saved !== "object") return base;
  const s = saved as Partial<Record<keyof FormState, Record<string, unknown>>>;
  const merged = { ...base } as Record<keyof FormState, Record<string, unknown>>;
  for (const key of Object.keys(base) as (keyof FormState)[]) {
    const section = s[key];
    if (!section || typeof section !== "object") continue;
    const target: Record<string, unknown> = { ...merged[key] };
    for (const [field, def] of Object.entries(base[key])) {
      const value = section[field];
      if (Array.isArray(def) && Array.isArray(value)) {
        target[field] = [...value.map((v) => String(v ?? "")), "", "", ""].slice(0, Math.max(3, value.length));
      } else if (typeof def === typeof value) {
        target[field] = value;
      }
    }
    merged[key] = target;
  }
  return merged as unknown as FormState;
}

const toInt = (v: string): number => (v.trim() === "" ? Number.NaN : Number(v));

function cleanInstagram(v: string): string {
  return v
    .trim()
    .replace(/^https?:\/\/(www\.)?instagram\.com\//i, "")
    .replace(/^@/, "")
    .replace(/\/.*$/, "");
}

/** Converte o formulário para o formato do contrato (`OnboardingInput`). */
export function toPayload(form: FormState): OnboardingInput {
  const { business: b, offer: o, audience: a } = form;
  return {
    business: {
      name: b.name,
      segment: b.segment,
      city: b.city,
      state: b.state as OnboardingInput["business"]["state"],
      instagram_handle: cleanInstagram(b.instagram_handle),
      whatsapp_e164: normalizeBrazilWhatsapp(b.whatsapp),
      website_url: b.website_url.trim(),
      competitors: b.competitors.map((c) => c.trim()).filter(Boolean),
    },
    offer: {
      name: o.name,
      description: o.description,
      price_cents: o.show_price ? (parseBRLToCents(o.price) ?? Number.NaN) : null,
      currency: "BRL",
      price_confirmed_by_client: o.show_price ? o.price_confirmed_by_client : false,
      differentiators: o.differentiators.map((d) => d.trim()).filter(Boolean),
    },
    audience: {
      description: a.description,
      age_min: toInt(a.age_min),
      age_max: toInt(a.age_max),
      service_radius_km: a.service_radius_km.trim() === "" ? null : toInt(a.service_radius_km),
    },
    goal: { objective: form.goal.objective as OnboardingInput["goal"]["objective"] },
    identity: {
      brand_primary_color: form.identity.brand_primary_color,
      tone_of_voice: form.identity.tone_of_voice as OnboardingInput["identity"]["tone_of_voice"],
    },
    review: { facts_confirmed: form.review.facts_confirmed as true },
  };
}

/** Mapa `etapa.campo -> primeira mensagem`, usado pelos campos do formulário. */
export type Errors = Record<string, string>;

function collect(prefix: string, error: z.ZodError, into: Errors) {
  for (const issue of error.issues) {
    const key = [prefix, ...issue.path].filter(Boolean).join(".");
    into[key] ??= issue.message;
  }
}

/** Os campos do formulário que não têm o mesmo nome do contrato. */
const FIELD_ALIASES: Record<string, string> = {
  "business.whatsapp_e164": "business.whatsapp",
  "offer.price_cents": "offer.price",
};

function aliasErrors(errors: Errors): Errors {
  return Object.fromEntries(Object.entries(errors).map(([k, v]) => [FIELD_ALIASES[k] ?? k, v]));
}

export function validateStep(key: OnboardingStepKey, form: FormState): Errors {
  const step = ONBOARDING_STEPS.find((s) => s.key === key)!;
  const payload = toPayload(form)[key];
  const result = step.schema.safeParse(payload);
  const errors: Errors = {};
  if (!result.success) collect(key, result.error, errors);
  return aliasErrors(errors);
}

export function validateAll(form: FormState): Errors {
  const result = onboardingSchema.safeParse(toPayload(form));
  const errors: Errors = {};
  if (!result.success) collect("", result.error, errors);
  return aliasErrors(errors);
}

/** Primeira etapa (1-based) que contém algum erro. */
export function firstStepWithError(errors: Errors): number | null {
  const idx = ONBOARDING_STEPS.findIndex((s) => Object.keys(errors).some((k) => k.startsWith(`${s.key}.`)));
  return idx === -1 ? null : idx + 1;
}

export function fromServerFieldErrors(fieldErrors: Record<string, string[]> | undefined): Errors {
  const out: Errors = {};
  for (const [k, v] of Object.entries(fieldErrors ?? {})) if (v[0]) out[k] = v[0];
  return aliasErrors(out);
}
