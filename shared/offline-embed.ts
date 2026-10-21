import { createHash } from "node:crypto";
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
