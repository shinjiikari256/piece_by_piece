import { Hono } from "hono";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { CaseEditorsBody, CaseVisibilityBody } from "../../../../shared/api";
import type { CaseFile } from "../../../../shared/case";
import { parseCase } from "../../../../shared/migrate";
import { saveCaseVersion } from "../cases";
import { auditLog, caseEditors, caseGroups, caseVersions, cases, groups, users } from "../db/schema";
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

/** Править дело (записывать версии) может админ, автор и соавторы из `case_editors`. */
async function assertCaseEditor(db: AppEnv["Variables"]["db"], staff: { id: number; role: string }, caseId: string) {
  const owner = await ownerOf(db, caseId);
  if (owner === undefined || staff.role === "admin" || owner === staff.id) return;
  const [editor] = await db.select({ id: caseEditors.userId }).from(caseEditors).where(and(eq(caseEditors.caseId, caseId), eq(caseEditors.userId, staff.id)));
  if (!editor) throw new ApiError(403, "forbidden", "Это дело создал другой автор — попросите добавить вас соавтором");
}

/** Дела для конструктора: полный текст с ответами, версии, запись новой версии. Только преподаватель и админ. */
export const caseAdminRoutes = new Hono<AppEnv>()
  .get("/cases", async (c) => {
    const staff = requireStaff(c);
    const db = c.var.db;
    const rows = await db
      .select({ id: cases.id, versionId: caseVersions.id, body: caseVersions.body, createdAt: cases.createdAt })
      .from(cases)
      .innerJoin(caseVersions, eq(caseVersions.id, cases.currentVersionId))
      .orderBy(asc(cases.id));
    // автор — создатель первой версии; кнопки редактирования и удаления показываем только тем, у кого есть права
    const owners = new Map((await db.selectDistinctOn([caseVersions.caseId], { caseId: caseVersions.caseId, createdBy: caseVersions.createdBy }).from(caseVersions).orderBy(caseVersions.caseId, caseVersions.id)).map((o) => [o.caseId, o.createdBy]));
    const editorOf = new Set((await db.select({ caseId: caseEditors.caseId }).from(caseEditors).where(eq(caseEditors.userId, staff.id))).map((e) => e.caseId));
    return c.json(
      rows.map((r) => {
        const b = r.body as CaseFile;
        const isOwner = staff.role === "admin" || owners.get(r.id) === staff.id;
        return { id: r.id, number: b.number, title: b.title, published: b.published, updatedAt: b.updatedAt, createdAt: r.createdAt, versionId: r.versionId, canEdit: isOwner || editorOf.has(r.id), canManage: isOwner };
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
  /** Соавторы дела (автор и админ управляют списком); кандидаты — преподаватели. */
  .get("/cases/:id/editors", async (c) => {
    const db = c.var.db;
    const staff = requireStaff(c);
    const id = c.req.param("id");
    await assertCaseOwner(db, staff, id);
    const teachers = await db.select({ id: users.id, fullName: users.fullName }).from(users).where(eq(users.role, "teacher")).orderBy(asc(users.fullName));
    const editorIds = (await db.select({ id: caseEditors.userId }).from(caseEditors).where(eq(caseEditors.caseId, id))).map((e) => e.id);
    return c.json({ teachers, editorIds, ownerId: (await ownerOf(db, id)) ?? null });
  })
  .put("/cases/:id/editors", async (c) => {
    const db = c.var.db;
    const staff = requireStaff(c);
    const id = c.req.param("id");
    await assertCaseOwner(db, staff, id);
    const body = await parseBody(c, CaseEditorsBody);
    const owner = await ownerOf(db, id);
    const wanted = [...new Set(body.userIds)].filter((u) => u !== owner);
    // только преподаватели: админ и так правит всё
    const userIds = wanted.length ? (await db.select({ id: users.id }).from(users).where(and(inArray(users.id, wanted), eq(users.role, "teacher")))).map((u) => u.id) : [];
    await db.delete(caseEditors).where(eq(caseEditors.caseId, id));
    if (userIds.length) await db.insert(caseEditors).values(userIds.map((userId) => ({ caseId: id, userId })));
    await db.insert(auditLog).values({ userId: staff.id, action: "cases.editors", payload: { id, userIds } });
    return c.json({ editorIds: userIds });
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
    // «никому» не держит привязок к группам: иначе они продолжали бы открывать дело
    if (body.mode === "none") groupIds = [];
    await db.delete(caseGroups).where(eq(caseGroups.caseId, id));
    if (groupIds.length) await db.insert(caseGroups).values(groupIds.map((groupId) => ({ caseId: id, groupId })));
    await db.update(cases).set({ visibility: body.mode }).where(eq(cases.id, id));
    await db.insert(auditLog).values({ userId: staff.id, action: "cases.visibility", payload: { id, mode: body.mode, groupIds } });
    return c.json({ mode: body.mode, groupIds });
  })
  /** Удалить дело вместе с версиями, попытками и привязками к мероприятиям; результаты остаются. Автор или админ. */
  .delete("/cases/:id", async (c) => {
    const db = c.var.db;
    const staff = requireStaff(c);
    const id = c.req.param("id");
    await assertCaseOwner(db, staff, id);
    await db.update(cases).set({ currentVersionId: null }).where(eq(cases.id, id));
    await db.delete(cases).where(eq(cases.id, id));
    await db.insert(auditLog).values({ userId: staff.id, action: "cases.delete", payload: { id } });
    return c.json({ ok: true });
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
    await assertCaseEditor(db, staff, id);
    const [current] = await db.select({ versionId: caseVersions.id, body: caseVersions.body }).from(cases).innerJoin(caseVersions, eq(caseVersions.id, cases.currentVersionId)).where(eq(cases.id, id));
    // `?base=` — версия, с которой правили: если на сервере уже другая, чужую правку молча не затираем
    const base = c.req.query("base");
    if (current && base !== undefined && Number(base) !== current.versionId) {
      throw new ApiError(409, "version_conflict", "Дело на сервере изменили после того, как вы его открыли. Откройте актуальную версию и перенесите правки.");
    }
    if (current && canonical(current.body) === canonical(parsed.data)) return c.json({ result: "same", versionId: current.versionId });
    const result = await saveCaseVersion(db, parsed.data, staff.id, true);
    const [now] = await db.select({ versionId: cases.currentVersionId }).from(cases).where(eq(cases.id, id));
    await db.insert(auditLog).values({ userId: staff.id, action: "cases.save", payload: { id, result, rightsConfirmed: true } });
    return c.json({ result, versionId: now?.versionId ?? null });
  });
