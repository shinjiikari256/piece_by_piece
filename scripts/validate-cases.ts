import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { validateCase } from "../apps/client/src/content/validate";

const dir = path.resolve("apps/client/src/content/cases");
let failed = 0;

for (const file of readdirSync(dir).filter((f) => f.endsWith(".json")).sort()) {
  const result = validateCase(JSON.parse(readFileSync(path.join(dir, file), "utf8")));
  if (result.ok) {
    console.log(`✓ ${file} — «${result.caseFile.title}» (${result.caseFile.published ? "в списке" : "скрыто"})`);
  } else {
    failed++;
    console.log(`✗ ${file}\n  ${result.errors.join("\n  ")}`);
  }
}

process.exit(failed ? 1 : 0);
