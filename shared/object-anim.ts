import type { ClipStep, LocationObject, ObjectState } from "./case";

/** Идентификатор вида по умолчанию (нет подходящего состояния) в переходах. */
export const DEFAULT_STATE = "default";

const matches = (pattern: string, id: string) => pattern === "*" || pattern === id;

/** Клип перехода `from → to`: первый подходящий по порядку (`*` — любое состояние). */
export function findTransition(o: Pick<LocationObject, "transitions">, from: string, to: string): ClipStep[] | null {
  return o.transitions?.find((t) => matches(t.from, from) && matches(t.to, to))?.clip ?? null;
}

export const clipDuration = (clip: ClipStep[]): number => clip.reduce((sum, s) => sum + s.ms, 0);

/** Кадр клипа через `t` мс после начала; `null` — клип закончился. */
export function clipFrameAt(clip: ClipStep[], t: number): string | null {
  let end = 0;
  for (const s of clip) {
    end += s.ms;
    if (t < end) return s.frame;
  }
  return null;
}

/** Кадр цикла через `t` мс: клип по кругу, между повторами пауза (`null` — виден кадр состояния). */
export function loopFrameAt(loop: NonNullable<ObjectState["loop"]>, t: number): string | null {
  const total = clipDuration(loop.clip);
  const cycle = total + (loop.pauseMs ?? 0);
  return cycle <= 0 ? null : clipFrameAt(loop.clip, t % cycle);
}
