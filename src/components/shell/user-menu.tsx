import { Badge } from "@/components/ui/badge";
import { getAppContext } from "@/server/context";
import { signOut } from "@/server/auth";

export async function UserMenu() {
  const ctx = await getAppContext();
  if (ctx.mode === "demo") {
    return <Badge tone="demo">DEMO</Badge>;
  }
  const orgInitial = ctx.organization?.name?.trim().charAt(0).toUpperCase() || "E";
  return (
    <div className="flex min-w-0 items-center gap-3">
      <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-soft font-display text-xs font-bold text-brand-strong ring-1 ring-brand/20">
        {orgInitial}
      </div>
      <div className="hidden min-w-0 text-left leading-tight sm:block">
        <p className="truncate text-sm font-semibold text-ink">{ctx.organization?.name ?? "Sem empresa"}</p>
        <p className="truncate text-xs text-ink-faint">{ctx.user.email}</p>
      </div>
      <form action={signOut} className="ml-1">
        <button
          type="submit"
          className="rounded-lg border border-line-strong bg-surface px-2.5 py-1.5 text-xs font-semibold text-ink-soft transition-colors hover:bg-surface-muted hover:text-ink active:scale-95"
        >
          Sair
        </button>
      </form>
    </div>
  );
}
