import { Hono } from "hono";
import { asc, desc, eq, inArray } from "drizzle-orm";
import { CaseVisibilityBody } from "../../../../shared/api";
import type { CaseFile } from "../../../../shared/case";
import { parseCase } from "../../../../shared/migrate";
import { saveCaseVersion } from "../cases";
import { auditLog, caseGroups, caseVersions, cases, groups } from "../db/schema";
import { ApiError, parseBody, requireStaff, type AppEnv } from "../http";
import { ownGroupIds } from "./admin";

/** JSON с отсортированными ключами: jsonb в базе переставляет ключи, обычное сравнение строк врёт. */
const canonical = (v: unknown): string =>
  JSON.stringify(v, (_k, x) => (x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => a.localeCompare(b))) : x));

/** Автор дела — тот, кто записал его первую версию (посеянные из репозитория дела — ничьи, правит только админ). */
async function ownerOf(db: AppEnv["Variables"]["db"], caseId: string): Promise<number | null | undefined> {
  const [first] = await db.select({ createdBy: caseVersions.createdBy }).from(caseVersions).where(eq(caseVersions.caseId, caseId)).orderBy(asc(caseVersions.id)).limit(1);
  return first ? first.createdBy : undefined;
}

/** Править дело и его видимость может админ, автор и — для посеянных дел без автора — только админ. */
async function assertCaseOwner(db: AppEnv["Variables"]["db"], staff: { id: number; role: string }, caseId: string) {
  const owner = await ownerOf(db, caseId);
  if (owner === undefined) throw new ApiError(404, "not_found", "Дело не найдено");
  if (staff.role !== "admin" && owner !== staff.id) throw new ApiError(403, "forbidden", "Это дело создал другой автор");
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
  /** Кому видно дело: всем студентам или группам из списка. Преподаватель видит весь список, но меняет только свои группы. */
  .get("/cases/:id/visibility", async (c) => {
    const db = c.var.db;
    const staff = requireStaff(c);
    const id = c.req.param("id");
    const [row] = await db.select({ visibility: cases.visibility }).from(cases).where(eq(cases.id, id));
    if (!row) throw new ApiError(404, "not_found", "Дело не найдено");
    const list = (await db.select({ id: caseGroups.groupId }).from(caseGroups).where(eq(caseGroups.caseId, id))).map((r) => r.id);
    const own = staff.role === "admin" ? null : await ownGroupIds(db, staff.id);
    return c.json({ mode: row.visibility, groupIds: list, lockedGroupIds: own ? list.filter((g) => !own.includes(g)) : [] });
  })
  .put("/cases/:id/visibility", async (c) => {
    const db = c.var.db;
    const staff = requireStaff(c);
    const id = c.req.param("id");
    const body = await parseBody(c, CaseVisibilityBody);
    await assertCaseOwner(db, staff, id);
    const wanted = [...new Set(body.groupIds)];
    if (wanted.length) {
      const found = await db.select({ id: groups.id }).from(groups).where(inArray(groups.id, wanted));
      if (found.length !== wanted.length) throw new ApiError(400, "invalid", "Есть неизвестная группа");
    }
    let groupIds = wanted;
    if (staff.role !== "admin") {
      // чужие группы преподаватель не может ни добавить, ни убрать: они остаются как были
      const own = await ownGroupIds(db, staff.id);
      const before = (await db.select({ id: caseGroups.groupId }).from(caseGroups).where(eq(caseGroups.caseId, id))).map((r) => r.id);
      const locked = before.filter((g) => !own.includes(g));
      if (wanted.some((g) => !own.includes(g) && !locked.includes(g))) throw new ApiError(403, "forbidden", "Это не ваша группа");
      groupIds = [...new Set([...wanted.filter((g) => own.includes(g)), ...locked])];
    }
    await db.delete(caseGroups).where(eq(caseGroups.caseId, id));
    if (groupIds.length) await db.insert(caseGroups).values(groupIds.map((groupId) => ({ caseId: id, groupId })));
    await db.update(cases).set({ visibility: body.mode }).where(eq(cases.id, id));
    await db.insert(auditLog).values({ userId: staff.id, action: "cases.visibility", payload: { id, mode: body.mode, groupIds } });
    return c.json({ mode: body.mode, groupIds });
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
    if (owner !== undefined && staff.role !== "admin" && owner !== staff.id) throw new ApiError(403, "forbidden", "Это дело создал другой автор");
    const [current] = await db.select({ body: caseVersions.body }).from(cases).innerJoin(caseVersions, eq(caseVersions.id, cases.currentVersionId)).where(eq(cases.id, id));
    if (current && canonical(current.body) === canonical(parsed.data)) return c.json({ result: "same" });
    const result = await saveCaseVersion(db, parsed.data, staff.id);
    await db.insert(auditLog).values({ userId: staff.id, action: "cases.save", payload: { id, result, rightsConfirmed: true } });
    return c.json({ result });
  });
