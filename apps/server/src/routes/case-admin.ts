import { Hono } from "hono";
import { asc, desc, eq } from "drizzle-orm";
import type { CaseFile } from "../../../../shared/case";
import { parseCase } from "../../../../shared/migrate";
import { saveCaseVersion } from "../cases";
import { auditLog, caseVersions, cases } from "../db/schema";
import { ApiError, requireStaff, type AppEnv } from "../http";

/** JSON с отсортированными ключами: jsonb в базе переставляет ключи, обычное сравнение строк врёт. */
const canonical = (v: unknown): string =>
  JSON.stringify(v, (_k, x) => (x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => a.localeCompare(b))) : x));

/** Автор дела — тот, кто записал его первую версию (посеянные из репозитория дела — ничьи, правит только админ). */
async function ownerOf(db: AppEnv["Variables"]["db"], caseId: string): Promise<number | null | undefined> {
  const [first] = await db
    .select({ createdBy: caseVersions.createdBy })
    .from(caseVersions)
    .where(eq(caseVersions.caseId, caseId))
    .orderBy(asc(caseVersions.id))
    .limit(1);
  return first ? first.createdBy : undefined;
}

/** Дела для конструктора: полный текст с ответами, версии, запись новой версии. Только преподаватель и админ. */
export const caseAdminRoutes = new Hono<AppEnv>()
  .get("/cases", async (c) => {
    requireStaff(c);
    const rows = await c.var.db
      .select({ id: cases.id, versionId: caseVersions.id, body: caseVersions.body })
      .from(cases)
      .innerJoin(caseVersions, eq(caseVersions.id, cases.currentVersionId))
      .orderBy(asc(cases.id));
    return c.json(
      rows.map((r) => {
        const b = r.body as CaseFile;
        return { id: r.id, number: b.number, title: b.title, published: b.published, updatedAt: b.updatedAt, versionId: r.versionId };
      }),
    );
  })
  .get("/cases/:id", async (c) => {
    requireStaff(c);
    const [row] = await c.var.db
      .select({ versionId: caseVersions.id, body: caseVersions.body })
      .from(cases)
      .innerJoin(caseVersions, eq(caseVersions.id, cases.currentVersionId))
      .where(eq(cases.id, c.req.param("id")));
    if (!row) throw new ApiError(404, "not_found", "Дело не найдено");
    return c.json({ versionId: row.versionId, caseFile: row.body as CaseFile });
  })
  .get("/cases/:id/versions", async (c) => {
    requireStaff(c);
    const rows = await c.var.db
      .select({ id: caseVersions.id, updatedAt: caseVersions.caseUpdatedAt, createdBy: caseVersions.createdBy, createdAt: caseVersions.createdAt })
      .from(caseVersions)
      .where(eq(caseVersions.caseId, c.req.param("id")))
      .orderBy(desc(caseVersions.id));
    return c.json(rows);
  })
  /** Записать дело новой версией (она сразу действующая). Чужое дело преподаватель править не может. */
  .put("/cases/:id", async (c) => {
    const db = c.var.db;
    const staff = requireStaff(c);
    const id = c.req.param("id");
    if (c.req.query("rights") !== "1") throw new ApiError(400, "rights_required", "Подтвердите, что вы автор дела или имеете право его публиковать");
    const parsed = parseCase(await c.req.json().catch(() => null));
    if (!parsed.success) throw new ApiError(400, "invalid", `Дело не прошло проверку: ${parsed.errors.slice(0, 5).join("; ")}`);
    if (parsed.data.id !== id) throw new ApiError(400, "invalid", "Ключ дела не совпадает с адресом");
    const owner = await ownerOf(db, id);
    if (owner !== undefined && staff.role !== "admin" && owner !== staff.id)
      throw new ApiError(403, "forbidden", "Это дело создал другой автор");
    const [current] = await db
      .select({ body: caseVersions.body })
      .from(cases)
      .innerJoin(caseVersions, eq(caseVersions.id, cases.currentVersionId))
      .where(eq(cases.id, id));
    if (current && canonical(current.body) === canonical(parsed.data)) return c.json({ result: "same" });
    const result = await saveCaseVersion(db, parsed.data, staff.id);
    await db.insert(auditLog).values({ userId: staff.id, action: "cases.save", payload: { id, result, rightsConfirmed: true } });
    return c.json({ result });
  });
