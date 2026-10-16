import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SparkIcon } from "./page-states";

const DOES = [
  "Usa só as informações que você confirmou no cadastro",
  "Propõe posicionamento, mensagens-chave e de 3 a 5 conceitos de anúncio",
  "Escreve títulos e textos dentro dos limites do feed e dos stories",
];
const DOES_NOT = [
  "Não inventa preços, descontos, números ou resultados",
  "Não cria depoimentos nem promessas que você não confirmou",
  "Não publica nada: a publicação na Meta chega numa próxima fase",
];

/** Chamada inicial para gerar a estratégia: o que a IA faz e o que não faz. */
export function GenerateHero({
  buttonLabel,
  busy,
  disabled,
  onGenerate,
  note,
  simulation,
  children,
}: {
  buttonLabel: string;
  busy: boolean;
  disabled?: boolean;
  onGenerate: () => void;
  note: ReactNode;
  simulation: boolean;
  children?: ReactNode;
}) {
  return (
    <Card className="overflow-hidden">
      <div className="grid lg:grid-cols-[1.15fr_1fr]">
        <div className="p-6 sm:p-9">
          <div className="flex items-center gap-3">
            <span aria-hidden className="grid size-12 place-items-center rounded-2xl bg-brand text-white">
              <SparkIcon className="size-6" />
            </span>
            {simulation && <Badge tone="demo">Simulação</Badge>}
          </div>
          <h2 className="mt-5 font-display text-2xl font-bold tracking-tight sm:text-[28px]">
            Gere a estratégia dos seus anúncios
          </h2>
          <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-ink-soft">
            A IA lê o cadastro do seu negócio e propõe uma estratégia com conceitos de anúncio prontos para virar peças
            editáveis. É uma proposta: você revisa, edita e aprova tudo.
          </p>
          <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Button size="lg" onClick={onGenerate} disabled={busy || disabled} aria-busy={busy}>
              <SparkIcon className="size-5" />
              {busy ? "Gerando…" : buttonLabel}
            </Button>
          </div>
          <div className="mt-3 text-sm text-ink-faint">{note}</div>
          {children && <div className="mt-6">{children}</div>}
        </div>
        <div className="grid content-start gap-6 border-t border-line bg-canvas/70 p-6 sm:p-9 lg:border-t-0 lg:border-l">
          <div>
            <h3 className="font-display text-base font-bold">O que a IA faz</h3>
            <ul className="mt-3 grid gap-2.5">
              {DOES.map((item) => (
                <li key={item} className="flex items-start gap-2.5 text-[15px]">
                  <span
                    aria-hidden
                    className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-success-soft text-success"
                  >
                    <svg viewBox="0 0 20 20" className="size-3" fill="none" stroke="currentColor" strokeWidth="2.6">
                      <path d="M4.5 10.5l3.5 3.5 7.5-8" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="font-display text-base font-bold">O que a IA não faz</h3>
            <ul className="mt-3 grid gap-2.5">
              {DOES_NOT.map((item) => (
                <li key={item} className="flex items-start gap-2.5 text-[15px]">
                  <span
                    aria-hidden
                    className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-danger-soft text-danger"
                  >
                    <svg viewBox="0 0 20 20" className="size-3" fill="none" stroke="currentColor" strokeWidth="2.6">
                      <path d="M6 6l8 8M14 6l-8 8" strokeLinecap="round" />
                    </svg>
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </Card>
  );
}
