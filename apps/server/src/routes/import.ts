import { Hono } from "hono";
import { and, desc, eq } from "drizzle-orm";
import { ImportBody, ResultFileSchema, type ImportItemResult, type ResultFile } from "../../../../shared/api";
import type { CaseFile } from "../../../../shared/case";
import * as judge from "../../../../shared/judge";
import { RESULT_FORMAT_VERSION } from "../../../../shared/judge";
import type { Db } from "../db";
import { caseVersions, groups, results, users } from "../db/schema";
import { ApiError, parseBody, requireStaff, type AppEnv } from "../http";
import { visibleUsers } from "./admin";

const norm = (s: string) => s.toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ").trim();

interface Candidate { id: number; fullName: string; group: string | null }

/** Студента ищем по ФИО (и по группе, если ФИО повторяется) среди тех, кого видит преподаватель. */
function match(file: ResultFile, people: Candidate[]): { user?: Candidate; many?: Candidate[] } {
  let found = people.filter((p) => norm(p.fullName) === norm(file.player.name));
  if (found.length > 1 && file.player.group.trim()) {
    const byGroup = found.filter((p) => p.group && norm(p.group) === norm(file.player.group));
    if (byGroup.length) found = byGroup;
  }
  if (found.length === 1) return { user: found[0] };
  return found.length > 1 ? { many: found } : {};
}

/** Версия дела, по которой играли офлайн (совпадает `updatedAt`); иначе текущая. */
async function versionFor(db: Db, caseId: string, configVersion: string | null): Promise<{ id: number; body: CaseFile; exact: boolean } | null> {
  const rows = await db.select().from(caseVersions).where(eq(caseVersions.caseId, caseId)).orderBy(desc(caseVersions.id));
  if (!rows.length) return null;
  const hit = configVersion ? rows.find((r) => (r.body as CaseFile).updatedAt === configVersion) : undefined;
  const row = hit ?? rows[0];
  return { id: row.id, body: row.body as CaseFile, exact: !!hit };
}

/** Импорт файлов результатов, пройденных без входа или офлайн: баллы пересчитываются по ответам. */
export const importRoutes = new Hono<AppEnv>().post("/admin/results/import", async (c) => {
  const staff = requireStaff(c);
  const { dryRun, items } = await parseBody(c, ImportBody);
  const db = c.var.db;
  const visible = await visibleUsers(db, staff);
  const people: Candidate[] = (
    await db
      .select({ id: users.id, fullName: users.fullName, group: groups.name })
      .from(users)
      .leftJoin(groups, eq(groups.id, users.groupId))
      .where(and(visible, eq(users.role, "student")))
  ).map((p) => ({ id: p.id, fullName: p.fullName, group: p.group }));

  const out: ImportItemResult[] = [];
  for (const item of items) {
    const parsed = ResultFileSchema.safeParse(item.file);
    if (!parsed.success) {
      out.push({ status: "invalid", message: "Это не файл результата игры" });
      continue;
    }
    const file = parsed.data;
    const base = { player: file.player.name, caseTitle: file.case.title };
    const version = await versionFor(db, file.case.id, file.case.configVersion);
    if (!version) {
      out.push({ ...base, status: "no_case", message: "Такого дела нет на портале" });
      continue;
    }
    let target: Candidate | undefined;
    if (item.userId !== undefined) {
      target = people.find((p) => p.id === item.userId);
      if (!target) throw new ApiError(403, "forbidden", "Этот студент вам недоступен");
    } else {
      const m = match(file, people);
      if (m.many) {
        out.push({ ...base, status: "ambiguous", message: "Подходит несколько студентов", candidates: m.many });
        continue;
      }
      target = m.user;
    }
    if (!target) {
      out.push({ ...base, status: "unmatched", message: "Студент с таким ФИО не найден" });
      continue;
    }
    const finishedAt = new Date(file.finishedAt);
    const [dup] = await db
      .select({ id: results.id })
      .from(results)
      .where(and(eq(results.userId, target.id), eq(results.caseId, file.case.id), eq(results.finishedAt, finishedAt)));
    const input: judge.FinishInput = { ...file.input, hintsUsed: Math.min(file.input.hintsUsed, version.body.hints.length) };
    const res = judge.finish(version.body, input);
    const info = { ...base, userId: target.id, total: res.score.total, max: res.score.max, versionChanged: !version.exact };
    if (dup) {
      out.push({ ...info, status: "duplicate", message: "Этот результат уже импортирован" });
      continue;
    }
    if (!dryRun) {
      await db.insert(results).values({
        userId: target.id,
        caseId: version.body.id,
        caseNumber: version.body.number,
        caseTitle: version.body.title,
        total: res.score.total,
        max: res.score.max,
        hintsUsed: input.hintsUsed,
        wrongDeductions: input.wrongDeductions,
        elapsedMs: input.elapsedMs == null ? null : Math.round(input.elapsedMs),
        score: res.score,
        input,
        caseConfigVersion: version.body.updatedAt ?? null,
        gameVersion: file.gameVersion,
        resultFormatVersion: RESULT_FORMAT_VERSION,
        source: "offline",
        finishedAt,
      });
    }
    out.push({ ...info, status: dryRun ? "would_import" : "imported" });
  }
  return c.json(out);
});
