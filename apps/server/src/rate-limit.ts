import { and, count, eq, gt, lt } from "drizzle-orm";
import type { Db } from "./db";
import { rateHits } from "./db/schema";

/**
 * Ограничение частоты «не больше N раз за окно» на ключ. Счётчики лежат в базе,
 * поэтому работают и при нескольких экземплярах сервера.
 */
export class RateLimiter {
  constructor(
    private readonly name: string,
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}

  private key(key: string) {
    return `${this.name}:${key}`;
  }

  /** true — можно; попытка засчитывается. */
  async take(db: Db, key: string, now = Date.now()): Promise<boolean> {
    const k = this.key(key);
    const since = new Date(now - this.windowMs);
    return db.transaction(async (tx) => {
      const [{ n }] = await tx
        .select({ n: count() })
        .from(rateHits)
        .where(and(eq(rateHits.key, k), gt(rateHits.at, since)));
      if (n >= this.limit) return false;
      await tx.insert(rateHits).values({ key: k, at: new Date(now) });
      // старые записи этого ключа больше не нужны
      await tx.delete(rateHits).where(and(eq(rateHits.key, k), lt(rateHits.at, since)));
      return true;
    });
  }

  async reset(db: Db, key: string) {
    await db.delete(rateHits).where(eq(rateHits.key, this.key(key)));
  }
}

/** Удалить записи старше суток (вызывается при старте и по таймеру). */
export async function sweepRateHits(db: Db, now = Date.now()) {
  await db.delete(rateHits).where(lt(rateHits.at, new Date(now - 86_400_000)));
}
