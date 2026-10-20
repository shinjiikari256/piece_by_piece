import type { CaseEvent, CaseFile } from "./case";
import { meets, type Progress } from "./conditions";

/** Год для сортировки, если у даты его нет: события без года идут в одном условном году. */
const NO_YEAR = 2000;
const MONTHS = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];

export interface EventMoment {
  /** Год, если автор его задал. */
  year?: number;
  month: number;
  day: number;
  /** Часы и минуты, если время задано. */
  hour?: number;
  minute?: number;
}

/** Разбор момента события; null, если строка не по формату или такой даты нет в календаре. */
export function parseEventTime(text: string): EventMoment | null {
  const m = /^(?:(\d{4})-)?(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?$/.exec(text);
  if (!m) return null;
  const year = m[1] ? Number(m[1]) : undefined;
  const month = Number(m[2]);
  const day = Number(m[3]);
  const hour = m[4] === undefined ? undefined : Number(m[4]);
  const minute = m[5] === undefined ? undefined : Number(m[5]);
  // 29 февраля без года считаем допустимым — высокосный условный год
  const daysIn = new Date(year ?? 2024, month, 0).getDate();
  if (month < 1 || month > 12 || day < 1 || day > daysIn) return null;
  if (hour !== undefined && (hour > 23 || minute! > 59)) return null;
  return { year, month, day, hour, minute };
}

/**
 * Год для дат без года: самый ранний год, который автор где-то задал, иначе условный.
 * Так событие «3 октября» встаёт рядом с «1 октября 2026», а не в начало или конец ленты.
 */
export function defaultEventYear(events: { at: string; until?: string }[]): number {
  const years = events.flatMap((e) => [e.at, e.until]).map((x) => (x ? parseEventTime(x)?.year : undefined)).filter((y): y is number => y !== undefined);
  return years.length ? Math.min(...years) : NO_YEAR;
}

/** Число для сортировки (минуты от условного начала); год без значения — `fallbackYear`. */
export function eventSortKey(text: string, fallbackYear = NO_YEAR): number {
  const t = parseEventTime(text);
  if (!t) return Number.POSITIVE_INFINITY;
  return Date.UTC(t.year ?? fallbackYear, t.month - 1, t.day, t.hour ?? 0, t.minute ?? 0) / 60000;
}

const pad = (n: number) => String(n).padStart(2, "0");
const clock = (t: EventMoment) => (t.hour === undefined ? "" : `${pad(t.hour)}:${pad(t.minute!)}`);
const dayText = (t: EventMoment) => `${t.day} ${MONTHS[t.month - 1]}${t.year ? ` ${t.year}` : ""}`;

/** Подпись для игрока: «14 марта, 21:30», «10 марта», «14 марта 2026»; диапазон — «14 марта, с 21:30 по 22:10» или «с 1 по 5 октября». */
export function formatEventTime(at: string, until?: string): string {
  const a = parseEventTime(at);
  if (!a) return at;
  const b = until ? parseEventTime(until) : null;
  if (!b) return [dayText(a), clock(a)].filter(Boolean).join(", ");
  const sameDay = a.year === b.year && a.month === b.month && a.day === b.day;
  if (sameDay) {
    if (a.hour === undefined && b.hour === undefined) return dayText(a);
    return `${dayText(a)}, с ${clock(a) || "00:00"} по ${clock(b) || "00:00"}`;
  }
  const from = [dayText(a), clock(a)].filter(Boolean).join(", ");
  const to = [dayText(b), clock(b)].filter(Boolean).join(", ");
  return `с ${from} по ${to}`;
}

/** Для ленты: день (ключ группировки и подпись) и время внутри дня («12:40», «12:40 – 17:15», «до 5 октября»; пусто — на весь день). */
export function eventParts(at: string, until?: string): { dayKey: string; day: string; when: string; range: boolean } {
  const a = parseEventTime(at);
  if (!a) return { dayKey: at, day: at, when: "", range: false };
  const b = until ? parseEventTime(until) : null;
  const day = dayText(a);
  const dayKey = `${a.year ?? ""}-${a.month}-${a.day}`;
  if (!b) return { dayKey, day, when: clock(a), range: false };
  if (dayText(b) === day) return { dayKey, day, when: a.hour === undefined && b.hour === undefined ? "" : `${clock(a) || "00:00"} – ${clock(b) || "00:00"}`, range: a.hour !== undefined || b.hour !== undefined };
  return { dayKey, day, when: `${clock(a)}${clock(a) ? " " : ""}до ${dayText(b)}${clock(b) ? `, ${clock(b)}` : ""}`.trim(), range: true };
}

/** Конец не раньше начала (сравнивается только то, что задано: события без года — в одном условном году). */
export const isRangeOrdered = (at: string, until: string) => eventSortKey(until) >= eventSortKey(at);

/**
 * Событие видно в хронологии, если игрок о нём узнал: найдена хотя бы одна улика, у которой оно в `relatedEvents`
 * (если таких улик в деле нет — это условие не действует), и выполнено `requires` (если задано).
 */
export function isEventKnown(c: Pick<CaseFile, "evidence">, ev: CaseEvent, p: Progress, locationId?: string): boolean {
  const sources = c.evidence.filter((e) => e.relatedEvents.includes(ev.id));
  if (sources.length && !sources.some((e) => p.collected.includes(e.id))) return false;
  return !ev.requires || meets(ev.requires, p, locationId);
}

/** События, известные игроку, по порядку времени (при равенстве — как в деле). */
export function knownEvents(c: Pick<CaseFile, "evidence" | "events">, p: Progress, locationId?: string): CaseEvent[] {
  const year = defaultEventYear(c.events);
  return c.events
    .map((ev, i) => ({ ev, i }))
    .filter(({ ev }) => isEventKnown(c, ev, p, locationId))
    .sort((x, y) => eventSortKey(x.ev.at, year) - eventSortKey(y.ev.at, year) || x.i - y.i)
    .map(({ ev }) => ev);
}
