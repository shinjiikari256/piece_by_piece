import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { and, eq } from "drizzle-orm";
import type { CaseFile } from "../../../shared/case";
import { CASE_FORMAT_VERSION, parseCase } from "../../../shared/migrate";
import type { Db } from "./db";
import { caseVersions, cases } from "./db/schema";

/** Дела, которые поставляются вместе с репозиторием (одни и те же для клиентской сборки и сервера). */
export const BUNDLED_CASES_DIR = path.resolve(import.meta.dirname, "../../client/src/content/cases");

/**
 * Записать дело новой версией и сделать её действующей. Содержимое, которое уже есть, не дублируется
 * (версия не меняется, если она и так текущая); `restore` — вернуть действующей старую версию с таким же содержимым.
 */
export async function saveCaseVersion(db: Db, c: CaseFile, createdBy: number | null = null, restore = false): Promise<"created" | "same"> {
  const hash = createHash("sha256").update(JSON.stringify(c)).digest("hex");
  return db.transaction(async (tx) => {
    await tx.insert(cases).values({ id: c.id }).onConflictDoNothing();
    const [version] = await tx
      .insert(caseVersions)
      .values({
        caseId: c.id,
        body: c,
        formatVersion: c.formatVersion ?? CASE_FORMAT_VERSION,
        caseUpdatedAt: c.updatedAt ?? null,
        contentHash: hash,
        createdBy,
      })
      .onConflictDoNothing()
      .returning({ id: caseVersions.id });
    if (version) {
      await tx.update(cases).set({ currentVersionId: version.id }).where(eq(cases.id, c.id));
      return "created";
    }
    // такое содержимое уже было версией: при явной записи (не посев) старая версия снова становится действующей
    if (!restore) return "same";
    const [existing] = await tx.select({ id: caseVersions.id }).from(caseVersions).where(and(eq(caseVersions.caseId, c.id), eq(caseVersions.contentHash, hash)));
    const [row] = await tx.select({ current: cases.currentVersionId }).from(cases).where(eq(cases.id, c.id));
    if (!existing || row?.current === existing.id) return "same";
    await tx.update(cases).set({ currentVersionId: existing.id }).where(eq(cases.id, c.id));
    return "created";
  });
}

/** Посев: все `*.json` каталога разбираются через `parseCase`; ошибки в одном деле не мешают остальным. */
export async function seedCases(db: Db, dir = BUNDLED_CASES_DIR): Promise<{ created: string[]; failed: string[] }> {
  const created: string[] = [];
  const failed: string[] = [];
  for (const file of (await readdir(dir)).filter((f) => f.endsWith(".json")).sort()) {
    const parsed = parseCase(JSON.parse(await readFile(path.join(dir, file), "utf8")));
    if (!parsed.success) {
      failed.push(`${file}: ${parsed.errors.join("; ")}`);
      continue;
    }
    if ((await saveCaseVersion(db, parsed.data)) === "created") created.push(parsed.data.id);
  }
  return { created, failed };
}
