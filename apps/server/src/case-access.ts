import { and, eq } from "drizzle-orm";
import type { Db } from "./db";
import { attempts, caseGroups, eventAccess, eventCases } from "./db/schema";
import type { CaseVisibility } from "./db/schema";

/**
 * Какие дела видит студент. Опубликованное дело с видимостью `all` — все; с видимостью `groups` — только группы
 * из `case_groups`. Дело мероприятия группа видит независимо от видимости: доступ даёт само мероприятие.
 */
export async function studentCaseIds(db: Db, groupId: number | null): Promise<Set<string>> {
  if (groupId === null) return new Set();
  const [byGroup, byEvent] = await Promise.all([
    db.select({ id: caseGroups.caseId }).from(caseGroups).where(eq(caseGroups.groupId, groupId)),
    db.select({ id: eventCases.caseId }).from(eventCases).innerJoin(eventAccess, eq(eventAccess.eventId, eventCases.eventId)).where(eq(eventAccess.groupId, groupId)),
  ]);
  return new Set([...byGroup, ...byEvent].map((r) => r.id));
}

/**
 * Видит ли студент дело. Снятая видимость закрывает только новые попытки: начатую (`resume`) можно дойти до сдачи.
 */
export async function studentSeesCase(db: Db, user: { id: number; groupId: number | null }, caseId: string, visibility: CaseVisibility, resume = true): Promise<boolean> {
  if (visibility === "all") return true;
  if (user.groupId !== null && (await studentCaseIds(db, user.groupId)).has(caseId)) return true;
  if (!resume) return false;
  const [active] = await db
    .select({ id: attempts.id })
    .from(attempts)
    .where(and(eq(attempts.userId, user.id), eq(attempts.caseId, caseId), eq(attempts.status, "active")))
    .limit(1);
  return !!active;
}
