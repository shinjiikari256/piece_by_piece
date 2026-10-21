import { Hono } from "hono";
import type { AppEnv } from "../../http";
import { groupsRoutes } from "./groups";
import { offlineRoutes } from "./offline";
import { settingsRoutes } from "./settings";
import { usersRoutes } from "./users";

export { ownGroupIds, visibleUsers } from "./access";

/** Права: администратор — всё; преподаватель — студенты своих групп и без группы (подробнее — в `access.ts`). */
export const adminRoutes = new Hono<AppEnv>()
  .route("/", usersRoutes)
  .route("/", groupsRoutes)
  .route("/", offlineRoutes)
  .route("/", settingsRoutes);
