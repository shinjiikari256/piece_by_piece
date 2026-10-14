/**
 * Обновить версию дел (updatedAt) после ручной правки JSON; заодно переводит файл на текущий formatVersion:
 *   pnpm touch:cases                 — все дела
 *   pnpm touch:cases case-002.json   — выбранные
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { migrateCase } from "../shared/migrate";

const dir = path.resolve("apps/client/src/content/cases");
const files = process.argv.slice(2).length ? process.argv.slice(2) : readdirSync(dir).filter((f) => f.endsWith(".json"));
const now = new Date().toISOString().replace(/\.\d+Z$/, "Z");

for (const file of files) {
  const full = path.join(dir, path.basename(file));
  const migrated = migrateCase(JSON.parse(readFileSync(full, "utf8")));
  if (!migrated.ok) throw new Error(`${file}: ${migrated.error}`);
  const data = migrated.data;
  data.updatedAt = now;
  writeFileSync(full, JSON.stringify(data, null, 2) + "\n");
  console.log(`✓ ${path.basename(file)} → ${now}`);
}
