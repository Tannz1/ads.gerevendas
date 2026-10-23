import { describe, expect, it } from "vitest";
import { suggestAssets } from "@/lib/meta-asset-match";
import type { DiscoveredMetaAssets } from "@/lib/meta-oauth";

const acc = (id: string, name: string, extra: Partial<DiscoveredMetaAssets["ad_accounts"][number]> = {}) => ({
  id,
  name,
  account_status: 1,
  currency: "BRL",
  has_funding_source: true,
  ...extra,
});
const page = (id: string, name: string, whatsapp?: string) => ({ id, name, whatsapp_phone_e164: whatsapp });
const business = { name: "TESTE V4", whatsapp: "+5547999990000" };

describe("sugestão de conta e página do negócio", () => {
  it("sugere pelo nome, ignorando acento, caixa e espaços", () => {
    const s = suggestAssets(
      {
        simulated: false,
        ad_accounts: [acc("act_1", "Padaria Central"), acc("act_2", "TesteV4 Anúncios")],
        pages: [page("1", "Padaria Central"), page("2", "Teste V4")],
      },
      business,
    );
    expect(s.account?.id).toBe("act_2");
    expect(s.page?.id).toBe("2");
  });

  it("prefere a página com o WhatsApp do cadastro, mesmo sem DDI", () => {
    const s = suggestAssets(
      {
        simulated: false,
        ad_accounts: [acc("act_1", "Conta")],
        pages: [page("1", "Teste V4 antiga"), page("2", "Outro nome", "47999990000")],
      },
      business,
    );
    expect(s.page?.id).toBe("2");
  });

  it("não sugere quando há empate ou nada parecido", () => {
    const s = suggestAssets(
      {
        simulated: false,
        ad_accounts: [acc("act_1", "Cliente A"), acc("act_2", "Cliente B")],
        pages: [page("1", "Teste V4 Centro"), page("2", "Teste V4 Praia")],
      },
      business,
    );
    expect(s.account).toBeNull();
    expect(s.page).toBeNull();
  });

  it("esconde contas inativas ou fora de BRL e escolhe direto quando sobra uma", () => {
    const s = suggestAssets(
      {
        simulated: false,
        ad_accounts: [
          acc("act_1", "Desativada", { account_status: 2 }),
          acc("act_2", "Dólar", { currency: "USD" }),
          acc("act_3", "Minha conta"),
        ],
        pages: [page("1", "Qualquer")],
      },
      business,
    );
    expect(s.accounts.map((a) => a.id)).toEqual(["act_3"]);
    expect(s.hiddenAccounts).toBe(2);
    expect(s.account?.id).toBe("act_3");
    expect(s.page?.id).toBe("1");
  });
});
