import { ANGLE_KEYS, type AngleKey, type StrategyPlan } from "@/contracts/creatives";

export const angle = (key: AngleKey) => ({
  key,
  label: "Ângulo",
  rationale: "Por que este ângulo funciona para quem compra.",
  headline: "Café da manhã completo",
  body: "Pão na chapa, café e suco natural.",
  cta: "Chamar no WhatsApp",
});

export const validPlan: StrategyPlan = {
  business_summary: "Padaria de bairro em Campinas.",
  angles: ANGLE_KEYS.map(angle),
  targeting_proposal: { locations: ["Campinas, SP"], age_range: "25 a 55 anos" },
  assumptions: [],
  fields_requiring_confirmation: [],
};
