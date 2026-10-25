import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PoolPanel } from "@/components/meta/pool-panel";
import { serverEnv } from "@/lib/env";
import { resolveFlags } from "@/lib/flags";
import { getAppContext } from "@/server/context";
import { isPlatformOperator, loadPool } from "@/server/meta/data";
import { resolveMetaBusinessMode } from "@/server/meta/mode";

export const metadata: Metadata = { title: "Estoque de contas" };

export default async function PoolPage() {
  const ctx = await getAppContext();
  if (ctx.mode !== "supabase" || !(await isPlatformOperator())) notFound();

  const env = serverEnv();
  const mode = resolveMetaBusinessMode(env, resolveFlags(env));
  const simulated = mode.kind !== "real";
  const { overview, accounts } = await loadPool(simulated);
  const disabledMessage =
    mode.kind === "disabled"
      ? mode.reason === "kill_switch"
        ? "Kill switch ligado: nenhuma chamada à Meta."
        : `Modo real sem configuração. Faltam: ${(mode.missing ?? []).join(", ")}.`
      : null;

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="font-display text-3xl font-bold tracking-tight">Estoque de contas de anúncios</h1>
      <p className="mt-1 text-[15px] text-ink-soft">Contas da BM da GereVendas reservadas para clientes.</p>
      <PoolPanel
        overview={overview}
        accounts={accounts}
        simulated={simulated}
        minAvailable={env.META_POOL_MIN_AVAILABLE}
        disabledMessage={disabledMessage}
      />
    </div>
  );
}
