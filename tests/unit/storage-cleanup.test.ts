import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { removeOrganizationFiles } from "@/server/storage-cleanup";

function fakeBucket(files: string[], { noop = false } = {}) {
  const store = new Set(files);
  return {
    store,
    list: vi.fn(async (prefix: string, { limit }: { limit: number }) => ({
      data: [...store]
        .filter((p) => p.startsWith(`${prefix}/`))
        .slice(0, limit)
        .map((p) => ({ name: p.slice(prefix.length + 1) })),
      error: null,
    })),
    remove: vi.fn(async (paths: string[]) => {
      if (noop) return { data: [], error: null };
      paths.forEach((p) => store.delete(p));
      return { data: paths.map((name) => ({ name })), error: null };
    }),
  };
}

describe("removeOrganizationFiles", () => {
  it("apaga todos os arquivos da empresa em lotes e preserva os de outras", async () => {
    const own = Array.from({ length: 1500 }, (_, i) => `org-a/${i}.png`);
    const bucket = fakeBucket([...own, "org-b/logo.png"]);

    await expect(removeOrganizationFiles(bucket, "org-a")).resolves.toBe(1500);
    expect(bucket.remove).toHaveBeenCalledTimes(2);
    expect([...bucket.store]).toEqual(["org-b/logo.png"]);
  });

  it("não faz nada quando a empresa não tem arquivos", async () => {
    const bucket = fakeBucket([]);
    await expect(removeOrganizationFiles(bucket, "org-a")).resolves.toBe(0);
    expect(bucket.remove).not.toHaveBeenCalled();
  });

  it("falha em vez de repetir para sempre quando o Storage não remove", async () => {
    const bucket = fakeBucket(["org-a/x.mp4"], { noop: true });
    await expect(removeOrganizationFiles(bucket, "org-a")).rejects.toThrow("storage_remove_noop");
  });
});
