import type { MarketResearch, ResearchSource } from "@/contracts/creatives";
import type { Objective } from "@/contracts/onboarding";

/** Fatos do brief que a IA pode usar. Só o que o cliente informou e confirmou no onboarding. */
export type StrategyInput = {
  business: { name: string; segment: string; city: string; state: string; tone_of_voice: string | null };
  offer: { name: string; description: string; price_cents: number | null; differentiators: string[] };
  audience: { description: string; age_min: number; age_max: number; service_radius_km: number | null };
  objective: Objective;
  /** Pesquisa de mercado (contexto, não fato do cliente). Ausente quando a pesquisa falhou. */
  research?: MarketResearch | null;
};

/** O que a pesquisa na web recebe: identificação pública do negócio e os concorrentes que o cliente citou. */
export type ResearchInput = {
  business: {
    name: string;
    segment: string;
    city: string;
    state: string;
    instagram_handle: string | null;
    website_url: string | null;
  };
  offer: { name: string; description: string };
  competitors_listed: string[];
};

export type TextUsage = { input_tokens: number; output_tokens: number };

/** `data` ainda não foi validado: quem chama aplica o schema e a checagem de fatos. */
export type TextResult = { data: unknown; usage: TextUsage; request_id?: string };

/** Fontes vêm da resposta da busca (não são escritas pelo modelo). */
export type ResearchResult = TextResult & { sources: ResearchSource[] };

export interface TextProvider {
  readonly name: "openai" | "mock";
  readonly model: string;
  research(input: ResearchInput): Promise<ResearchResult>;
  generateStrategy(input: StrategyInput): Promise<TextResult>;
}
