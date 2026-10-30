import "server-only";

type Bucket = {
  list(prefix: string, options: { limit: number }): Promise<{ data: { name: string }[] | null; error: unknown }>;
  remove(paths: string[]): Promise<{ data: unknown[] | null; error: unknown }>;
};

/**
 * Apaga os arquivos de uma empresa (`<org>/<arquivo>`) num bucket. A exclusão no banco não alcança
 * o Storage, então sem isso logotipo, fotos, rosto do avatar e vídeos ficariam órfãos (LGPD).
 * Retorna quantos arquivos removeu.
 */
export async function removeOrganizationFiles(bucket: Bucket, orgId: string): Promise<number> {
  let removed = 0;
  for (;;) {
    const listed = await bucket.list(orgId, { limit: 1000 });
    if (listed.error) throw listed.error;
    if (!listed.data?.length) return removed;
    const res = await bucket.remove(listed.data.map((f) => `${orgId}/${f.name}`));
    if (res.error) throw res.error;
    // Nada removido apesar de listado: para em vez de repetir para sempre.
    if (!res.data?.length) throw new Error("storage_remove_noop");
    removed += res.data.length;
  }
}
