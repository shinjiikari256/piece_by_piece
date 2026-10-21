import { and, eq, inArray, isNull, or, type SQL } from "drizzle-orm";
import { type AdminUser, type JoinLink } from "../../../../../shared/api";
import type { Db } from "../../db";
import {
  auditLog,
  groupTeachers,
  groupViewers,
  groups,
  joinLinks,
  users,
} from "../../db/schema";
import { ApiError, userCore, type UserRow } from "../../http";

/**
 * Права:
 * - администратор — всё;
 * - преподаватель — студенты своих групп и студенты без группы (чтобы забрать их к себе):
 *   статус, группа (только своя или «без группы»), сброс пароля; ссылки своих групп. Роли — нет.
 */

export async function ownGroupIds(
  db: Db,
  teacherId: number,
): Promise<number[]> {
  const rows = await db
    .select({ id: groupTeachers.groupId })
    .from(groupTeachers)
    .where(eq(groupTeachers.userId, teacherId));
  return rows.map((r) => r.id);
}

/** Группы, студентов которых преподаватель может только смотреть (открыты администратором). */
export async function viewerGroupIds(
  db: Db,
  teacherId: number,
): Promise<number[]> {
  const rows = await db
    .select({ id: groupViewers.groupId })
    .from(groupViewers)
    .where(eq(groupViewers.userId, teacherId));
  return rows.map((r) => r.id);
}

/**
 * Условие «пользователь виден этому сотруднику». `read` — для списков и результатов: к своим группам
 * добавляются открытые для просмотра; `write` — для правки (статус, группа, пароль): только свои и без группы.
 */
export async function visibleUsers(
  db: Db,
  staff: UserRow,
  mode: "read" | "write" = "read",
): Promise<SQL | undefined> {
  if (staff.role === "admin") return undefined;
  const own = [
    ...(await ownGroupIds(db, staff.id)),
    ...(mode === "read" ? await viewerGroupIds(db, staff.id) : []),
  ];
  return and(
    eq(users.role, "student"),
    own.length
      ? or(isNull(users.groupId), inArray(users.groupId, own))
      : isNull(users.groupId),
  );
}

export async function assertGroupAccess(
  db: Db,
  staff: UserRow,
  groupId: number,
) {
  const [g] = await db
    .select({ id: groups.id })
    .from(groups)
    .where(eq(groups.id, groupId));
  if (!g) throw new ApiError(404, "not_found", "Группа не найдена");
  if (
    staff.role !== "admin" &&
    !(await ownGroupIds(db, staff.id)).includes(groupId)
  )
    throw new ApiError(403, "forbidden", "Это не ваша группа");
}

/** Ссылка по id; 404, если её нет, и 403, если группа чужая. */
export async function loadLinkFor(db: Db, staff: UserRow, id: number) {
  const [link] = await db.select().from(joinLinks).where(eq(joinLinks.id, id));
  if (!link) throw new ApiError(404, "not_found", "Ссылка не найдена");
  await assertGroupAccess(db, staff, link.groupId);
  return link;
}

export const audit = (
  db: Db,
  userId: number,
  action: string,
  payload: unknown,
) => db.insert(auditLog).values({ userId, action, payload });

export const toAdminUser = (
  u: UserRow,
  group: { id: number; name: string } | null,
): AdminUser => ({
  ...userCore(u, group),
  createdAt: u.createdAt.toISOString(),
  viaLink: u.joinLinkId !== null,
});

export const toLink = (
  l: typeof joinLinks.$inferSelect,
  registered = 0,
  pending = 0,
): JoinLink => ({
  id: l.id,
  groupId: l.groupId,
  token: l.token,
  expiresAt: l.expiresAt?.toISOString() ?? null,
  revokedAt: l.revokedAt?.toISOString() ?? null,
  createdAt: l.createdAt.toISOString(),
  registered,
  pending,
});
