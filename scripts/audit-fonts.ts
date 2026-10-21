/**
 * Аудит размеров шрифта в стилях клиента:  pnpm audit:fonts
 *  — `font-size` вне styles/tokens должен быть токеном шкалы `var(--fs-*)` (styles/tokens/typography.css), `inherit` или `1em`;
 *  — `font-weight` — только 400, 500, 700 (подключены начертания Rubik; 600 всё равно рисуется как 700);
 *  — значения не из шкалы (em, rem, px, clamp) выводятся списком: их нужно перевести на токен или оставить как осознанное исключение
 *    (крупные заголовки и адаптивные размеры) — тогда добавить в `ALLOWED` ниже с причиной.
 * Код возврата 1 — если есть неразрешённые значения.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const root = path.resolve("apps/client/src");
const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((n) => {
    const p = path.join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
const rel = (f: string) => path.relative(root, f);
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));

/** Осознанные исключения: значение → причина. */
const ALLOWED: Record<string, string> = {
  "clamp(15px, 0.55vw + 9px, 22px)": "базовый размер страницы",
  "clamp(2.4rem, 5vw, 3.6rem)": "заголовок главной",
  "0.9375rem": "размер текста области целиком: редактор, выпадающий список (rem — следует настройке шрифта браузера)",
  "93.75%": "размер текста мобильной вёрстки (процент от настройки браузера, не px)",
  "1rem": "размер текста сайта целиком",
  "0.8125rem": "моноширинный текст (JSON)",
  "0.6875rem": "подпись в SVG-графе диалогов (единицы холста)",
  "1.75rem": "заголовок страницы",
  "2rem": "заголовок мобильной версии",
  "2.2em": "крупный заголовок папки",
  "2.4em": "крупный заголовок мобильной версии",
  "3.2em": "крупная цифра итога",
};

const bad = new Map<string, string[]>();
const WEIGHTS = new Set(["400", "500", "700", "normal", "bold", "inherit"]);
for (const f of walk(root).filter((x) => x.endsWith(".css") && !/tokens[\\/]typography\.css$/.test(x))) {
  const text = stripComments(readFileSync(f, "utf8"));
  text.split("\n").forEach((line, i) => {
    const w = line.match(/font-weight:\s*([^;}]+)/);
    if (w && !WEIGHTS.has(w[1].trim())) (bad.get(`font-weight: ${w[1].trim()}`) ?? bad.set(`font-weight: ${w[1].trim()}`, []).get(`font-weight: ${w[1].trim()}`)!).push(`${rel(f)}:${i + 1}`);
    const m = line.match(/font-size:\s*([^;}]+)/);
    if (!m) return;
    const value = m[1].replace(/\s*!important/, "").trim();
    if (/^var\(--fs-(xs|sm|md|base|lg|xl|2xl)\)$/.test(value) || value === "inherit" || value === "1em" || value in ALLOWED) return;
    (bad.get(value) ?? bad.set(value, []).get(value)!).push(`${rel(f)}:${i + 1}`);
  });
}

if (!bad.size) {
  console.log("Размеры шрифта — только из шкалы.");
} else {
  for (const [value, places] of [...bad].sort((a, b) => b[1].length - a[1].length)) console.log(`${value}  (${places.length}): ${places.slice(0, 4).join(", ")}${places.length > 4 ? ", …" : ""}`);
  console.log(`\nНе из шкалы: ${[...bad.values()].reduce((n, p) => n + p.length, 0)} мест. Перевести на var(--fs-*) или добавить в ALLOWED с причиной.`);
  process.exitCode = 1;
}
