import { and, eq, isNull, lte, or } from "drizzle-orm";
import type { Db } from "./db";
import { attempts, caseGroups, eventAccess, eventCases, events } from "./db/schema";
import type { CaseVisibility } from "./db/schema";

/**
 * Какие дела видит студент. Опубликованное дело с видимостью `all` — все; с видимостью `groups` — только группы
 * из `case_groups`. Дело мероприятия группа может играть независимо от видимости, но только после начала мероприятия (`eventCaseIds`); в общий список оно не попадает.
 */
export async function studentCaseIds(db: Db, groupId: number | null): Promise<Set<string>> {
  if (groupId === null) return new Set();
  const rows = await db.select({ id: caseGroups.caseId }).from(caseGroups).where(eq(caseGroups.groupId, groupId));
  return new Set(rows.map((r) => r.id));
}

/** Дела начавшихся мероприятий группы (одного — если указан `eventId`). В общий список дел они не попадают. */
export async function eventCaseIds(db: Db, groupId: number | null, eventId?: number): Promise<Set<string>> {
  if (groupId === null) return new Set();
  const started = and(eq(eventAccess.groupId, groupId), or(isNull(events.opensAt), lte(events.opensAt, new Date())), eventId === undefined ? undefined : eq(events.id, eventId));
  const rows = await db.select({ id: eventCases.caseId }).from(eventCases).innerJoin(eventAccess, eq(eventAccess.eventId, eventCases.eventId)).innerJoin(events, eq(events.id, eventCases.eventId)).where(started);
  return new Set(rows.map((r) => r.id));
}

/**
 * Видит ли студент дело. Снятая видимость закрывает только новые попытки: начатую (`resume`) можно дойти до сдачи.
 */
export async function studentSeesCase(db: Db, user: { id: number; groupId: number | null }, caseId: string, visibility: CaseVisibility, resume = true): Promise<boolean> {
  if (visibility === "all" || visibility === "public") return true;
  if (user.groupId !== null && ((await studentCaseIds(db, user.groupId)).has(caseId) || (await eventCaseIds(db, user.groupId)).has(caseId))) return true;
  if (!resume) return false;
  const [active] = await db
    .select({ id: attempts.id })
    .from(attempts)
    .where(and(eq(attempts.userId, user.id), eq(attempts.caseId, caseId), eq(attempts.status, "active")))
    .limit(1);
  return !!active;
}
