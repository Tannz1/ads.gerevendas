import { describe, expect, it, vi } from "vitest";
import { activateWithCompensation } from "@/server/meta/execution";
import { MockMetaBusinessClient } from "@/server/meta/mock-client";
import type { MetaBusinessClient } from "@/server/meta/client";

const ids = { campaignId: "campaign", adsetId: "adset", adIds: ["ad"] };

describe("ativação com compensação", () => {
  it("ativa filhos antes da campanha e só então grava", async () => {
    const client: MetaBusinessClient = new MockMetaBusinessClient();
    const calls: string[] = [];
    vi.spyOn(client, "setStatus").mockImplementation(async (id, status) => {
      calls.push(`${id}:${status}`);
    });
    await activateWithCompensation(client, ids, async () => {
      calls.push("commit");
    });
    expect(calls).toEqual(["ad:ACTIVE", "adset:ACTIVE", "campaign:ACTIVE", "commit"]);
  });
  it("pausa mesmo quando a RPC lança uma exceção", async () => {
    const client: MetaBusinessClient = new MockMetaBusinessClient();
    const status = vi.spyOn(client, "setStatus");
    await expect(
      activateWithCompensation(client, ids, async () => {
        throw new Error("timeout");
      }),
    ).rejects.toThrow("timeout");
    expect(status).toHaveBeenLastCalledWith("campaign", "PAUSED");
  });
  it("uma resposta perdida na ativação também exige pausa", async () => {
    const client: MetaBusinessClient = new MockMetaBusinessClient();
    const status = vi.spyOn(client, "setStatus").mockImplementation(async (id, state) => {
      if (id === "campaign" && state === "ACTIVE") throw new Error("network");
    });
    const commit = vi.fn();
    await expect(activateWithCompensation(client, ids, commit)).rejects.toThrow("network");
    expect(commit).not.toHaveBeenCalled();
    expect(status).toHaveBeenLastCalledWith("campaign", "PAUSED");
  });
  it("não esconde falha ao compensar: exige recuperação", async () => {
    const client: MetaBusinessClient = new MockMetaBusinessClient();
    vi.spyOn(client, "setStatus").mockRejectedValue(new Error("offline"));
    await expect(activateWithCompensation(client, ids, vi.fn())).rejects.toThrow("activation_recovery_required");
  });
});
