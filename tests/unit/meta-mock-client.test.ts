import { describe, expect, it } from "vitest";
import { MockMetaBusinessClient } from "@/server/meta/mock-client";

describe("MockMetaBusinessClient", () => {
  const client = new MockMetaBusinessClient();

  it("é rotulado como simulação e gera IDs determinísticos", async () => {
    expect(client.simulated).toBe(true);
    const a = await client.findClientPage({ kind: "username", username: "padaria" });
    const b = await client.findClientPage({ kind: "username", username: "padaria" });
    expect(a?.id).toBe(b?.id);
    expect(a?.id.startsWith("sim_page_")).toBe(true);
  });

  it("simula Página e Instagram não compartilhados", async () => {
    expect(await client.findClientPage({ kind: "username", username: "nao-compartilhada" })).toBeNull();
    expect(await client.findClientInstagram("nao_compartilhado")).toBeNull();
  });

  it("contas simuladas têm formato act_", async () => {
    for (const acc of await client.listBusinessAdAccounts()) expect(acc.id).toMatch(/^act_[0-9A-Za-z_]{3,60}$/);
    expect((await client.createAdAccount({ name: "Estoque" })).id).toMatch(/^act_sim_/);
  });
});
