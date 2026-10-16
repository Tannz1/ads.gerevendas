"use client";

import { useEffect, useState } from "react";
import { listDemoCreatives, readDemoStrategy } from "@/components/demo/demo-store";
import { readDemoDraft } from "@/components/onboarding/demo-storage";
import { Skeleton } from "@/components/ui/skeleton";
import { HomeStatus, type OnboardingStatus, type Phase2Status } from "./home-status";

export function DemoHome() {
  const [loaded, setLoaded] = useState<{ status: OnboardingStatus; phase2: Phase2Status } | null>(null);
  useEffect(() => {
    const d = readDemoDraft();
    const creatives = listDemoCreatives();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- leitura única de localStorage após a hidratação
    setLoaded({
      status: !d ? { state: "not_started", step: 1 } : { state: d.completed ? "done" : "in_progress", step: d.step },
      phase2: {
        strategyVersion: readDemoStrategy()?.version ?? null,
        creatives: { total: creatives.length, approved: creatives.filter((c) => c.status === "approved").length },
      },
    });
  }, []);
  if (!loaded) return <Skeleton className="mx-auto h-72 max-w-5xl" />;
  return <HomeStatus status={loaded.status} phase2={loaded.phase2} demo />;
}
