/**
 * Шаблоны офлайн-файла для страницы `/offline` в дев-режиме: offline/server/game.html и editor.html.
 * В Docker их делает этап `offline` из Dockerfile; здесь — то же самое локально.
 *
 *   pnpm offline:templates      собрать оба (потом `pnpm server:dev` подхватит их сам)
 */
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const out = path.join(root, "offline/server");
mkdirSync(out, { recursive: true });

for (const [mode, dir, name] of [
  ["offline", ".template", "game.html"],
  ["offline-editor", ".template-editor", "editor.html"],
] as const) {
  console.log(`vite build --mode ${mode}…`);
  execFileSync(path.join(root, "node_modules/.bin/vite"), ["build", "--config", "apps/client/vite.config.ts", "--mode", mode, "--logLevel", "warn"], { cwd: root, stdio: "inherit" });
  copyFileSync(path.join(root, "offline", dir, "index.html"), path.join(out, name));
}
console.log(`Готово: ${out}`);
