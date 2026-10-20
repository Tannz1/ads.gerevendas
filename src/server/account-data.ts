import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ConsentKind, InviteRole, InviteStatus } from "@/contracts/account";
import type { MemberRole } from "./context";
import { ASSETS_BUCKET } from "./creatives-data";

export type MemberView = {
  user_id: string;
  role: MemberRole;
  created_at: string;
};

export type InviteView = {
  id: string;
  email: string;
  role: InviteRole;
  token: string;
  status: InviteStatus;
  expires_at: string;
  created_at: string;
};

export type BusinessLogoView = {
  id: string;
  name: string;
  logo_url: string | null;
};

export type AccountManagementData = {
  members: MemberView[];
  invites: InviteView[];
  consents: ConsentKind[];
  business: BusinessLogoView | null;
};

export async function loadAccountManagementData(
  organizationId: string,
  userId: string,
  canManageTeam: boolean,
): Promise<AccountManagementData> {
  const supabase = await createSupabaseServerClient();

  const [membersRes, invitesRes, consentsRes, businessRes] = await Promise.all([
    supabase
      .from("organization_members")
      .select("user_id, role, created_at")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: true }),
    canManageTeam
      ? supabase
          .from("organization_invites")
          .select("id, email, role, token, status, expires_at, created_at")
          .eq("organization_id", organizationId)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] }),
    supabase.from("user_consents").select("kind").eq("organization_id", organizationId).eq("user_id", userId),
    supabase
      .from("businesses")
      .select("id, name, assets!businesses_logo_asset_fk(storage_path)")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  let logoUrl: string | null = null;
  const biz = businessRes.data as unknown as {
    id: string;
    name: string;
    assets: { storage_path: string } | null;
  } | null;

  if (biz?.assets?.storage_path) {
    const { data: signed } = await supabase.storage.from(ASSETS_BUCKET).createSignedUrl(biz.assets.storage_path, 3600);
    logoUrl = signed?.signedUrl ?? null;
  }

  return {
    members: (membersRes.data ?? []) as MemberView[],
    invites: (invitesRes.data ?? []) as InviteView[],
    consents: (consentsRes.data ?? []).map((c) => c.kind as ConsentKind),
    business: biz ? { id: biz.id, name: biz.name, logo_url: logoUrl } : null,
  };
}

export type InspectedInvite = {
  id: string;
  organization_id: string;
  organization_name: string;
  email: string;
  role: InviteRole;
  status: InviteStatus;
  expired: boolean;
};

export async function inspectInviteByToken(token: string): Promise<InspectedInvite | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("inspect_organization_invite", { p_token: token });
  if (error || !data) return null;
  return data as InspectedInvite;
}
