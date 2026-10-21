/** Первый свободный ключ вида `<prefix>1`, `<prefix>2`… среди занятых. */
export function freeId(prefix: string, taken: string[]): string {
  for (let i = 1; ; i++) if (!taken.includes(`${prefix}${i}`)) return `${prefix}${i}`;
}
