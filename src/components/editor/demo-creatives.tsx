"use client";

import { useEffect, useState } from "react";
import { listDemoCreatives, type DemoCreative } from "@/components/demo/demo-store";
import { CreativesScreen, CreativesSkeleton } from "./creatives-grid";

/** Lista de peças da demonstração (lidas do navegador). */
export function DemoCreativesPage() {
  const [items, setItems] = useState<DemoCreative[] | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- leitura única de localStorage após a hidratação
    setItems(listDemoCreatives());
  }, []);
  if (!items) return <CreativesSkeleton />;
  return <CreativesScreen items={items} simulation />;
}
