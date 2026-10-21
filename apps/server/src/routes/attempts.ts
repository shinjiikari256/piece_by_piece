import { randomUUID } from "node:crypto";
import { Hono } from "hono";
import { and, asc, eq, lt } from "drizzle-orm";
import { AttemptStartBody, CheckDeductionBody, FinishBody, type ServerAttempt } from "../../../../shared/api";
import type { CaseFile } from "../../../../shared/case";
import * as judge from "../../../../shared/judge";
import { RESULT_FORMAT_VERSION, type CaseResult, type Revealed } from "../../../../shared/judge";
import { toPublicCase } from "../../../../shared/public-case";
import { bindSprites } from "../../../../shared/sprite-bindings";
import type { Db } from "../db";
import { attemptEvents, attempts, caseVersions, cases, results } from "../db/schema";
import { ApiError, parseBody, requireUser, type AppEnv, type Ctx } from "../http";
import { RateLimiter } from "../rate-limit";
import { toServerResult } from "./results";

type AttemptRow = typeof attempts.$inferSelect;

/** Активная попытка без событий дольше этого срока считается брошенной. */
const ABANDON_AFTER_MS = 30 * 86_400_000;
/** Проверок сопоставлений на одну попытку. */
const checks = new RateLimiter(10, 60_000);

/** Игровое время: от «Начать» без пауз; null — ещё не начато. */
export function elapsedMs(a: Pick<AttemptRow, "startedAt" | "pausedAt" | "pausedMs">, now = new Date()): number | null {
  if (!a.startedAt) return null;
  const paused = a.pausedMs + (a.pausedAt ? now.getTime() - a.pausedAt.getTime() : 0);
  return Math.max(0, now.getTime() - a.startedAt.getTime() - paused);
}

const log = (db: Db, attemptId: string, type: string, payload?: unknown, at = new Date()) =>
  db.insert(attemptEvents).values({ attemptId, type, payload: payload ?? null, at });

async function caseBody(db: Db, versionId: number): Promise<CaseFile> {
  const [row] = await db.select({ body: caseVersions.body }).from(caseVersions).where(eq(caseVersions.id, versionId));
  return row.body as CaseFile;
}

/** Своя действующая попытка или 404/409. */
async function ownAttempt(c: Ctx, id: string, userId: number): Promise<AttemptRow> {
  const [a] = await c.var.db.select().from(attempts).where(and(eq(attempts.id, id), eq(attempts.userId, userId)));
  if (!a) throw new ApiError(404, "not_found", "Попытка не найдена");
  return a;
}
function mustBeActive(a: AttemptRow) {
  if (a.status !== "active") throw new ApiError(409, "attempt_closed", "Это прохождение уже закрыто — начните дело заново");
}

const touch = (db: Db, id: string, set: Partial<AttemptRow> = {}, now = new Date()) =>
  db.update(attempts).set({ ...set, lastEventAt: now }).where(eq(attempts.id, id));

/** Судья на сервере: прохождения (попытки), проверки, подсказки, пауза и сдача. */
export const attemptRoutes = new Hono<AppEnv>()
  /** Начать дело или вернуться к начатому (с `fresh` — заново). */
  .post("/cases/:id/attempts", async (c) => {
    const user = requireUser(c);
    const { fresh } = await parseBody(c, AttemptStartBody);
    const db = c.var.db;
    const caseId = c.req.param("id");
    const now = new Date();

    // брошенные прохождения закрываем по ходу дела, отдельного фонового процесса нет
    const stale = await db
      .update(attempts)
      .set({ status: "abandoned", excludedFromStats: true, finishedAt: now })
      .where(and(eq(attempts.userId, user.id), eq(attempts.status, "active"), lt(attempts.lastEventAt, new Date(now.getTime() - ABANDON_AFTER_MS))))
      .returning({ id: attempts.id });
    for (const s of stale) await log(db, s.id, "abandoned", null, now);

    const [current] = await db
      .select({ id: cases.currentVersionId })
      .from(cases)
      .where(eq(cases.id, caseId));
    if (!current?.id) throw new ApiError(404, "not_found", "Дело не найдено");
    const currentBody = await caseBody(db, current.id);
    if (!currentBody.published && user.role === "student") throw new ApiError(404, "not_found", "Дело не найдено");

    let [a] = await db.select().from(attempts).where(and(eq(attempts.userId, user.id), eq(attempts.caseId, caseId), eq(attempts.status, "active")));
    if (a && fresh) {
      await db.update(attempts).set({ status: "reset", excludedFromStats: true, finishedAt: now }).where(eq(attempts.id, a.id));
      await log(db, a.id, "reset", null, now);
      a = undefined as unknown as AttemptRow;
    }
    if (a) {
      // вернулись: пауза заканчивается; если паузы не было (закрыли вкладку), время вне игры — с последнего события
      const away = a.pausedAt ? now.getTime() - a.pausedAt.getTime() : a.startedAt ? Math.max(0, now.getTime() - a.lastEventAt.getTime()) : 0;
      a = { ...a, pausedAt: null, pausedMs: a.pausedMs + away, lastEventAt: now };
      await db.update(attempts).set({ pausedAt: null, pausedMs: a.pausedMs, lastEventAt: now }).where(eq(attempts.id, a.id));
      if (away) await log(db, a.id, "resume", { awayMs: away }, now);
    } else {
      [a] = await db
        .insert(attempts)
        .values({ id: randomUUID(), userId: user.id, caseId, caseVersionId: current.id })
        .returning();
    }

    const body = a.caseVersionId === current.id ? currentBody : await caseBody(db, a.caseVersionId);
    const res: ServerAttempt = {
      attemptId: a.id,
      caseVersionId: a.caseVersionId,
      caseFile: toPublicCase(bindSprites(body)),
      started: !!a.startedAt,
      hintsUsed: a.hintsUsed,
      wrongDeductions: a.wrongDeductions,
      elapsedMs: elapsedMs(a, now),
    };
    return c.json(res);
  })
  /** «Начать расследование»: с этого момента идёт время. Повторный вызов ничего не меняет. */
  .post("/attempts/:id/start", async (c) => {
    const a = await ownAttempt(c, c.req.param("id"), requireUser(c).id);
    mustBeActive(a);
    if (!a.startedAt) {
      const now = new Date();
      await touch(c.var.db, a.id, { startedAt: now }, now);
      await log(c.var.db, a.id, "start", null, now);
    }
    return c.json({ ok: true });
  })
  /** Игрок вышел с сохранением: время стоит до возвращения. */
  .post("/attempts/:id/pause", async (c) => {
    const a = await ownAttempt(c, c.req.param("id"), requireUser(c).id);
    mustBeActive(a);
    if (a.startedAt && !a.pausedAt) {
      const now = new Date();
      await touch(c.var.db, a.id, { pausedAt: now }, now);
      await log(c.var.db, a.id, "pause", null, now);
    }
    return c.json({ ok: true });
  })
  .post("/attempts/:id/deductions/:deductionId/check", async (c) => {
    const a = await ownAttempt(c, c.req.param("id"), requireUser(c).id);
    mustBeActive(a);
    const { optionId } = await parseBody(c, CheckDeductionBody);
    if (!checks.take(a.id)) throw new ApiError(429, "too_many", "Слишком частые проверки — подождите минуту");
    const verdict = judge.checkDeduction(await caseBody(c.var.db, a.caseVersionId), c.req.param("deductionId"), optionId);
    if (!verdict) throw new ApiError(400, "invalid", "Нет такого варианта");
    const now = new Date();
    await touch(c.var.db, a.id, verdict.correct ? {} : { wrongDeductions: a.wrongDeductions + 1 }, now);
    await log(c.var.db, a.id, "check", { deductionId: c.req.param("deductionId"), optionId, correct: verdict.correct }, now);
    return c.json(verdict);
  })
  /** Подсказки идут по порядку; повторный запрос уже открытой ничего не стоит. */
  .post("/attempts/:id/hints/:level", async (c) => {
    const a = await ownAttempt(c, c.req.param("id"), requireUser(c).id);
    mustBeActive(a);
    const level = Number(c.req.param("level"));
    const body = await caseBody(c.var.db, a.caseVersionId);
    const sorted = [...body.hints].sort((x, y) => x.level - y.level);
    const index = sorted.findIndex((h) => h.level === level);
    if (index < 0) throw new ApiError(400, "invalid", "Нет такой подсказки");
    if (index > a.hintsUsed) throw new ApiError(400, "invalid", "Сначала откройте предыдущую подсказку");
    if (index === a.hintsUsed) {
      const now = new Date();
      await touch(c.var.db, a.id, { hintsUsed: a.hintsUsed + 1 }, now);
      await log(c.var.db, a.id, "hint", { level }, now);
    }
    return c.json(judge.revealHint(body, level));
  })
  /** Что игрок уже узнал в этом прохождении: выводы верно решённых сопоставлений и открытые подсказки. */
  .get("/attempts/:id/revealed", async (c) => {
    const a = await ownAttempt(c, c.req.param("id"), requireUser(c).id);
    const solved = await c.var.db
      .select({ payload: attemptEvents.payload })
      .from(attemptEvents)
      .where(and(eq(attemptEvents.attemptId, a.id), eq(attemptEvents.type, "check")))
      .orderBy(asc(attemptEvents.id));
    const ids = solved.map((e) => e.payload as { deductionId: string; correct: boolean }).filter((p) => p.correct).map((p) => p.deductionId);
    const revealed: Revealed = {
      ...judge.revealed(await caseBody(c.var.db, a.caseVersionId), ids, a.hintsUsed),
      wrongDeductions: a.wrongDeductions,
      elapsedMs: elapsedMs(a),
    };
    return c.json(revealed);
  })
  /** Сдача. Повторная сдача той же попытки возвращает тот же результат. */
  .post("/attempts/:id/finish", async (c) => {
    const user = requireUser(c);
    const a = await ownAttempt(c, c.req.param("id"), user.id);
    const input = await parseBody(c, FinishBody);
    const body = await caseBody(c.var.db, a.caseVersionId);

    if (a.status === "finished") {
      const [done] = await c.var.db.select().from(results).where(eq(results.attemptId, a.id));
      if (done) {
        const out: CaseResult & { record: unknown } = {
          score: done.score as CaseResult["score"],
          caseConfigVersion: done.caseConfigVersion,
          debrief: body.solution,
          record: toServerResult(done),
        };
        return c.json(out);
      }
    }
    mustBeActive(a);

    const now = new Date();
    const finishInput = {
      answers: input.answers,
      hintsUsed: a.hintsUsed,
      elapsedMs: elapsedMs(a, now),
      wrongDeductions: a.wrongDeductions,
      importantEvidence: input.importantEvidence,
    };
    const result = judge.finish(body, finishInput);
    const row = await c.var.db.transaction(async (tx) => {
      const [r] = await tx
        .insert(results)
        .values({
          userId: user.id,
          caseId: body.id,
          caseNumber: body.number,
          caseTitle: body.title,
          total: result.score.total,
          max: result.score.max,
          hintsUsed: a.hintsUsed,
          wrongDeductions: a.wrongDeductions,
          elapsedMs: finishInput.elapsedMs == null ? null : Math.round(finishInput.elapsedMs),
          score: result.score,
          input: finishInput,
          caseConfigVersion: result.caseConfigVersion,
          gameVersion: input.gameVersion ?? null,
          resultFormatVersion: RESULT_FORMAT_VERSION,
          source: "server",
          attemptId: a.id,
          finishedAt: now,
        })
        .returning();
      await tx.update(attempts).set({ status: "finished", finishedAt: now, lastEventAt: now }).where(eq(attempts.id, a.id));
      await tx.insert(attemptEvents).values({ attemptId: a.id, type: "finish", payload: { total: r.total }, at: now });
      return r;
    });
    return c.json({ ...result, record: toServerResult(row) }, 201);
  });
