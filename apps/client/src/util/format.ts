/** Даты интерфейса по-русски: только дата (14.03.2026) или дата и время (14.03.2026, 21:30). */
export function formatDate(value: Date | string | number, withTime = false): string {
  const d = value instanceof Date ? value : new Date(value);
  return withTime ? d.toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : d.toLocaleDateString("ru-RU");
}

/** Доля в процентах, округлённая; 0, если делить не на что. */
export function percentOf(part: number, total: number): number {
  return total > 0 ? Math.round((part / total) * 100) : 0;
}
