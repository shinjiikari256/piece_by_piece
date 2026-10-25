import { Hono } from "hono";
import { and, desc, eq } from "drizzle-orm";
import { randomToken, sha256 } from "../../auth";
import { apiTokens } from "../../db/schema";
import { ApiTokenBody, SettingsBody, type ApiTokenInfo, type Settings } from "../../../../../shared/api";
import { ApiError, getSetting, parseBody, putSetting, requireAdmin, requireStaff, type AppEnv } from "../../http";

import { audit } from "./access";

export const settingsRoutes = new Hono<AppEnv>()
  .get("/settings", async (c) => {
    requireStaff(c);
    return c.json({
      registrationOpen: await getSetting(c.var.db, "registrationOpen", true),
    } satisfies Settings);
  })

  .put("/settings", async (c) => {
    const admin = requireAdmin(c);
    const body = await parseBody(c, SettingsBody);
    await putSetting(c.var.db, "registrationOpen", body.registrationOpen);
    await audit(c.var.db, admin.id, "settings.update", body);
    return c.json(body satisfies Settings);
  })

  /** API-токены администратора: действуют от его имени, но только на дела по ключу. Значение видно один раз при создании. */
  .get("/tokens", async (c) => {
    const admin = requireAdmin(c);
    const rows = await c.var.db.select().from(apiTokens).where(eq(apiTokens.userId, admin.id)).orderBy(desc(apiTokens.id));
    return c.json(
      rows.map((t): ApiTokenInfo => ({ id: t.id, name: t.name, createdAt: t.createdAt.toISOString(), lastUsedAt: t.lastUsedAt?.toISOString() ?? null, revokedAt: t.revokedAt?.toISOString() ?? null })),
    );
  })

  .post("/tokens", async (c) => {
    const admin = requireAdmin(c);
    const body = await parseBody(c, ApiTokenBody);
    const token = `pbp_${randomToken(32)}`;
    const [row] = await c.var.db.insert(apiTokens).values({ name: body.name, tokenHash: sha256(token), userId: admin.id }).returning();
    await audit(c.var.db, admin.id, "tokens.create", { id: row.id, name: body.name });
    return c.json({ id: row.id, name: row.name, token }, 201);
  })

  .delete("/tokens/:id", async (c) => {
    const admin = requireAdmin(c);
    const id = Number(c.req.param("id"));
    const [row] = await c.var.db.update(apiTokens).set({ revokedAt: new Date() }).where(and(eq(apiTokens.id, id), eq(apiTokens.userId, admin.id))).returning();
    if (!row) throw new ApiError(404, "not_found", "Токен не найден");
    await audit(c.var.db, admin.id, "tokens.revoke", { id });
    return c.json({ ok: true });
  });
