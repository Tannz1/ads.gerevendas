import { z } from "zod";
import { matchesPage, type PageRef } from "@/lib/meta-page-link";
import type {
  MetaAdAccount,
  MetaBusinessClient,
  MetaClientPage,
  MetaFunding,
  MetaInstagramAsset,
  MetaInvite,
} from "./client";
import { MetaError, mapGraphError } from "./errors";
import { appSecretProof, META_GRAPH_BASE } from "./graph";

export type RealClientConfig = {
  businessId: string;
  accessToken: string;
  appSecret: string;
  timezoneId?: number;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  retryDelayMs?: number;
};

const MAX_PAGES = 10;

const listSchema = <T extends z.ZodType>(item: T) =>
  z.object({
    data: z.array(item),
    paging: z
      .object({ cursors: z.object({ after: z.string().optional() }).optional(), next: z.string().optional() })
      .optional(),
  });

const adAccountRaw = z.object({
  id: z.string(),
  name: z.string().optional(),
  account_status: z.number().optional(),
  currency: z.string().optional(),
});
const pageRaw = z.object({
  id: z.string(),
  name: z.string().optional(),
  username: z.string().nullish(),
  link: z.string().nullish(),
});
const instagramRaw = z.object({ id: z.string(), username: z.string().nullish() });
const businessUserRaw = z.object({ id: z.string(), email: z.string().nullish() });
const pendingUserRaw = z.object({ id: z.string(), email: z.string().nullish(), status: z.string().nullish() });
const fundingRaw = z.object({ funding_source: z.string().nullish(), account_status: z.number().optional() });
const createdRaw = z.object({ id: z.string() });

const toAdAccount = (a: z.infer<typeof adAccountRaw>): MetaAdAccount => ({
  id: a.id.startsWith("act_") ? a.id : `act_${a.id}`,
  name: a.name || a.id,
  account_status: a.account_status ?? 0,
  currency: a.currency ?? "BRL",
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class RealMetaBusinessClient implements MetaBusinessClient {
  readonly simulated = false;

  constructor(private readonly cfg: RealClientConfig) {}

  /** Uma chamada à Graph API. Leituras têm 1 nova tentativa para 5xx/limite; escritas nunca repetem. */
  private async call(method: "GET" | "POST", path: string, params: Record<string, string> = {}): Promise<unknown> {
    const url = new URL(`${META_GRAPH_BASE}/${path.replace(/^\//, "")}`);
    const form = new URLSearchParams({
      ...params,
      appsecret_proof: appSecretProof(this.cfg.accessToken, this.cfg.appSecret),
    });
    if (method === "GET") form.forEach((v, k) => url.searchParams.set(k, v));
    const attempts = method === "GET" ? 2 : 1;
    const doFetch = this.cfg.fetchImpl ?? fetch;
    const delay = this.cfg.retryDelayMs ?? 500;

    for (let i = 0; i < attempts; i++) {
      const last = i + 1 === attempts;
      let res: Response;
      try {
        res = await doFetch(url, {
          method,
          headers: {
            Authorization: `Bearer ${this.cfg.accessToken}`,
            ...(method === "POST" ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
          },
          body: method === "POST" ? form.toString() : undefined,
          signal: AbortSignal.timeout(this.cfg.timeoutMs ?? 15_000),
        });
      } catch {
        if (!last) {
          await sleep(delay);
          continue;
        }
        throw new MetaError("meta_unavailable");
      }
      const json: unknown = await res.json().catch(() => null);
      if (res.ok) return json;
      const err = mapGraphError(res.status, json);
      if (!last && (err.code === "meta_unavailable" || err.code === "rate_limited")) {
        await sleep(delay * (i + 1));
        continue;
      }
      throw err;
    }
    throw new MetaError("meta_unavailable");
  }

  private async listAll<T extends z.ZodType>(path: string, fields: string, item: T): Promise<z.infer<T>[]> {
    const out: z.infer<T>[] = [];
    let after: string | undefined;
    for (let page = 0; page < MAX_PAGES; page++) {
      const params: Record<string, string> = { fields, limit: "100" };
      if (after) params.after = after;
      const parsed = listSchema(item).safeParse(await this.call("GET", path, params));
      if (!parsed.success) throw new MetaError("unknown");
      out.push(...parsed.data.data);
      after = parsed.data.paging?.cursors?.after;
      if (!parsed.data.paging?.next || !after) break;
    }
    return out;
  }

  private parse<T extends z.ZodType>(schema: T, value: unknown): z.infer<T> {
    const parsed = schema.safeParse(value);
    if (!parsed.success) throw new MetaError("unknown");
    return parsed.data;
  }

  async createAdAccount({ name }: { name: string }): Promise<MetaAdAccount> {
    if (!this.cfg.timezoneId) throw new MetaError("config_missing");
    const created = this.parse(
      createdRaw,
      await this.call("POST", `${this.cfg.businessId}/adaccount`, {
        name,
        currency: "BRL",
        timezone_id: String(this.cfg.timezoneId),
        end_advertiser: "NONE",
        media_agency: "NONE",
        partner: "NONE",
      }),
    );
    return toAdAccount({ id: created.id, name, account_status: 1, currency: "BRL" });
  }

  async listBusinessAdAccounts(): Promise<MetaAdAccount[]> {
    const rows = await this.listAll(
      `${this.cfg.businessId}/owned_ad_accounts`,
      "id,name,account_status,currency",
      adAccountRaw,
    );
    return rows.map(toAdAccount);
  }

  async renameAdAccount(adAccountId: string, name: string): Promise<void> {
    await this.call("POST", adAccountId, { name });
  }

  async findClientPage(ref: PageRef): Promise<MetaClientPage | null> {
    const pages = await this.listAll(`${this.cfg.businessId}/client_pages`, "id,name,username,link", pageRaw);
    const found = pages.find((p) => matchesPage(ref, p));
    return found
      ? { id: found.id, name: found.name || found.id, username: found.username ?? null, link: found.link ?? null }
      : null;
  }

  async findClientInstagram(username: string): Promise<MetaInstagramAsset | null> {
    const wanted = username.toLowerCase();
    const assets = await this.listAll(`${this.cfg.businessId}/client_instagram_assets`, "id,username", instagramRaw);
    const found = assets.find((a) => a.username?.toLowerCase() === wanted);
    return found ? { id: found.id, username: found.username ?? null } : null;
  }

  async inviteBusinessUser(email: string): Promise<void> {
    await this.call("POST", `${this.cfg.businessId}/business_users`, { email, role: "EMPLOYEE" });
  }

  async getBusinessUserInvite(email: string): Promise<MetaInvite> {
    const wanted = email.toLowerCase();
    const users = await this.listAll(`${this.cfg.businessId}/business_users`, "id,email", businessUserRaw);
    const user = users.find((u) => u.email?.toLowerCase() === wanted);
    if (user) return { status: "accepted", business_user_id: user.id };
    const pending = await this.listAll(`${this.cfg.businessId}/pending_users`, "id,email,status", pendingUserRaw);
    const invite = pending.find((u) => u.email?.toLowerCase() === wanted);
    if (invite && (invite.status ?? "PENDING").toUpperCase() === "PENDING") {
      return { status: "pending", business_user_id: null };
    }
    return { status: "expired", business_user_id: null };
  }

  async assignAdAccountUser(adAccountId: string, businessUserId: string): Promise<void> {
    await this.call("POST", `${adAccountId}/assigned_users`, {
      user: businessUserId,
      tasks: JSON.stringify(["MANAGE", "ADVERTISE", "ANALYZE"]),
    });
  }

  async getFunding(adAccountId: string): Promise<MetaFunding> {
    const raw = this.parse(
      fundingRaw,
      await this.call("GET", adAccountId, { fields: "funding_source,account_status" }),
    );
    return { has_funding_source: Boolean(raw.funding_source), account_status: raw.account_status ?? 0 };
  }
}
