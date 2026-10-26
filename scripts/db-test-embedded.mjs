// PostgreSQL em memória para validar SQL/RLS no Windows sem tocar em um Supabase remoto.
// O CI mantém o teste nativo; esta alternativa não prova concorrência entre conexões.
import { PGlite } from "@electric-sql/pglite";
import { readdir, readFile } from "node:fs/promises";

const db = await PGlite.create();
try {
  await db.exec(await readFile("supabase/rls-tests/00_auth_stub.sql", "utf8"));
  for (const file of (await readdir("supabase/migrations")).filter((f) => f.endsWith(".sql")).sort()) {
    console.info(`migration: ${file}`);
    await db.exec(await readFile(`supabase/migrations/${file}`, "utf8"));
  }
  for (const file of (await readdir("supabase/rls-tests")).filter((f) => f.endsWith(".test.sql")).sort()) {
    console.info(`test: ${file}`);
    await db.exec(await readFile(`supabase/rls-tests/${file}`, "utf8"));
  }
  console.info("Migrations e testes de RLS passaram no PostgreSQL embarcado.");
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await db.close();
}
