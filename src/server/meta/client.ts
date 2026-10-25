import type { PageRef } from "@/lib/meta-page-link";

export type MetaAdAccount = { id: string; name: string; account_status: number; currency: string };
export type MetaClientPage = { id: string; name: string; username: string | null; link: string | null };
export type MetaInstagramAsset = { id: string; username: string | null };
export type MetaInvite = { status: "pending" | "accepted" | "expired"; business_user_id: string | null };
export type MetaFunding = { has_funding_source: boolean; account_status: number };

/**
 * Operações da BM da GereVendas na Meta. Só ativos da própria BM (contas dela e Páginas/Instagram
 * compartilhados com ela); nenhuma chamada usa token de cliente (ADR 0005).
 */
export interface MetaBusinessClient {
  readonly simulated: boolean;
  createAdAccount(input: { name: string }): Promise<MetaAdAccount>;
  listBusinessAdAccounts(): Promise<MetaAdAccount[]>;
  renameAdAccount(adAccountId: string, name: string): Promise<void>;
  findClientPage(ref: PageRef): Promise<MetaClientPage | null>;
  findClientInstagram(username: string): Promise<MetaInstagramAsset | null>;
  inviteBusinessUser(email: string): Promise<void>;
  getBusinessUserInvite(email: string): Promise<MetaInvite>;
  assignAdAccountUser(adAccountId: string, businessUserId: string): Promise<void>;
  getFunding(adAccountId: string): Promise<MetaFunding>;
}
