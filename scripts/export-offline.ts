/**
 * Офлайн-сборка: один .html с выбранными делами — открывается с диска, без сети и сервера.
 *
 * Готовые файлы складываются в папку offline/ (имя из --out; путь с «/» — как указан).
 *
 *   pnpm export:offline                                  все опубликованные дела → offline/delo.html
 *   pnpm export:offline --cases=case-001,case-002        по id из apps/client/src/content/cases
 *   pnpm export:offline --cases=./moe-delo.json          файл дела, скачанный из конструктора
 *   pnpm export:offline --out=gruppa-201.html --no-build не пересобирать шаблон
 *
 * Шаблон (offline/.template/offline-template.html) собирается `vite build --mode offline`: игра без конструктора,
 * JS/CSS/шрифты внутри файла. Дела вшиваются в <script type="application/json" id="cases">.
 * Внимание: ответы лежат в файле — проверка идёт в браузере (см. working/plans/BACKEND.md, «Справка»).
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { validateCase } from "../apps/client/src/content/validate";
import type { CaseFile } from "../shared/case";

const root = path.resolve(import.meta.dirname, "..");
const casesDir = path.join(root, "apps/client/src/content/cases");
// шаблон без дел; переименован, чтобы его не путали с готовым файлом
const outDir = path.join(root, "offline");
const template = path.join(outDir, ".template/offline-template.html");

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, ...v] = a.replace(/^--/, "").split("=");
    return [k, v.length ? v.join("=") : "true"];
  }),
);

function fail(message: string): never {
  console.error(`✗ ${message}`);
  process.exit(1);
}

function load(file: string): CaseFile {
  const result = validateCase(JSON.parse(readFileSync(file, "utf8")));
  if (!result.ok) fail(`${path.relative(root, file)} содержит ошибки:\n  ${result.errors.join("\n  ")}`);
  return result.caseFile;
}

const bundled = readdirSync(casesDir)
  .filter((f) => f.endsWith(".json"))
  .sort()
  .map((f) => load(path.join(casesDir, f)));

let cases: CaseFile[];
if (args.cases) {
  cases = args.cases.split(",").map((ref) => {
    const r = ref.trim();
    if (r.endsWith(".json")) {
      const file = path.resolve(r);
      if (!existsSync(file)) fail(`нет файла ${r}`);
      return load(file);
    }
    return bundled.find((c) => c.id === r) ?? fail(`нет дела ${r}; есть: ${bundled.map((c) => c.id).join(", ")}`);
  });
} else {
  cases = bundled.filter((c) => c.published);
}
if (!cases.length) fail("не выбрано ни одного дела");
const ids = cases.map((c) => c.id);
const dup = ids.find((id, i) => ids.indexOf(id) !== i);
if (dup) fail(`дело ${dup} указано дважды`);

if (args["no-build"] !== "true" || !existsSync(template)) {
  console.log("Собираю шаблон (vite build --mode offline)…");
  execFileSync(path.join(root, "node_modules/.bin/vite"), ["build", "--config", "apps/client/vite.config.ts", "--mode", "offline", "--logLevel", "warn"], {
    cwd: root,
    stdio: "inherit",
  });
  renameSync(path.join(outDir, ".template/index.html"), template);
}

// все выбранные дела видны в списке, даже если в общей сборке скрыты
const embedded = cases.map((c) => ({ ...c, published: true }));
const buildId = createHash("sha256")
  .update(embedded.map((c) => `${c.id}@${c.updatedAt ?? ""}`).join("|"))
  .digest("hex")
  .slice(0, 10);
// «</script» внутри JSON закрыл бы тег раньше времени
const payload = JSON.stringify({ buildId, cases: embedded }).replace(/</g, "\\u003c");

let html = readFileSync(template, "utf8");
if (html.includes('id="cases"')) fail("шаблон уже содержит дела — пересоберите его без --no-build");
const numbers = cases.map((c) => `№${c.number}`).join(", ");
html = html
  .replace(/<title>[^<]*<\/title>/, (t) => t.replace("</title>", ` — ${numbers}</title>`))
  .replace("</head>", `<script type="application/json" id="cases">${payload}</script>\n</head>`);

const name = args.out ?? "delo.html";
const out = name.includes("/") ? path.resolve(name) : path.join(outDir, name.endsWith(".html") ? name : `${name}.html`);
mkdirSync(path.dirname(out), { recursive: true });
writeFileSync(out, html);
const mb = (statSync(out).size / 1024 / 1024).toFixed(1);
console.log(`✓ ${path.relative(process.cwd(), out)} — ${mb} МБ, сборка ${buildId}`);
for (const c of cases) console.log(`  №${c.number} «${c.title}»`);
