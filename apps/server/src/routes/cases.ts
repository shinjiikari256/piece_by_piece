import { Hono } from "hono";
import { and, eq } from "drizzle-orm";
import {
  CheckDeductionBody,
  FinishBody,
  RestoreBody,
  type ServerCaseSummary,
  type ServerPublicCase,
} from "../../../../shared/api";
import type { CaseFile } from "../../../../shared/case";
import * as judge from "../../../../shared/judge";
import { RESULT_FORMAT_VERSION, type FinishInput } from "../../../../shared/judge";
import { toPublicCase } from "../../../../shared/public-case";
import { bindSprites } from "../../../../shared/sprite-bindings";
import { caseVersions, cases, results } from "../db/schema";
import { ApiError, parseBody, requireUser, type AppEnv, type Ctx } from "../http";
import { toServerResult } from "./results";

const notFound = () => new ApiError(404, "not_found", "Дело не найдено");

/**
 * Версия дела для запроса: `?v=<id>` — закреплённая за прохождением, иначе действующая.
 * Скрытые дела (`published: false`) игрокам недоступны.
 */
async function loadCase(c: Ctx, caseId: string): Promise<{ versionId: number; body: CaseFile }> {
  const db = c.var.db;
  const pinned = Number(c.req.query("v"));
  const [row] = Number.isInteger(pinned) && pinned > 0
    ? await db
        .select({ id: caseVersions.id, body: caseVersions.body })
        .from(caseVersions)
        .where(and(eq(caseVersions.id, pinned), eq(caseVersions.caseId, caseId)))
    : await db
        .select({ id: caseVersions.id, body: caseVersions.body })
        .from(cases)
        .innerJoin(caseVersions, eq(caseVersions.id, cases.currentVersionId))
        .where(eq(cases.id, caseId));
  const body = row?.body as CaseFile | undefined;
  if (!row || !body || (!body.published && c.var.user?.role === "student")) throw notFound();
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

/** Судья на сервере: дело без ответов, проверка сопоставлений, подсказки, итог. */
export const caseRoutes = new Hono<AppEnv>()
  .get("/cases", async (c) => {
    requireUser(c);
    const rows = await c.var.db
      .select({ body: caseVersions.body })
      .from(cases)
      .innerJoin(caseVersions, eq(caseVersions.id, cases.currentVersionId));
    return c.json(
      rows
        .map((r) => r.body as CaseFile)
        .filter((x) => x.published)
        .map(summarize)
        .sort((a, b) => a.id.localeCompare(b.id)),
    );
  })
  .get("/cases/:id", async (c) => {
    requireUser(c);
    const { versionId, body } = await loadCase(c, c.req.param("id"));
    const res: ServerPublicCase = { caseVersionId: versionId, caseFile: toPublicCase(bindSprites(body)) };
    return c.json(res);
  })
  .post("/cases/:id/deductions/:deductionId/check", async (c) => {
    requireUser(c);
    const { optionId } = await parseBody(c, CheckDeductionBody);
    const { body } = await loadCase(c, c.req.param("id"));
    const verdict = judge.checkDeduction(body, c.req.param("deductionId"), optionId);
    if (!verdict) throw new ApiError(400, "invalid", "Нет такого варианта");
    return c.json(verdict);
  })
  .post("/cases/:id/hints/:level", async (c) => {
    requireUser(c);
    const { body } = await loadCase(c, c.req.param("id"));
    const hint = judge.revealHint(body, Number(c.req.param("level")));
    if (!hint) throw new ApiError(400, "invalid", "Нет такой подсказки");
    return c.json(hint);
  })
  .post("/cases/:id/restore", async (c) => {
    requireUser(c);
    const { deductionIds, hintsUsed } = await parseBody(c, RestoreBody);
    const { body } = await loadCase(c, c.req.param("id"));
    return c.json(judge.revealed(body, deductionIds, hintsUsed));
  })
  /** Разбор — студенту только после сдачи этого дела; преподавателю и администратору всегда. */
  .get("/cases/:id/debrief", async (c) => {
    const user = requireUser(c);
    const { body } = await loadCase(c, c.req.param("id"));
    if (user.role === "student") {
      const [done] = await c.var.db
        .select({ id: results.id })
        .from(results)
        .where(and(eq(results.userId, user.id), eq(results.caseId, body.id)))
        .limit(1);
      if (!done) throw new ApiError(403, "forbidden", "Разбор откроется после сдачи дела");
    }
    return c.json(body.solution);
  })
  /** Итог считает сервер по версии дела; результат записывается сразу (`source: "server"`). */
  .post("/cases/:id/finish", async (c) => {
    const user = requireUser(c);
    const input = await parseBody(c, FinishBody);
    const { body } = await loadCase(c, c.req.param("id"));
    const hintsUsed = Math.min(input.hintsUsed, body.hints.length);
    const finishInput: FinishInput = {
      answers: input.answers,
      hintsUsed,
      elapsedMs: input.elapsedMs,
      wrongDeductions: input.wrongDeductions,
      importantEvidence: input.importantEvidence,
    };
    const result = judge.finish(body, finishInput);
    const [row] = await c.var.db
      .insert(results)
      .values({
        userId: user.id,
        caseId: body.id,
        caseNumber: body.number,
        caseTitle: body.title,
        total: result.score.total,
        max: result.score.max,
        hintsUsed,
        wrongDeductions: input.wrongDeductions,
        elapsedMs: input.elapsedMs,
        score: result.score,
        input: finishInput,
        caseConfigVersion: result.caseConfigVersion,
        gameVersion: input.gameVersion ?? null,
        resultFormatVersion: RESULT_FORMAT_VERSION,
        source: "server",
        finishedAt: input.finishedAt ? new Date(input.finishedAt) : new Date(),
      })
      .returning();
    return c.json({ ...result, record: toServerResult(row) }, 201);
  });
