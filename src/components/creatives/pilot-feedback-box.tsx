"use client";

import { useState, useTransition } from "react";
import { submitPilotFeedback } from "@/server/billing";
import type { SubmitPilotFeedbackInput } from "@/contracts/billing";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

type Props = {
  stage: SubmitPilotFeedbackInput["stage"];
  creativeId?: string;
};

export function PilotFeedbackBox({ stage, creativeId }: Props) {
  const [rating, setRating] = useState<"helpful" | "needs_improvement" | null>(null);
  const [comment, setComment] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!rating) return;
    setError(null);
    start(async () => {
      const res = await submitPilotFeedback({
        stage,
        rating,
        comment: comment.trim() || undefined,
        creative_id: creativeId,
      });
      if (!res.ok) {
        setError(res.error.message);
        return;
      }
      setSent(true);
    });
  }

  if (sent) {
    return (
      <Card className="p-4 text-sm text-ink-soft">
        Obrigado! Sua avaliação foi registrada para melhorar o piloto do GereVendas Ads.
      </Card>
    );
  }

  return (
    <Card className="p-4 sm:p-5">
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold">Avaliação rápida do piloto: o que achou destas propostas?</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setRating("helpful")}
              className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
                rating === "helpful"
                  ? "border-brand bg-brand text-white"
                  : "border-line bg-surface text-ink hover:bg-surface-muted"
              }`}
            >
              Ficaram boas
            </button>
            <button
              type="button"
              onClick={() => setRating("needs_improvement")}
              className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
                rating === "needs_improvement"
                  ? "border-brand bg-brand text-white"
                  : "border-line bg-surface text-ink hover:bg-surface-muted"
              }`}
            >
              Precisam melhorar
            </button>
          </div>
        </div>

        {rating && (
          <div className="space-y-2 pt-1">
            <input
              type="text"
              maxLength={500}
              placeholder="Opcional: conte em uma frase o motivo (ex.: texto claro, faltou detalhe da região...)"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              className="h-9 w-full rounded-lg border border-line bg-surface px-3 text-sm"
            />
            {error && <Alert tone="danger">{error}</Alert>}
            <Button type="submit" variant="secondary" disabled={pending}>
              {pending ? "Enviando…" : "Enviar avaliação"}
            </Button>
          </div>
        )}
      </form>
    </Card>
  );
}
