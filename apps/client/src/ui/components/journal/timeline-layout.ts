import type { CaseEvent } from "../../../../../../shared/case";
import { eventSpan, parseEventTime } from "../../../../../../shared/events";

export const DAY = 24 * 60;

/** Карточка события в дне (одна на событие): где стоит и что подписывает. */
export interface DayCard {
  /** at — момент, range — диапазон внутри дня, start/end — день начала/конца длинного события, through — день посередине. */
  kind: "at" | "range" | "start" | "end" | "through";
  minute: number;
}

/** Событие внутри дня: карточка и (для длящихся и «на весь день») полоса над ней с отметками начала и конца. */
export interface DayEntry {
  ev: CaseEvent;
  /** `openStart`/`openEnd` — полоса продолжается за пределы этого дня (или время не указано): отметки на этом краю нет. */
  band?: { from: number; to: number; openStart: boolean; openEnd: boolean };
  card: DayCard;
}

export interface Day {
  /** Начало суток в минутах шкалы `eventSortKey`. */
  start: number;
  entries: DayEntry[];
}

const dayOf = (minute: number) => Math.floor(minute / DAY) * DAY;

/**
 * События (уже по порядку времени) → дни. Дни есть только там, где что-то происходит. В каждом дне у события одна карточка;
 * у события без времени и у длящегося над карточкой полоса, у настоящего начала и конца — отметки. Длящееся событие
 * попадает и в промежуточные дни, которые есть из-за других событий.
 */
export function buildDays(events: CaseEvent[], year: number): Day[] {
  const days = new Map<number, DayEntry[]>();
  const add = (day: number, entry: DayEntry) => days.set(day, [...(days.get(day) ?? []), entry]);
  const through: { ev: CaseEvent; from: number; to: number }[] = [];

  for (const ev of events) {
    const s = eventSpan(ev, year);
    const first = dayOf(s.start);
    if (ev.until === undefined) {
      const timed = parseEventTime(ev.at)?.hour !== undefined;
      if (timed) add(first, { ev, card: { kind: "at", minute: s.start - first } });
      else add(first, { ev, band: { from: 0, to: DAY, openStart: true, openEnd: true }, card: { kind: "at", minute: 0 } });
      continue;
    }
    const endDateOnly = parseEventTime(ev.until)?.hour === undefined;
    const last = Math.max(first, dayOf(s.end - (endDateOnly ? 1 : 0)));
    if (last === first) {
      add(first, { ev, band: { from: s.start - first, to: s.end - first, openStart: false, openEnd: false }, card: { kind: "range", minute: s.start - first } });
      continue;
    }
    add(first, { ev, band: { from: s.start - first, to: DAY, openStart: false, openEnd: true }, card: { kind: "start", minute: s.start - first } });
    add(last, { ev, band: { from: 0, to: s.end - last, openStart: true, openEnd: false }, card: { kind: "end", minute: 0 } });
    through.push({ ev, from: first, to: last });
  }
  for (const t of through)
    for (const day of days.keys()) if (day > t.from && day < t.to) add(day, { ev: t.ev, band: { from: 0, to: DAY, openStart: true, openEnd: true }, card: { kind: "through", minute: 0 } });

  return [...days.entries()].sort((a, b) => a[0] - b[0]).map(([start, entries]) => ({ start, entries }));
}

export interface PlacedEntry {
  entry: number;
  /** Левый край карточки, положение маркера (для момента) и полосы, px. */
  left: number;
  marker: number;
  band?: { x0: number; x1: number };
  lane: number;
}

export interface DayLayout {
  placed: PlacedEntry[];
  lanes: number;
}

/** Раскладка одного дня по ширине `width` (px): события — по дорожкам (полоса и карточка вместе), чтобы не налезали друг на друга. */
export function layoutDay(entries: DayEntry[], width: number, cardWidth: number): DayLayout {
  const px = (minute: number) => (minute / DAY) * width;
  const card = Math.min(cardWidth, width);
  const laneEnds: number[] = [];
  const placed = entries.map((e, entry): PlacedEntry => {
    const marker = px(e.card.minute);
    const left = Math.max(0, Math.min(width - card, marker));
    const band = e.band && { x0: px(e.band.from), x1: px(e.band.to) };
    const from = Math.min(left, band?.x0 ?? left);
    const to = Math.max(left + card, band?.x1 ?? 0);
    let lane = laneEnds.findIndex((end) => end <= from);
    if (lane < 0) lane = laneEnds.length;
    laneEnds[lane] = to + 6;
    return { entry, left, marker, band, lane };
  });
  return { placed, lanes: laneEnds.length };
}
