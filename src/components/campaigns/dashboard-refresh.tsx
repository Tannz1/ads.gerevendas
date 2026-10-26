"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { refreshDashboardMetrics } from "@/server/campaigns";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";

export function DashboardRefresh() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ text: string; failed: boolean } | null>(null);
  return (
    <div className="space-y-3">
      <Button
        variant="secondary"
        disabled={pending}
        onClick={() => {
          setMessage(null);
          start(async () => {
            try {
              const res = await refreshDashboardMetrics();
              setMessage(
                res.ok
                  ? {
                      text: `${res.data.synced} campanhas atualizadas. ${res.data.failed ? `${res.data.failed} não puderam ser atualizadas; tente novamente.` : "As demais já estão atualizadas ou aguardam a próxima consulta."}`,
                      failed: res.data.failed > 0,
                    }
                  : { text: res.error.message, failed: true },
              );
              router.refresh();
            } catch {
              setMessage({ text: "Não foi possível atualizar. Tente novamente.", failed: true });
            }
          });
        }}
      >
        {pending ? "Atualizando métricas…" : "Atualizar métricas da Meta"}
      </Button>
      {message && <Alert tone={message.failed ? "warning" : "info"}>{message.text}</Alert>}
    </div>
  );
}
