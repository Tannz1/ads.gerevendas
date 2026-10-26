import type { MetaBusinessClient } from "./client";

/** Se uma resposta se perder, primeiro confirma a pausa; nunca presume que a ativação falhou. */
export async function activateWithCompensation<T>(
  client: MetaBusinessClient,
  ids: { campaignId: string; adsetId: string; adIds: string[] },
  commit: () => Promise<T>,
  onCompensated: () => Promise<void> = async () => {},
): Promise<T> {
  try {
    for (const id of ids.adIds) await client.setStatus(id, "ACTIVE");
    await client.setStatus(ids.adsetId, "ACTIVE");
    await client.setStatus(ids.campaignId, "ACTIVE");
    return await commit();
  } catch (cause) {
    try {
      await client.setStatus(ids.campaignId, "PAUSED");
      await onCompensated();
    } catch {
      throw new Error("activation_recovery_required", { cause });
    }
    throw cause;
  }
}
