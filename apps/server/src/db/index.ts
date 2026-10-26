import path from "node:path";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "./schema";

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;
export { schema };

const migrationsFolder = path.resolve(import.meta.dirname, "migrations");

/** Боевая база: PostgreSQL по DATABASE_URL; миграции применяются сразу. */
export async function connectPostgres(url: string): Promise<{ db: Db; close: () => Promise<void> }> {
  const { default: postgres } = await import("postgres");
  const { drizzle } = await import("drizzle-orm/postgres-js");
  const { migrate } = await import("drizzle-orm/postgres-js/migrator");
  const client = postgres(url, { max: 10, onnotice: () => {} });
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder });
  return { db: db as unknown as Db, close: () => client.end() };
}

let template: Promise<Blob | File> | undefined;

/** Снимок базы с применёнными миграциями: делается один раз на процесс (в тестах — на файл). */
function migratedTemplate(): Promise<Blob | File> {
  template ??= (async () => {
    const { PGlite } = await import("@electric-sql/pglite");
    const { drizzle } = await import("drizzle-orm/pglite");
    const { migrate } = await import("drizzle-orm/pglite/migrator");
    const pg = new PGlite();
    await migrate(drizzle(pg, { schema }), { migrationsFolder });
    const dump = await pg.dumpDataDir("none");
    await pg.close();
    return dump;
  })();
  return template;
}

/** База в памяти (PGlite) — для тестов: тот же PostgreSQL, без Docker. Миграции не прогоняются заново, база поднимается из снимка. */
export async function memoryDb(): Promise<Db> {
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const db = drizzle(new PGlite({ loadDataDir: await migratedTemplate() }), { schema });
  return db as unknown as Db;
}
