"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { acceptInvite } from "@/server/account";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export function AcceptInviteButton({ token }: { token: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleAccept() {
    setError(null);
    startTransition(async () => {
      const res = await acceptInvite(token);
      if (!res.ok) {
        setError(res.error.message);
        return;
      }
      router.push("/app");
      router.refresh();
    });
  }

  return (
    <div className="mt-6 space-y-3">
      {error && <Alert tone="danger">{error}</Alert>}
      <Button type="button" onClick={handleAccept} disabled={isPending} className="w-full">
        {isPending ? "Entrando na empresa…" : "Aceitar convite e acessar"}
      </Button>
    </div>
  );
}
