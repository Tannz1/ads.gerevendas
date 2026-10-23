import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Versão fixada da Graph/Marketing API. A v21.0 da Marketing API expirou em 09/09/2025;
 * v25.0 é a versão de Marketing vigente em 23/10/2026 (developers.facebook.com/docs/graph-api/changelog/versions).
 */
export const META_GRAPH_VERSION = "v25.0";

export const META_REQUIRED_SCOPES = [
  "ads_management",
  "ads_read",
  "pages_show_list",
  "pages_read_engagement",
  "business_management",
] as const;

export type DiscoveredMetaAssets = {
  simulated: boolean;
  ad_accounts: Array<{
    id: string;
    name: string;
    account_status: number;
    currency: string;
    has_funding_source: boolean;
  }>;
  pages: Array<{
    id: string;
    name: string;
    instagram_actor_id?: string;
    whatsapp_phone_e164?: string;
  }>;
};

export function createOAuthState(orgId: string, secret: string): string {
  const nonce = randomBytes(12).toString("hex");
  const payload = `${orgId}.${nonce}`;
  const sig = createHmac("sha256", secret).update(payload).digest("hex");
  return `${payload}.${sig}`;
}

export function verifyOAuthState(state: string, expectedOrgId: string, secret: string): boolean {
  const parts = state.split(".");
  if (parts.length !== 3) return false;
  const [orgId, nonce, sig] = parts;
  if (orgId !== expectedOrgId || !nonce || !sig) return false;
  const payload = `${orgId}.${nonce}`;
  const expectedSig = createHmac("sha256", secret).update(payload).digest("hex");
  const bufA = Buffer.from(sig);
  const bufB = Buffer.from(expectedSig);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export function buildMetaAuthorizeUrl(params: { appId: string; redirectUri: string; state: string }): string {
  const url = new URL(`https://www.facebook.com/${META_GRAPH_VERSION}/dialog/oauth`);
  url.searchParams.set("client_id", params.appId);
  url.searchParams.set("redirect_uri", params.redirectUri);
  url.searchParams.set("state", params.state);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", META_REQUIRED_SCOPES.join(","));
  return url.toString();
}

/**
 * Troca o `code` OAuth por access_token server-side e consulta contas de anúncios e páginas.
 * O token NUNCA é enviado para o cliente (apenas a lista de ativos descobertos).
 */
export async function exchangeCodeAndDiscoverMetaAssets(params: {
  code: string;
  appId: string;
  appSecret: string;
  redirectUri: string;
}): Promise<DiscoveredMetaAssets> {
  const tokenUrl = new URL(`https://graph.facebook.com/${META_GRAPH_VERSION}/oauth/access_token`);
  tokenUrl.searchParams.set("client_id", params.appId);
  tokenUrl.searchParams.set("client_secret", params.appSecret);
  tokenUrl.searchParams.set("redirect_uri", params.redirectUri);
  tokenUrl.searchParams.set("code", params.code);

  const tokenRes = await fetch(tokenUrl, { method: "GET", cache: "no-store" });
  if (!tokenRes.ok) {
    throw new Error(`meta_oauth_token_exchange_failed:${tokenRes.status}`);
  }
  const tokenJson = (await tokenRes.json()) as { access_token?: string };
  if (!tokenJson.access_token) {
    throw new Error("meta_oauth_missing_access_token");
  }

  const headers = { Authorization: `Bearer ${tokenJson.access_token}` };

  const [adAccountsRes, pagesRes] = await Promise.all([
    fetch(
      `https://graph.facebook.com/${META_GRAPH_VERSION}/me/adaccounts?limit=100&fields=id,name,account_status,currency,funding_source`,
      { headers, cache: "no-store" },
    ),
    fetch(
      `https://graph.facebook.com/${META_GRAPH_VERSION}/me/accounts?limit=100&fields=id,name,instagram_business_account{id},whatsapp_number`,
      { headers, cache: "no-store" },
    ),
  ]);

  if (!adAccountsRes.ok || !pagesRes.ok) {
    throw new Error("meta_graph_discovery_failed");
  }

  const adAccountsData = (await adAccountsRes.json()) as {
    data?: Array<{
      id: string;
      name?: string;
      account_status?: number;
      currency?: string;
      funding_source?: string;
    }>;
  };

  const pagesData = (await pagesRes.json()) as {
    data?: Array<{
      id: string;
      name?: string;
      instagram_business_account?: { id?: string };
      whatsapp_number?: string;
    }>;
  };

  return {
    simulated: false,
    ad_accounts: (adAccountsData.data ?? []).map((acc) => ({
      id: acc.id.startsWith("act_") ? acc.id : `act_${acc.id}`,
      name: acc.name || acc.id,
      account_status: acc.account_status ?? 1,
      currency: acc.currency ?? "BRL",
      has_funding_source: Boolean(acc.funding_source),
    })),
    pages: (pagesData.data ?? []).map((pg) => ({
      id: pg.id,
      name: pg.name || pg.id,
      instagram_actor_id: pg.instagram_business_account?.id,
      whatsapp_phone_e164: pg.whatsapp_number,
    })),
  };
}

/**
 * Gera ativos descobertos simulados quando o projeto está em modo Simulação (sem META_APP_ID configurado).
 */
export function buildSimulatedDiscoveredAssets(
  businessName: string,
  defaultWhatsapp: string | null,
): DiscoveredMetaAssets {
  return {
    simulated: true,
    ad_accounts: [
      {
        id: "act_1020304050",
        name: `${businessName} — Conta de Anúncios (BRL)`,
        account_status: 1,
        currency: "BRL",
        has_funding_source: true,
      },
      {
        id: "act_5060708090",
        name: `${businessName} — Secundária`,
        account_status: 1,
        currency: "BRL",
        has_funding_source: false,
      },
    ],
    pages: [
      {
        id: "page_99887766",
        name: `${businessName} Oficial`,
        instagram_actor_id: "ig_44556677",
        whatsapp_phone_e164: defaultWhatsapp ?? "+5519999990000",
      },
    ],
  };
}
