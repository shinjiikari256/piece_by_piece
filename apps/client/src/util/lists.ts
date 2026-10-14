/** Список со сдвинутым на `dir` элементом `i`; null — если сдвигать некуда (край списка). */
export function moveItem<T>(list: readonly T[], i: number, dir: -1 | 1): T[] | null {
  const j = i + dir;
  if (j < 0 || j >= list.length) return null;
  const next = [...list];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}
