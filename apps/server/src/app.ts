import { Hono } from "hono";
import { getCookie } from "hono/cookie";
import { and, eq, isNull } from "drizzle-orm";
import { SESSION_COOKIE, findSession, sha256 } from "./auth";
import { apiTokens, users } from "./db/schema";
import type { Db } from "./db";
import { ApiError, type AppConfig, type AppEnv } from "./http";
import { authRoutes } from "./routes/auth";
import { adminRoutes } from "./routes/admin";
import { attemptRoutes } from "./routes/attempts";
import { eventRoutes } from "./routes/events";
import { importRoutes } from "./routes/import";
import { caseAdminRoutes } from "./routes/case-admin";
import { caseRoutes } from "./routes/cases";
import { resultRoutes } from "./routes/results";
import { saveRoutes } from "./routes/saves";

export function createApp(db: Db, config: AppConfig) {
  const app = new Hono<AppEnv>();

  app.use("*", async (c, next) => {
    c.set("db", db);
    c.set("config", config);
    c.set("user", null);
    c.set("sessionId", null);
    c.set("viaToken", false);
    const bearer = /^Bearer (.+)$/.exec(c.req.header("authorization") ?? "")?.[1];
    if (bearer) {
      const [row] = await db
        .select({ id: apiTokens.id, user: users })
        .from(apiTokens)
        .innerJoin(users, eq(users.id, apiTokens.userId))
        .where(and(eq(apiTokens.tokenHash, sha256(bearer)), isNull(apiTokens.revokedAt)));
      if (!row || row.user.status === "blocked") return c.json({ error: "unauthorized", message: "Неверный или отозванный токен" }, 401);
      // токен открывает только чтение и запись дела по ключу
      if (!(["GET", "PUT"].includes(c.req.method) && /^\/api\/admin\/cases\/[^/]+$/.test(c.req.path))) {
        return c.json({ error: "forbidden", message: "Токен даёт доступ только к делам по ключу" }, 403);
      }
      c.set("user", row.user);
      c.set("viaToken", true);
      await db.update(apiTokens).set({ lastUsedAt: new Date() }).where(eq(apiTokens.id, row.id));
      return next();
    }
    const token = getCookie(c, SESSION_COOKIE);
    if (token) {
      const found = await findSession(db, token);
      // заблокированный пользователь — как будто не вошёл
      if (found && found.user.status !== "blocked") {
        c.set("user", found.user);
        c.set("sessionId", found.sessionId);
      }
    }
    await next();
  });

  app.onError((err, c) => {
    if (err instanceof ApiError) return c.json({ error: err.code, message: err.message }, err.status);
    console.error(err);
    return c.json({ error: "internal", message: "Ошибка сервера" }, 500);
  });
  app.notFound((c) => c.json({ error: "not_found", message: "Не найдено" }, 404));

  app.get("/api/health", (c) => c.json({ ok: true }));
  app.route("/api", authRoutes());
  app.route("/api", resultRoutes);
  app.route("/api", saveRoutes);
  app.route("/api", caseRoutes);
  app.route("/api", attemptRoutes);
  app.route("/api", eventRoutes);
  app.route("/api", importRoutes);
  app.route("/api/admin", adminRoutes);
  app.route("/api/admin", caseAdminRoutes);
  return app;
}
