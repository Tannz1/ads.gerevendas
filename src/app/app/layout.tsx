import type { Metadata } from "next";
import { Suspense } from "react";
import { MobileNav, Sidebar } from "@/components/shell/app-nav";
import { OrgGate } from "@/components/shell/org-gate";
import { UserMenu } from "@/components/shell/user-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { isSupabaseConfigured } from "@/lib/public-env";

export const metadata: Metadata = { title: { default: "Início", template: "%s · GereVendas Ads" } };

function PilotNote() {
  return (
    <div className="rounded-xl border border-line bg-surface-muted/70 p-3 text-xs leading-relaxed text-ink-soft">
      <div className="flex items-center gap-1.5 font-semibold text-ink">
        <span className="size-2 rounded-full bg-accent" />
        Piloto em andamento
      </div>
      <p className="mt-1 text-ink-faint">Criativos disponíveis; publicação na Meta em modo Simulação.</p>
    </div>
  );
}

export default function AppLayout({ children }: LayoutProps<"/app">) {
  const demo = !isSupabaseConfigured();
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[256px_1fr]">
      <Sidebar footer={<PilotNote />} />
      <div className="min-w-0">
        {demo && (
          <div
            role="status"
            className="border-b border-accent/50 bg-accent-soft px-4 py-2 text-center text-sm text-warning"
          >
            <strong>Modo demonstração.</strong> Dados ficam só neste navegador; nada é enviado a servidores.
          </div>
        )}
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-4 border-b border-line bg-canvas/85 px-4 backdrop-blur sm:px-8">
          <MobileNav footer={<PilotNote />} />
          <div className="ml-auto">
            <Suspense fallback={<Skeleton className="h-8 w-40" />}>
              <UserMenu />
            </Suspense>
          </div>
        </header>
        <main className="px-4 py-8 sm:px-8 sm:py-10">
          <Suspense fallback={<Skeleton className="mx-auto h-96 max-w-5xl" />}>
            <OrgGate>{children}</OrgGate>
          </Suspense>
        </main>
      </div>
    </div>
  );
}
