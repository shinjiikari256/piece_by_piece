import path from "node:path";
import { serve } from "@hono/node-server";
import { sweepRateHits } from "./rate-limit";
import { createApp } from "./app";
import { ensureAdmin } from "./bootstrap";
import { seedCases } from "./cases";
import { connectPostgres } from "./db";

/**
 * Сервер «По кусочкам». Переменные окружения:
 *   DATABASE_URL     postgres://…  (по умолчанию — база из docker-compose.yml)
 *   PORT             8787
 *   ADMIN_LOGIN / ADMIN_PASSWORD   первый администратор, если в базе его ещё нет
 *   SECURE_COOKIES   1 — cookie только по HTTPS (прод)
 *   TRUST_PROXY      1 — за Caddy: IP клиента из X-Forwarded-For
 *   OFFLINE_DIR      папка с шаблонами game.html / editor.html; вне production — offline/server (`pnpm offline:templates`)
 */
const env = process.env;
const { db, close } = await connectPostgres(
  env.DATABASE_URL ??
    "postgres://neraskrytoe:neraskrytoe@localhost:5433/neraskrytoe",
);

const admin = await ensureAdmin(db, env.ADMIN_LOGIN, env.ADMIN_PASSWORD);
if (admin === "created") console.log(`Создан администратор ${env.ADMIN_LOGIN}`);
if (admin === "skipped")
  console.warn(
    "В базе нет администратора: задайте ADMIN_LOGIN и ADMIN_PASSWORD и перезапустите сервер",
  );

const seeded = await seedCases(db);
if (seeded.created.length) console.log(`Дела обновлены: ${seeded.created.join(", ")}`);
for (const f of seeded.failed) console.error(`Дело пропущено — ${f}`);

const app = createApp(db, {
  secureCookies: env.SECURE_COOKIES === "1",
  trustProxy: env.TRUST_PROXY === "1",
  offlineDir: env.OFFLINE_DIR ?? (env.NODE_ENV === "production" ? undefined : path.resolve(import.meta.dirname, "../../../offline/server")),
});
void sweepRateHits(db);
setInterval(() => void sweepRateHits(db), 3_600_000).unref();
const port = Number(env.PORT ?? 8787);
const server = serve({ fetch: app.fetch, port }, () =>
  console.log(`API: http://localhost:${port}/api`),
);

for (const sig of ["SIGINT", "SIGTERM"] as const)
  process.on(sig, () => {
    server.close();
    void close().finally(() => process.exit(0));
  });
