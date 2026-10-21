import { Hono } from "hono";
import { and, desc, eq, lt } from "drizzle-orm";
import { MAX_SAVE_BYTES, SaveBody } from "../../../../shared/api";
import { saves } from "../db/schema";
import { ApiError, requireUser, type AppEnv } from "../http";

/** Сохранения расследований вошедшего игрока: клиент хранит копию и у себя, сервер — общую для всех устройств. */
export const saveRoutes = new Hono<AppEnv>()
  .get("/me/saves", async (c) => {
    const me = requireUser(c);
    const rows = await c.var.db.select({ body: saves.body }).from(saves).where(eq(saves.userId, me.id)).orderBy(desc(saves.savedAt));
    return c.json(rows.map((r) => r.body));
  })
  .get("/me/saves/:caseId", async (c) => {
    const me = requireUser(c);
    const [row] = await c.var.db
      .select({ body: saves.body })
      .from(saves)
      .where(and(eq(saves.userId, me.id), eq(saves.caseId, c.req.param("caseId"))));
    if (!row) throw new ApiError(404, "not_found", "Сохранения нет");
    return c.json(row.body);
  })
  /** Записать сохранение. Более старое, чем лежит на сервере, не затирает его (ответ `stale`). */
  .put("/me/saves/:caseId", async (c) => {
    const me = requireUser(c);
    const caseId = c.req.param("caseId");
    const text = await c.req.text();
    if (text.length > MAX_SAVE_BYTES) throw new ApiError(413, "too_large", "Сохранение слишком большое");
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      throw new ApiError(400, "invalid", "Сохранение не разобрать");
    }
    const parsed = SaveBody.safeParse(raw);
    if (!parsed.success || parsed.data.caseId !== caseId) throw new ApiError(400, "invalid", "Сохранение не подходит к делу");
    const { savedAt } = parsed.data;
    const values = { userId: me.id, caseId, body: parsed.data, savedAt, updatedAt: new Date() };
    // условие в `where` делает «не затирать свежее» атомарным: старое сохранение просто ничего не обновит
    const written = await c.var.db
      .insert(saves)
      .values(values)
      .onConflictDoUpdate({ target: [saves.userId, saves.caseId], set: values, setWhere: lt(saves.savedAt, savedAt) })
      .returning({ caseId: saves.caseId });
    return c.json({ result: written.length ? "saved" : "stale" });
  })
  .delete("/me/saves/:caseId", async (c) => {
    const me = requireUser(c);
    await c.var.db.delete(saves).where(and(eq(saves.userId, me.id), eq(saves.caseId, c.req.param("caseId"))));
    return c.json({ ok: true });
  });
