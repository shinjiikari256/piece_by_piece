import { Hono } from "hono";
import { and, eq, inArray } from "drizzle-orm";
import type { ServerCaseSummary, ServerPublicCase } from "../../../../shared/api";
import type { CaseFile } from "../../../../shared/case";
import { toPublicCase } from "../../../../shared/public-case";
import { bindSprites } from "../../../../shared/sprite-bindings";
import { studentCaseIds, studentSeesCase } from "../case-access";
import { caseVersions, cases, events, results } from "../db/schema";
import { ApiError, requireUser, type AppEnv, type Ctx } from "../http";
import { debriefAllowed } from "./attempts";

const notFound = () => new ApiError(404, "not_found", "Дело не найдено");

/** Действующая версия дела. Студентам недоступны скрытые дела (`published: false`) и дела, не открытые их группе. */
async function currentCase(c: Ctx, caseId: string): Promise<{ versionId: number; body: CaseFile }> {
  const [row] = await c.var.db
    .select({ id: caseVersions.id, body: caseVersions.body, visibility: cases.visibility })
    .from(cases)
    .innerJoin(caseVersions, eq(caseVersions.id, cases.currentVersionId))
    .where(eq(cases.id, caseId));
  const body = row?.body as CaseFile | undefined;
  if (!row || !body) throw notFound();
  const user = c.var.user;
  if (user?.role === "student" && (!body.published || !(await studentSeesCase(c.var.db, user, caseId, row.visibility)))) throw notFound();
  return { versionId: row.id, body };
}

const summarize = (c: CaseFile): ServerCaseSummary => ({
  id: c.id,
  number: c.number,
  title: c.title,
  tagline: c.tagline,
  difficulty: c.difficulty,
  published: c.published,
  timeBonus: c.timeBonus,
  evidenceCount: c.evidence.length,
  deductionCount: c.deductions.length,
  updatedAt: c.updatedAt,
  meta: c.meta,
});

/** Дела: список, дело без ответов, разбор. Прохождение, проверки и сдача — в `routes/attempts.ts`. */
export const caseRoutes = new Hono<AppEnv>()
  .get("/cases", async (c) => {
    const user = requireUser(c);
    const rows = await c.var.db
      .select({ body: caseVersions.body, visibility: cases.visibility })
      .from(cases)
      .innerJoin(caseVersions, eq(caseVersions.id, cases.currentVersionId));
    const opened = user.role === "student" ? await studentCaseIds(c.var.db, user.groupId) : null;
    return c.json(
      rows
        .filter((r) => !opened || r.visibility === "all" || opened.has((r.body as CaseFile).id))
        .map((r) => r.body as CaseFile)
        .filter((x) => x.published)
        .map(summarize)
        .sort((a, b) => a.id.localeCompare(b.id)),
    );
  })
  .get("/cases/:id", async (c) => {
    requireUser(c);
    const { versionId, body } = await currentCase(c, c.req.param("id"));
    const res: ServerPublicCase = { caseVersionId: versionId, caseFile: toPublicCase(bindSprites(body)) };
    return c.json(res);
  })
  /** Разбор — студенту только после сдачи этого дела; преподавателю и администратору всегда. */
  .get("/cases/:id/debrief", async (c) => {
    const user = requireUser(c);
    const { body } = await currentCase(c, c.req.param("id"));
    if (user.role === "student") {
      // свободная игра открывает разбор сразу после сдачи; сдача в мероприятии — по его правилам
      const done = await c.var.db
        .select({ eventId: results.eventId })
        .from(results)
        .where(and(eq(results.userId, user.id), eq(results.caseId, body.id)));
      if (!done.length) throw new ApiError(403, "forbidden", "Разбор откроется после сдачи дела");
      const evIds = done.flatMap((r) => (r.eventId == null ? [] : [r.eventId]));
      const evs = evIds.length ? await c.var.db.select().from(events).where(inArray(events.id, evIds)) : [];
      const allowed = done.some((r) => r.eventId == null) || evs.some((e) => debriefAllowed(e));
      if (!allowed) throw new ApiError(403, "forbidden", "Разбор для этого мероприятия закрыт");
    }
    return c.json(body.solution);
  });
