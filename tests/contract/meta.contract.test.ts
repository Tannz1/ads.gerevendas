import { describe, expect, it } from "vitest";
import { parsePageLink } from "@/lib/meta-page-link";
import { META_GRAPH_VERSION } from "@/server/meta/graph";
import { RealMetaBusinessClient } from "@/server/meta/real-client";

// Prova cada chamada do ADR 0005 com o App em acesso padrão (sem App Review).
// Leituras rodam com META_BUSINESS_ID + META_SYSTEM_USER_TOKEN + META_APP_SECRET.
// Escritas exigem META_CONTRACT_WRITE=1 e as variáveis específicas de cada teste.
const env = process.env;
const ready = Boolean(env.META_BUSINESS_ID && env.META_SYSTEM_USER_TOKEN && env.META_APP_SECRET);
const write = env.META_CONTRACT_WRITE === "1";

const client = () =>
  new RealMetaBusinessClient({
    businessId: env.META_BUSINESS_ID!,
    accessToken: env.META_SYSTEM_USER_TOKEN!,
    appSecret: env.META_APP_SECRET!,
    timezoneId: env.META_AD_ACCOUNT_TIMEZONE_ID ? Number(env.META_AD_ACCOUNT_TIMEZONE_ID) : undefined,
  });

const report = (label: string, value: unknown) => console.info(`[contrato ${META_GRAPH_VERSION}] ${label}:`, value);

describe.skipIf(!ready)(`Contrato Meta ${META_GRAPH_VERSION} — leituras`, () => {
  it("lista as contas de anúncios da BM (owned_ad_accounts)", async () => {
    const accounts = await client().listBusinessAdAccounts();
    report(
      "contas da BM",
      accounts.map((a) => ({ id: a.id, status: a.account_status, currency: a.currency })),
    );
    expect(Array.isArray(accounts)).toBe(true);
  });

  it.skipIf(!env.META_CONTRACT_AD_ACCOUNT_ID)("lê forma de pagamento da conta (funding_source)", async () => {
    const funding = await client().getFunding(env.META_CONTRACT_AD_ACCOUNT_ID!);
    report("pagamento", funding);
    expect(typeof funding.has_funding_source).toBe("boolean");
  });

  it.skipIf(!env.META_CONTRACT_PAGE_URL)("encontra a Página compartilhada como parceiro (client_pages)", async () => {
    const ref = parsePageLink(env.META_CONTRACT_PAGE_URL!);
    expect(ref).not.toBeNull();
    const page = await client().findClientPage(ref!);
    report("Página", page);
    expect(page).not.toBeNull();
  });

  it.skipIf(!env.META_CONTRACT_INSTAGRAM)("encontra o Instagram compartilhado (client_instagram_assets)", async () => {
    const ig = await client().findClientInstagram(env.META_CONTRACT_INSTAGRAM!.replace(/^@/, ""));
    report("Instagram", ig);
    expect(ig).not.toBeNull();
  });

  it.skipIf(!env.META_CONTRACT_INVITE_EMAIL)(
    "consulta o convite do e-mail (business_users / pending_users)",
    async () => {
      const invite = await client().getBusinessUserInvite(env.META_CONTRACT_INVITE_EMAIL!);
      report("convite", invite);
      expect(["pending", "accepted", "expired"]).toContain(invite.status);
    },
  );
});

describe.skipIf(!ready || !write)(`Contrato Meta ${META_GRAPH_VERSION} — escritas reais`, () => {
  it.skipIf(!env.META_CONTRACT_INVITE_EMAIL || env.META_CONTRACT_SKIP_INVITE === "1")(
    "convida o e-mail para a BM como EMPLOYEE",
    async () => {
      await client().inviteBusinessUser(env.META_CONTRACT_INVITE_EMAIL!);
      report("convite enviado para", env.META_CONTRACT_INVITE_EMAIL);
    },
  );

  it.skipIf(!env.META_CONTRACT_AD_ACCOUNT_ID)("renomeia a conta de teste", async () => {
    await client().renameAdAccount(env.META_CONTRACT_AD_ACCOUNT_ID!, "GereVendas Ads — teste de contrato");
  });

  it.skipIf(!env.META_CONTRACT_AD_ACCOUNT_ID || !env.META_CONTRACT_BUSINESS_USER_ID)(
    "atribui MANAGE ao usuário da BM na conta (assigned_users)",
    async () => {
      await client().assignAdAccountUser(env.META_CONTRACT_AD_ACCOUNT_ID!, env.META_CONTRACT_BUSINESS_USER_ID!);
    },
  );

  it.skipIf(env.META_CONTRACT_CREATE_ACCOUNT !== "1")("cria 1 conta pela API (gasta 1 da cota de 5)", async () => {
    const account = await client().createAdAccount({ name: "GereVendas Ads — teste de contrato" });
    report("conta criada", account);
    expect(account.id).toMatch(/^act_/);
  });
});
