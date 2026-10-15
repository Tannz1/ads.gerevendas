import { Badge } from "@/components/ui/badge";
import { getAppContext } from "@/server/context";
import { signOut } from "@/server/auth";

export async function UserMenu() {
  const ctx = await getAppContext();
  if (ctx.mode === "demo") {
    return <Badge tone="demo">DEMO</Badge>;
  }
  return (
    <div className="flex min-w-0 items-center gap-3">
      <div className="hidden min-w-0 text-right leading-tight sm:block">
        <p className="truncate text-sm font-semibold">{ctx.organization?.name ?? "Sem empresa"}</p>
        <p className="truncate text-xs text-ink-faint">{ctx.user.email}</p>
      </div>
      <form action={signOut}>
        <button
          type="submit"
          className="rounded-lg px-3 py-2 text-sm font-medium text-ink-soft hover:bg-surface-muted hover:text-ink"
        >
          Sair
        </button>
      </form>
    </div>
  );
}
