import type { CaseEvent } from "../../../../../shared/case";
import { eventSpan, parseEventTime } from "../../../../../shared/events";

export const DAY = 24 * 60;

/** Карточка на шкале дня: где стоит (минута суток), к какой стороне прижата и что подписывает. */
export interface DayCard {
  kind: "at" | "start" | "end";
  minute: number;
  anchor: "left" | "right";
}

/** Событие внутри дня: полоса (если оно длится или без времени — весь день) и карточки. */
export interface DayEntry {
  ev: CaseEvent;
  band?: { from: number; to: number };
  cards: DayCard[];
}

export interface Day {
  /** Начало суток в минутах шкалы `eventSortKey`. */
  start: number;
  entries: DayEntry[];
}

const dayOf = (minute: number) => Math.floor(minute / DAY) * DAY;

/**
 * События (уже по порядку времени) → дни. Дни есть только там, где что-то происходит:
 * у момента — карточка, у события со временем-диапазоном — карточки начала и конца,
 * событие без времени занимает весь день. Длящееся событие видно полосой и в промежуточных днях, которые есть из-за других событий.
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
      add(first, timed ? { ev, cards: [{ kind: "at", minute: s.start - first, anchor: "left" }] } : { ev, band: { from: 0, to: DAY }, cards: [{ kind: "at", minute: 0, anchor: "left" }] });
      continue;
    }
    const endDateOnly = parseEventTime(ev.until)?.hour === undefined;
    const last = Math.max(first, dayOf(s.end - (endDateOnly ? 1 : 0)));
    if (last === first) {
      add(first, { ev, band: { from: s.start - first, to: s.end - first }, cards: [{ kind: "start", minute: s.start - first, anchor: "left" }, { kind: "end", minute: s.end - first, anchor: "right" }] });
      continue;
    }
    add(first, { ev, band: { from: s.start - first, to: DAY }, cards: [{ kind: "start", minute: s.start - first, anchor: "left" }] });
    add(last, { ev, band: { from: 0, to: s.end - last }, cards: [{ kind: "end", minute: s.end - last, anchor: "right" }] });
    through.push({ ev, from: first, to: last });
  }
  for (const t of through) for (const day of days.keys()) if (day > t.from && day < t.to) add(day, { ev: t.ev, band: { from: 0, to: DAY }, cards: [] });

  return [...days.entries()].sort((a, b) => a[0] - b[0]).map(([start, entries]) => ({ start, entries }));
}

export interface PlacedCard {
  entry: number;
  card: number;
  /** Левый край карточки и положение маркера на шкале, px. */
  left: number;
  marker: number;
  lane: number;
}

export interface PlacedBand {
  entry: number;
  x0: number;
  x1: number;
  row: number;
}

export interface DayLayout {
  bands: PlacedBand[];
  cards: PlacedCard[];
  /** Сколько строк занимают полосы и дорожки карточек. */
  bandRows: number;
  lanes: number;
}

/** Раскладка одного дня по ширине `width` (px): полосы — по строке на полосу, карточки — по дорожкам, чтобы не налезали. */
export function layoutDay(entries: DayEntry[], width: number, cardWidth: number): DayLayout {
  const px = (minute: number) => (minute / DAY) * width;
  const card = Math.min(cardWidth, width);
  const bands: PlacedBand[] = [];
  entries.forEach((e, entry) => e.band && bands.push({ entry, x0: px(e.band.from), x1: px(e.band.to), row: bands.length }));

  const placed: PlacedCard[] = [];
  const laneEnds: number[] = [];
  entries.forEach((e, entry) =>
    e.cards.forEach((c, i) => {
      const marker = px(c.minute);
      const left = Math.max(0, Math.min(width - card, c.anchor === "left" ? marker : marker - card));
      let lane = laneEnds.findIndex((end) => end <= left);
      if (lane < 0) lane = laneEnds.length;
      laneEnds[lane] = left + card + 6;
      placed.push({ entry, card: i, left, marker, lane });
    }),
  );
  return { bands, cards: placed, bandRows: bands.length, lanes: laneEnds.length };
}
