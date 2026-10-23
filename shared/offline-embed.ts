import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import type { CaseFile } from "./case";

/**
 * Вшить дела в шаблон офлайн-файла (`vite build --mode offline|offline-editor`): `<script type="application/json" id="cases">`.
 * Общий код скрипта `pnpm export:offline` и сервера (`POST /api/admin/offline`).
 */
export function embedCases(template: string, cases: CaseFile[]): { html: string; buildId: string } {
  if (template.includes('id="cases"')) throw new Error("шаблон уже содержит дела");
  // все выбранные дела видны в списке, даже если в общей сборке скрыты
  const embedded = cases.map((c) => ({ ...c, published: true }));
  const buildId = createHash("sha256")
    .update(embedded.map((c) => `${c.id}@${c.updatedAt ?? ""}`).join("|"))
    .digest("hex")
    .slice(0, 10);
  // «</script» внутри JSON закрыл бы тег раньше времени
  const payload = JSON.stringify({ buildId, cases: embedded }).replace(/</g, "\\u003c");
  const numbers = cases.map((c) => `№${c.number}`).join(", ");
  const html = template
    .replace(/<title>[^<]*<\/title>/, (t) => t.replace("</title>", ` — ${numbers}</title>`))
    .replace("</head>", () => `<script type="application/json" id="cases">${payload}</script>\n</head>`);
  return { html, buildId };
}

/** Все встроенные спрайты из папки `sprites/data` (каждый файл — группа `{ id, label, sprites }`). */
export function readSpriteSpecs(dir: string): Record<string, unknown> {
  const specs: Record<string, unknown> = {};
  for (const f of readdirSync(dir)
    .filter((n) => n.endsWith(".json"))
    .sort()) {
    const group = JSON.parse(readFileSync(path.join(dir, f), "utf8")) as { sprites: Record<string, unknown> };
    Object.assign(specs, group.sprites);
  }
  return specs;
}

/**
 * Вшить в шаблон «только игры» встроенные спрайты, которые стоят на картах дел (`<script type="application/json" id="sprites">`).
 * Спрайты дела берутся из самого дела и сюда не попадают; варианту с конструктором набор не режут.
 */
export function embedSprites(template: string, specs: Record<string, unknown>, cases: CaseFile[]): string {
  if (template.includes('id="sprites"')) throw new Error("шаблон уже содержит спрайты");
  const used = new Set(cases.flatMap((c) => c.locations.flatMap((l) => l.objects.map((o) => o.sprite))));
  const picked = Object.fromEntries(Object.entries(specs).filter(([key]) => used.has(key)));
  // «</script» внутри JSON закрыл бы тег раньше времени
  const payload = JSON.stringify(picked).replace(/</g, "\\u003c");
  return template.replace("</head>", () => `<script type="application/json" id="sprites">${payload}</script>\n</head>`);
}
