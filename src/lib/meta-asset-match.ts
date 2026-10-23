import type { DiscoveredMetaAssets } from "./meta-oauth";

type Account = DiscoveredMetaAssets["ad_accounts"][number];
type Page = DiscoveredMetaAssets["pages"][number];

export type AssetSuggestion = {
  /** Contas utilizáveis: ativas e em reais (o app trabalha com orçamento em BRL). */
  accounts: Account[];
  pages: Page[];
  hiddenAccounts: number;
  account: Account | null;
  page: Page | null;
};

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

function nameScore(candidate: string, business: string): number {
  const a = norm(candidate);
  const b = norm(business);
  if (!a || !b) return 0;
  if (a === b) return 3;
  return a.includes(b) || b.includes(a) ? 2 : 0;
}

const digits = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");
// Com ou sem DDI: compara pelo final do número.
const samePhone = (a: string, b: string) => a.length >= 10 && b.length >= 10 && (a.endsWith(b) || b.endsWith(a));

/** A única opção, ou a única com a maior nota acima de zero. Empate ou nenhuma nota: sem sugestão. */
function pick<T>(items: T[], score: (item: T) => number): T | null {
  if (items.length === 1) return items[0];
  let best: T | null = null;
  let bestScore = 0;
  let tie = false;
  for (const item of items) {
    const s = score(item);
    if (s > bestScore) {
      best = item;
      bestScore = s;
      tie = false;
    } else if (s > 0 && s === bestScore) {
      tie = true;
    }
  }
  return tie ? null : best;
}

/**
 * Sugere a conta e a página do próprio negócio entre o que a Meta devolveu, para o cliente
 * confirmar em vez de procurar numa lista. Página: WhatsApp do cadastro, depois nome. Conta: nome.
 */
export function suggestAssets(
  assets: DiscoveredMetaAssets,
  business: { name: string; whatsapp: string | null },
): AssetSuggestion {
  const accounts = assets.ad_accounts.filter((a) => a.account_status === 1 && a.currency === "BRL");
  const whatsapp = digits(business.whatsapp);
  return {
    accounts,
    pages: assets.pages,
    hiddenAccounts: assets.ad_accounts.length - accounts.length,
    account: pick(accounts, (a) => nameScore(a.name, business.name)),
    page: pick(assets.pages, (p) =>
      whatsapp && samePhone(digits(p.whatsapp_phone_e164), whatsapp) ? 4 : nameScore(p.name, business.name),
    ),
  };
}
