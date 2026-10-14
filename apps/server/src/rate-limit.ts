/**
 * Ограничение частоты в памяти процесса: «не больше N раз за окно» на ключ.
 * Для одного сервера достаточно; при нескольких экземплярах — вынести в базу.
 */
export class RateLimiter {
  private hits = new Map<string, number[]>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}

  /** true — можно; попытка засчитывается. */
  take(key: string, now = Date.now()): boolean {
    const recent = (this.hits.get(key) ?? []).filter(
      (t) => now - t < this.windowMs,
    );
    if (recent.length >= this.limit) {
      this.hits.set(key, recent);
      return false;
    }
    recent.push(now);
    this.hits.set(key, recent);
    if (this.hits.size > 10_000) this.sweep(now);
    return true;
  }

  reset(key: string) {
    this.hits.delete(key);
  }

  private sweep(now: number) {
    for (const [k, ts] of this.hits)
      if (ts.every((t) => now - t >= this.windowMs)) this.hits.delete(k);
  }
}
