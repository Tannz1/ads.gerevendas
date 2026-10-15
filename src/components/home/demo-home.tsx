"use client";

import { useEffect, useState } from "react";
import { readDemoDraft } from "@/components/onboarding/demo-storage";
import { Skeleton } from "@/components/ui/skeleton";
import { HomeStatus, type OnboardingStatus } from "./home-status";

export function DemoHome() {
  const [status, setStatus] = useState<OnboardingStatus | null>(null);
  useEffect(() => {
    const d = readDemoDraft();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- leitura única de localStorage após a hidratação
    setStatus(!d ? { state: "not_started", step: 1 } : { state: d.completed ? "done" : "in_progress", step: d.step });
  }, []);
  if (!status) return <Skeleton className="mx-auto h-72 max-w-5xl" />;
  return <HomeStatus status={status} demo />;
}
