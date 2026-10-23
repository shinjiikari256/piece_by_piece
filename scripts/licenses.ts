/**
 * Уведомления о лицензиях сторонних пакетов, которые попадают в клиентскую сборку (шрифты и библиотеки).
 *   pnpm generate:licenses   → apps/client/public/licenses.txt
 * Vite выбрасывает лицензионные комментарии из бандла, поэтому тексты лежат отдельным файлом рядом с ним
 * (в `dist` его копирует сам Vite, в офлайн-файл он вшивается комментарием — см. vite.config.ts).
 * Серверные пакеты игрокам не передаются, в файл не входят.
 */
import { existsSync, readFileSync, readdirSync, realpathSync, writeFileSync } from "node:fs";
import path from "node:path";

/** Пакеты, которые уходят игрокам в бандле. Новая зависимость должна быть в одном из двух списков. */
const CLIENT = ["@fontsource/pt-mono", "@fontsource/rubik", "phaser", "react", "react-dom", "transliteration", "uqr", "zod"];
/** Работают только на сервере и игрокам не передаются. */
const SERVER_ONLY = ["@hono/node-server", "@node-rs/argon2", "drizzle-orm", "hono", "postgres"];

interface Pkg {
  name: string;
  version: string;
  license?: string | { type?: string };
  licenses?: { type?: string }[];
  homepage?: string;
  repository?: string | { url?: string };
  dependencies?: Record<string, string>;
}

const root = process.cwd();
const rootPkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")) as Pkg;

/** Пакет `name`, как его увидит код из `fromDir`: node_modules вверх по дереву (так устроен и pnpm). */
function resolvePkgDir(name: string, fromDir: string): string | null {
  for (let dir = fromDir; ; dir = path.dirname(dir)) {
    const candidate = path.join(dir, "node_modules", name);
    if (existsSync(path.join(candidate, "package.json"))) return realpathSync(candidate);
    if (path.dirname(dir) === dir) return null;
  }
}

const licenseOf = (p: Pkg): string =>
  typeof p.license === "string"
    ? p.license
    : (p.license?.type ??
      p.licenses
        ?.map((l) => l.type)
        .filter(Boolean)
        .join(" OR ") ??
      "");

/** LICENSE и NOTICE (Apache-2.0 требует приложить и его). */
function noticeFiles(dir: string): string {
  return readdirSync(dir)
    .filter((f) => /^(licen[sc]e|copying|notice)([-.].*)?$/i.test(f) && !/\.(js|ts|json|map)$/i.test(f))
    .sort()
    .map((f) => readFileSync(path.join(dir, f), "utf8").replace(/\r\n/g, "\n").trim())
    .filter(Boolean)
    .join("\n\n");
}

const repoUrl = (p: Pkg) =>
  (typeof p.repository === "string" ? p.repository : (p.repository?.url ?? p.homepage ?? ""))
    .replace(/^git\+/, "")
    .replace(/\.git$/, "")
    .replace(/^git:\/\//, "https://")
    .replace(/^github:/, "https://github.com/");

const direct = Object.keys(rootPkg.dependencies ?? {});
const unclassified = direct.filter((d) => !SERVER_ONLY.includes(d) && !CLIENT.includes(d));
if (unclassified.length) {
  console.error(`✗ новые зависимости: ${unclassified.join(", ")} — внесите их в CLIENT или SERVER_ONLY (scripts/licenses.ts)`);
  process.exit(1);
}

const seen = new Map<string, { name: string; version: string; license: string; url: string; text: string }>();
const missing: string[] = [];

function visit(name: string, fromDir: string) {
  const dir = resolvePkgDir(name, fromDir);
  if (!dir) return; // необязательная платформенная зависимость, не установленная здесь
  const pkg = JSON.parse(readFileSync(path.join(dir, "package.json"), "utf8")) as Pkg;
  const key = `${pkg.name}@${pkg.version}`;
  if (seen.has(key)) return;
  const text = noticeFiles(dir);
  seen.set(key, { name: pkg.name, version: pkg.version, license: licenseOf(pkg), url: repoUrl(pkg), text });
  if (!text) missing.push(key);
  for (const dep of Object.keys(pkg.dependencies ?? {})) visit(dep, dir);
}

for (const dep of CLIENT) visit(dep, root);

const list = [...seen.values()].sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version));
const body = list
  .map(
    (p) => `${"=".repeat(72)}\n${p.name} ${p.version} — ${p.license || "лицензия не указана"}\n${p.url}\n${"=".repeat(72)}\n\n${p.text || `(файла лицензии в пакете нет; лицензия: ${p.license})`}\n`,
  )
  .join("\n");
const out = path.join(root, "apps/client/public/licenses.txt");
writeFileSync(out, `Сторонние компоненты, входящие в «${rootPkg.name}» (клиент)\n\n${body}`);
console.log(`✓ ${list.length} пакетов → ${path.relative(root, out)}`);
if (missing.length) console.warn(`! без файла лицензии: ${missing.join(", ")}`);
