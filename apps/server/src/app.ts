import { Hono } from "hono";
import { getCookie } from "hono/cookie";
import { SESSION_COOKIE, findSession } from "./auth";
import type { Db } from "./db";
import { ApiError, type AppConfig, type AppEnv } from "./http";
import { authRoutes } from "./routes/auth";
import { adminRoutes } from "./routes/admin";
import { attemptRoutes } from "./routes/attempts";
import { eventRoutes } from "./routes/events";
import { importRoutes } from "./routes/import";
import { caseRoutes } from "./routes/cases";
import { resultRoutes } from "./routes/results";

export function createApp(db: Db, config: AppConfig) {
  const app = new Hono<AppEnv>();

  app.use("*", async (c, next) => {
    c.set("db", db);
    c.set("config", config);
    c.set("user", null);
    c.set("sessionId", null);
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
    if (err instanceof ApiError)
      return c.json({ error: err.code, message: err.message }, err.status);
    console.error(err);
    return c.json({ error: "internal", message: "Ошибка сервера" }, 500);
  });
  app.notFound((c) =>
    c.json({ error: "not_found", message: "Не найдено" }, 404),
  );

  app.get("/api/health", (c) => c.json({ ok: true }));
  app.route("/api", authRoutes());
  app.route("/api", resultRoutes);
  app.route("/api", caseRoutes);
  app.route("/api", attemptRoutes);
  app.route("/api", eventRoutes);
  app.route("/api", importRoutes);
  app.route("/api/admin", adminRoutes);
  return app;
}
