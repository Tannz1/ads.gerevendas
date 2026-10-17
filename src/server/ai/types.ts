import type { Objective } from "@/contracts/onboarding";

/** Fatos do brief que a IA pode usar. Só o que o cliente informou e confirmou no onboarding. */
export type StrategyInput = {
  business: { name: string; segment: string; city: string; state: string; tone_of_voice: string | null };
  offer: { name: string; description: string; price_cents: number | null; differentiators: string[] };
  audience: { description: string; age_min: number; age_max: number; service_radius_km: number | null };
  objective: Objective;
};

export type TextUsage = { input_tokens: number; output_tokens: number };

/** `data` ainda não foi validado: quem chama aplica o schema e a checagem de fatos. */
export type TextResult = { data: unknown; usage: TextUsage; request_id?: string };

export interface TextProvider {
  readonly name: "openai" | "mock";
  readonly model: string;
  generateStrategy(input: StrategyInput): Promise<TextResult>;
}
