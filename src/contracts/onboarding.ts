import { z } from "zod";
import { currencySchema, ufSchema } from "./common";

/**
 * Contrato do onboarding (6 etapas). As chaves são snake_case porque este objeto é
 * persistido como rascunho (onboarding_drafts.data) e enviado como payload para a
 * RPC `complete_onboarding` sem mapeamento intermediário.
 */

const text = (min: number, max: number, label: string) =>
  z.string().trim().min(min, `${label}: mínimo de ${min} caracteres`).max(max, `${label}: máximo de ${max} caracteres`);

const optionalText = <T extends z.ZodType>(schema: T) => z.union([z.literal(""), schema]).optional();

export const businessStepSchema = z.object({
  name: text(2, 120, "Nome do negócio"),
  segment: text(2, 80, "Segmento"),
  city: text(2, 80, "Cidade"),
  state: ufSchema,
  instagram_handle: optionalText(z.string().regex(/^[A-Za-z0-9._]{1,30}$/, "Use só o @usuário, sem link")),
  whatsapp_e164: optionalText(z.string().regex(/^\+[1-9][0-9]{7,14}$/, "WhatsApp inválido. Ex.: (19) 99999-0000")),
  website_url: optionalText(
    z.url({ protocol: /^https$/, message: "Use um endereço completo começando com https://" }).max(300),
  ),
  /** Concorrentes que o cliente conhece (nome e, se souber, @ ou site). A IA pesquisa outros. */
  competitors: z
    .array(text(2, 120, "Concorrente"))
    .max(5)
    .default([]),
});

export const offerStepSchema = z
  .object({
    name: text(2, 120, "Produto ou serviço"),
    description: text(10, 600, "Descrição"),
    price_cents: z.number({ error: "Informe um preço válido, ex.: 24,90" }).int().nonnegative().nullable(),
    currency: currencySchema.default("BRL"),
    price_confirmed_by_client: z.boolean().default(false),
    differentiators: z
      .array(text(2, 120, "Diferencial"))
      .max(5)
      .default([]),
  })
  .refine((o) => o.price_cents === null || o.price_confirmed_by_client, {
    message: "Confirme que o preço é real e está vigente",
    path: ["price_confirmed_by_client"],
  });

export const audienceStepSchema = z
  .object({
    description: text(10, 600, "Quem compra de você"),
    age_min: z
      .number({ error: "Informe a idade mínima" })
      .int()
      .min(18, "Mínimo de 18 anos")
      .max(65, "Máximo de 65 anos"),
    age_max: z
      .number({ error: "Informe a idade máxima" })
      .int()
      .min(18, "Mínimo de 18 anos")
      .max(65, "Máximo de 65 anos"),
    service_radius_km: z
      .number({ error: "Informe um número de km" })
      .int()
      .min(1, "Mínimo de 1 km")
      .max(200, "Máximo de 200 km")
      .nullable(),
  })
  .refine((a) => a.age_min <= a.age_max, {
    message: "Idade mínima maior que a máxima",
    path: ["age_max"],
  });

export const OBJECTIVES = ["mensagens_whatsapp", "visitas_perfil", "trafego_site", "reconhecimento_local"] as const;
export const objectiveSchema = z.enum(OBJECTIVES, { error: "Escolha um objetivo" });
export type Objective = z.infer<typeof objectiveSchema>;

export const OBJECTIVE_LABELS: Record<Objective, { title: string; description: string }> = {
  mensagens_whatsapp: {
    title: "Receber mensagens no WhatsApp",
    description: "Para quem fecha venda conversando.",
  },
  visitas_perfil: {
    title: "Levar pessoas ao Instagram",
    description: "Para quem vende pelo perfil e pelo direct.",
  },
  trafego_site: {
    title: "Levar pessoas ao site",
    description: "Para quem tem loja virtual ou página de pedidos.",
  },
  reconhecimento_local: {
    title: "Ser lembrado no bairro",
    description: "Para quem quer ser visto por quem mora ou passa perto.",
  },
};

export const goalStepSchema = z.object({ objective: objectiveSchema });

export const TONES = ["acolhedor", "direto", "premium", "divertido", "tecnico"] as const;
export const TONE_LABELS: Record<(typeof TONES)[number], string> = {
  acolhedor: "Acolhedor",
  direto: "Direto",
  premium: "Premium",
  divertido: "Divertido",
  tecnico: "Técnico",
};

export const identityStepSchema = z.object({
  brand_primary_color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Cor em hexadecimal, ex.: #C2410C"),
  tone_of_voice: z.enum(TONES, { error: "Escolha um tom de voz" }),
});

export const reviewStepSchema = z.object({
  facts_confirmed: z.literal(true, {
    error: "Confirme que as informações são verdadeiras",
  }),
});

export const ONBOARDING_STEPS = [
  { key: "business", title: "Seu negócio", schema: businessStepSchema },
  { key: "offer", title: "O que você vende", schema: offerStepSchema },
  { key: "audience", title: "Quem compra", schema: audienceStepSchema },
  { key: "goal", title: "Objetivo", schema: goalStepSchema },
  { key: "identity", title: "Identidade", schema: identityStepSchema },
  { key: "review", title: "Revisão", schema: reviewStepSchema },
] as const;
export type OnboardingStepKey = (typeof ONBOARDING_STEPS)[number]["key"];

export const onboardingSchema = z
  .object({
    business: businessStepSchema,
    offer: offerStepSchema,
    audience: audienceStepSchema,
    goal: goalStepSchema,
    identity: identityStepSchema,
    review: reviewStepSchema,
  })
  .superRefine((v, ctx) => {
    const required: Partial<Record<Objective, { field: keyof typeof v.business; label: string }>> = {
      mensagens_whatsapp: { field: "whatsapp_e164", label: "WhatsApp" },
      visitas_perfil: { field: "instagram_handle", label: "Instagram" },
      trafego_site: { field: "website_url", label: "site" },
    };
    const need = required[v.goal.objective];
    if (need && !v.business[need.field]) {
      ctx.addIssue({
        code: "custom",
        path: ["business", need.field],
        message: `Para esse objetivo, informe o ${need.label} na etapa 1`,
      });
    }
  });
export type OnboardingInput = z.input<typeof onboardingSchema>;
export type Onboarding = z.output<typeof onboardingSchema>;

/** Rascunho: cada etapa pode estar incompleta. Validação completa só ao concluir. */
export const onboardingDraftSchema = z.object({
  step: z.number().int().min(1).max(ONBOARDING_STEPS.length),
  data: z
    .object({
      business: z.record(z.string(), z.unknown()).optional(),
      offer: z.record(z.string(), z.unknown()).optional(),
      audience: z.record(z.string(), z.unknown()).optional(),
      goal: z.record(z.string(), z.unknown()).optional(),
      identity: z.record(z.string(), z.unknown()).optional(),
      review: z.record(z.string(), z.unknown()).optional(),
    })
    .strict(),
});
export type OnboardingDraft = z.infer<typeof onboardingDraftSchema>;

export const completeOnboardingResultSchema = z.object({
  business_id: z.uuid(),
  offer_id: z.uuid(),
  brief_id: z.uuid(),
  replayed: z.boolean(),
});
export type CompleteOnboardingResult = z.infer<typeof completeOnboardingResultSchema>;

/** Converte erros do Zod em mapa `caminho -> mensagens` para a UI. */
export function fieldErrors(error: z.ZodError): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_";
    (out[key] ??= []).push(issue.message);
  }
  return out;
}
