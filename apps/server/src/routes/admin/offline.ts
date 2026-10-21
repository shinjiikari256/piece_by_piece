import { readFile } from "node:fs/promises";
import path from "node:path";
import { Hono } from "hono";
import { inArray, eq } from "drizzle-orm";
import { OFFLINE_VARIANTS, OfflineBuildBody, type OfflineVariant } from "../../../../../shared/api";
import type { CaseFile } from "../../../../../shared/case";
import { embedCases, embedSprites, readSpriteSpecs } from "../../../../../shared/offline-embed";
import { caseVersions, cases } from "../../db/schema";
import { ApiError, parseBody, requireStaff, type AppEnv } from "../../http";

/** Встроенные спрайты — в репозитории клиента; сервер берёт из них только то, что стоит в делах. */
const SPRITES_DIR = path.resolve(import.meta.dirname, "../../../../client/src/game/art/sprites/data");

const templateOf = (dir: string | undefined, variant: OfflineVariant) => readFile(path.join(dir ?? "", `${variant}.html`), "utf8").catch(() => null);

/** Офлайн-файл по выбору: вариант (игра / игра с конструктором) и дела из базы, вшитые в шаблон. Персоналу. */
export const offlineRoutes = new Hono<AppEnv>()
  /** Какие варианты есть на сервере (шаблон собран). */
  .get("/offline", async (c) => {
    requireStaff(c);
    const dir = c.var.config.offlineDir;
    const available = dir ? await Promise.all(OFFLINE_VARIANTS.map(async (v) => ((await templateOf(dir, v)) ? v : null))) : [];
    return c.json({ variants: available.filter((v): v is OfflineVariant => v !== null) });
  })
  .post("/offline", async (c) => {
    requireStaff(c);
    const body = await parseBody(c, OfflineBuildBody);
    const template = await templateOf(c.var.config.offlineDir, body.variant);
    if (!template) throw new ApiError(404, "not_found", "Этот вариант офлайн-версии на сервере не подготовлен");
    const rows = await c.var.db
      .select({ id: cases.id, body: caseVersions.body })
      .from(cases)
      .innerJoin(caseVersions, eq(caseVersions.id, cases.currentVersionId))
      .where(inArray(cases.id, body.caseIds));
    const byId = new Map(rows.map((r) => [r.id, r.body as CaseFile]));
    const missing = body.caseIds.find((id) => !byId.has(id));
    if (missing) throw new ApiError(404, "not_found", `Дело ${missing} не найдено`);
    const chosen = body.caseIds.map((id) => byId.get(id)!);
    const embedded = embedCases(template, chosen).html;
    const html = body.variant === "game" ? embedSprites(embedded, readSpriteSpecs(SPRITES_DIR), chosen) : embedded;
    return c.body(html, 200, {
      "content-type": "text/html; charset=utf-8",
      "content-disposition": `attachment; filename="${body.variant === "editor" ? "delo-editor" : "delo"}.html"`,
    });
  });
