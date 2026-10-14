/**
 * Аудит цветов в стилях клиента:  pnpm audit:colors
 *  — цветовые литералы в правилах вне styles/tokens и styles/themes (должны быть роли `--bg-*`, `--text-*`, …);
 *  — `var(--x)` на неопределённые переменные;
 *  — сырая палитра `--pal-*` вне токенов (в компонентах — только роли);
 *  — тона без полного набора `-soft/-line/-strong/-ink`;
 *  — темы, переопределяющие несуществующие переменные.
 * Локальные палитры (`--имя: #литерал` на компоненте) допустимы, выводятся справкой. Код возврата 1 — если есть ошибки.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const root = path.resolve("apps/client/src");
const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((n) => {
    const p = path.join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
const all = walk(root);
const css = all.filter((f) => f.endsWith(".css"));
const sources = all.filter((f) => /\.(css|tsx?|svg)$/.test(f));
const rel = (f: string) => path.relative(root, f);
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));
const isTokenFile = (f: string) => /styles[\\/](tokens|themes)[\\/]/.test(f);

const COLOR = /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?)\((?!\s*var\()[^)]*\)/g;
const errors: string[] = [];
const info: string[] = [];

// определённые и использованные переменные
const defined = new Set<string>();
const used = new Map<string, string[]>();
for (const f of sources) {
  const text = f.endsWith(".css") ? stripComments(readFileSync(f, "utf8")) : readFileSync(f, "utf8");
  for (const m of text.matchAll(/(--[\w-]+)\s*:/g)) defined.add(m[1]);
  // переменные, задаваемые из разметки: style={{ "--x": … }}
  for (const m of text.matchAll(/["'](--[\w-]+)["']\s*:/g)) defined.add(m[1]);
  for (const m of text.matchAll(/var\((--[\w-]+)/g)) (used.get(m[1]) ?? used.set(m[1], []).get(m[1])!).push(rel(f));
}

// 1–2. литералы в правилах и сырая палитра в компонентах; локальные палитры — справка
for (const f of css) {
  const text = stripComments(readFileSync(f, "utf8"));
  text.split("\n").forEach((line, i) => {
    const where = `${rel(f)}:${i + 1}`;
    if (!isTokenFile(f) && /var\(--pal-/.test(line)) errors.push(`${where}  сырая палитра в компоненте: ${line.trim()}`);
    const lits = line.match(COLOR);
    if (!lits || isTokenFile(f)) return;
    if (/^\s*--[\w-]+\s*:/.test(line)) info.push(`${where}  локальная палитра: ${line.trim()}`);
    else errors.push(`${where}  литерал цвета ${lits.join(", ")}: ${line.trim()}`);
  });
}
for (const [name, files] of used) if (!defined.has(name) && name !== "--lg-") errors.push(`var(${name}) не определена (${[...new Set(files)].join(", ")})`);

// 3. наборы тонов
const TONES = ["accent", "good", "warn", "bad", "evidence", "testimony", "conclusion"];
for (const tone of TONES) for (const part of ["", "-soft", "-line", "-strong", "-ink"]) if (!defined.has(`--${tone}${part}`)) errors.push(`тон ${tone}: нет --${tone}${part}`);

// 4. темы
const roleFiles = css.filter((f) => /tokens[\\/](palette|roles|effects|layout)\.css$/.test(f));
const roleDefs = new Set(roleFiles.flatMap((f) => [...stripComments(readFileSync(f, "utf8")).matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1])));
for (const f of css.filter((x) => /styles[\\/]themes[\\/]/.test(x))) {
  for (const m of stripComments(readFileSync(f, "utf8")).matchAll(/(--[\w-]+)\s*:/g)) if (!roleDefs.has(m[1])) errors.push(`${rel(f)}: тема переопределяет неизвестную переменную ${m[1]}`);
}

console.log(`Файлов стилей: ${css.length}; переменных определено: ${defined.size}.`);
if (info.length) console.log(`\nЛокальные палитры (${info.length}):\n  ${info.join("\n  ")}`);
if (errors.length) {
  console.error(`\nОшибки (${errors.length}):\n  ${errors.join("\n  ")}`);
  process.exit(1);
}
console.log("\nОшибок нет.");
