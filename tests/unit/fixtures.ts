import { ANGLE_KEYS, type AngleKey, type StrategyPlan } from "@/contracts/creatives";

export const angle = (key: AngleKey) => ({
  key,
  label: "Ângulo",
  rationale: "Por que este ângulo funciona para quem compra.",
  headline: "Café da manhã completo",
  body: "Pão na chapa, café e suco natural.",
  cta: "Chamar no WhatsApp",
  persona: "Quem trabalha cedo e toma café fora de casa.",
  funnel_stage: "meio" as const,
  test_hypothesis: "Se o custo por conversa for o menor, o café completo é o melhor gancho.",
  layout: key,
  visual_concept: "Mesa de padaria vista de cima com pão na chapa e café, luz da manhã.",
});

export const validPlan: StrategyPlan = {
  business_summary: "Padaria de bairro em Campinas.",
  angles: ANGLE_KEYS.map(angle),
  targeting_proposal: { locations: ["Campinas, SP"], age_range: "25 a 55 anos" },
  test_plan: ["Suba as 5 peças juntas e não edite por 7 dias."],
  assumptions: [],
  fields_requiring_confirmation: [],
};
