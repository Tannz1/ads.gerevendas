import { createHash, randomBytes } from "node:crypto";
import type { PageRef } from "@/lib/meta-page-link";
import type {
  MetaAdAccount,
  MetaBusinessClient,
  MetaClientPage,
  MetaFunding,
  MetaInstagramAsset,
  MetaInvite,
} from "./client";

const digest = (value: string) => createHash("sha256").update(value).digest("hex").slice(0, 12);

/**
 * Simulação rotulada (AGENTS.md): nada sai para a Meta. Para testar o caminho de erro, use um link
 * com "nao-compartilhada" ou um @ com "nao_compartilhado".
 */
export class MockMetaBusinessClient implements MetaBusinessClient {
  readonly simulated = true;

  async createAdAccount({ name }: { name: string }): Promise<MetaAdAccount> {
    return { id: `act_sim_${randomBytes(4).toString("hex")}`, name, account_status: 1, currency: "BRL" };
  }

  async listBusinessAdAccounts(): Promise<MetaAdAccount[]> {
    return [1, 2, 3].map((n) => ({
      id: `act_sim_000${n}`,
      name: `Conta simulada ${n}`,
      account_status: 1,
      currency: "BRL",
    }));
  }

  async renameAdAccount(): Promise<void> {}

  async findClientPage(ref: PageRef): Promise<MetaClientPage | null> {
    const key = ref.kind === "id" ? ref.id : ref.username;
    if (key.includes("nao-compartilhada")) return null;
    return {
      id: `sim_page_${digest(key)}`,
      name: ref.kind === "username" ? `Página simulada @${ref.username}` : `Página simulada ${ref.id}`,
      username: ref.kind === "username" ? ref.username : null,
      link: null,
    };
  }

  async findClientInstagram(username: string): Promise<MetaInstagramAsset | null> {
    if (username.includes("nao_compartilhado")) return null;
    return { id: `sim_ig_${digest(username)}`, username };
  }

  async inviteBusinessUser(): Promise<void> {}

  async getBusinessUserInvite(email: string): Promise<MetaInvite> {
    return { status: "accepted", business_user_id: `sim_bsu_${digest(email.toLowerCase())}` };
  }

  async assignAdAccountUser(): Promise<void> {}

  async getFunding(): Promise<MetaFunding> {
    return { has_funding_source: true, account_status: 1 };
  }
}
