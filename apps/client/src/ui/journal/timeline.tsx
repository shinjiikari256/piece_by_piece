import { useEffect, useMemo, useRef, useState } from "react";
import { useArrowNav } from "../hooks";
import { eventYear, formatEventTime, knownEvents, timelineEvents } from "../../../../../shared/events";
import { resolveLook } from "../../game/art";
import { useGame } from "../../state/store";
import { Portrait } from "../panels";
import { Select } from "../Select";
import { buildDays, DAY, layoutDay, type Day, type DayEntry } from "./timeline-layout";
import { useCase } from "./index";
import "./timeline.css";

// ---------- Хронология ----------

const MONTHS = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
const CARD_WIDTH = 176;
const pad = (n: number) => String(n).padStart(2, "0");

/** Дни, в которых что-то известно: у каждого своя шкала на 24 часа; события без времени и длящиеся — полосами. */
export function TimelineTab() {
  const caseFile = useCase();
  const progress = useGame((s) => s.progress);
  const locationId = useGame((s) => s.locationId);
  const [person, setPerson] = useState("all");
  const [selected, setSelected] = useState<string | null>(null);
  const [dayStart, setDayStart] = useState<number | null>(null);
  const list = useRef<HTMLUListElement>(null);
  useArrowNav(list, ".timeline__daybtn");

  const known = useMemo(() => timelineEvents(knownEvents(caseFile, progress, locationId)), [caseFile, progress, locationId]);
  /** Кто связан с событием — по найденным уликам (ненайденные не раскрываются). */
  const links = useMemo(() => {
    const found = caseFile.evidence.filter((e) => progress.collected.includes(e.id));
    return new Map(known.map((ev) => {
      const via = found.filter((e) => e.relatedEvents.includes(ev.id));
      return [ev.id, { people: [...new Set(via.flatMap((e) => e.relatedCharacters))], evidence: via }] as const;
    }));
  }, [caseFile, progress.collected, known]);
  const people = caseFile.characters.filter((c) => known.some((ev) => links.get(ev.id)?.people.includes(c.id)));
  const shown = person === "all" ? known : known.filter((ev) => links.get(ev.id)?.people.includes(person));

  const year = eventYear(caseFile);
  const days = useMemo(() => buildDays(shown, year), [shown, year]);

  if (!known.length) return <p className="empty">Пока ни одно событие не установлено. Находки и разговоры дополняют хронологию.</p>;

  const day = days.find((d) => d.start === dayStart) ?? days[0];
  const current = day?.entries.find((e) => e.ev.id === selected)?.ev;
  const pick = (start: number) => {
    setDayStart(start);
    setSelected(null);
  };
  const toggle = (id: string) => setSelected(id === selected ? null : id);

  return (
    <div className="timeline">
      {people.length > 0 && (
        <div className="timeline__tools">
          <Select
            variant="filter"
            label="Фигурант"
            highlight={person !== "all"}
            value={person}
            onChange={setPerson}
            options={[{ value: "all", label: "все" }, ...people.map((c) => ({ value: c.id, label: c.name, art: <Portrait look={resolveLook(c)} /> }))]}
          />
        </div>
      )}

      {!day ? (
        <p className="empty">У выбранного человека нет известных событий.</p>
      ) : (
        <div className="timeline__body">
          <ul className="timeline__days list-reset" ref={list} aria-label="Дни">
            {days.map((d) => (
              <li key={d.start}>
                <button className="timeline__daybtn" data-selected={d.start === day.start || undefined} aria-current={d.start === day.start || undefined} onClick={() => pick(d.start)}>
                  <span>{dayTitle(d)}</span>
                  <span className="timeline__count">{new Set(d.entries.map((e) => e.ev.id)).size}</span>
                </button>
              </li>
            ))}
          </ul>
          <div className="timeline__main">
            <DayCard key={day.start} day={day} selected={selected} onSelect={toggle} />
            {current ? (
              <article className="timeline__detail">
                <span className="timeline__detail-time">{formatEventTime(current.at, current.until)}</span>
                <h3>{current.title}</h3>
                <div className="row row--wrap">
                  {(links.get(current.id)?.people ?? []).map((id) => {
                    const c = caseFile.characters.find((x) => x.id === id);
                    return c && (
                      <span key={id} className="event-chip">
                        <Portrait look={resolveLook(c)} />
                        {c.name}
                      </span>
                    );
                  })}
                </div>
                {(links.get(current.id)?.evidence ?? []).length > 0 && <p className="muted">Известно из: {links.get(current.id)!.evidence.map((e) => e.title).join(" · ")}</p>}
              </article>
            ) : (
              <p className="muted">Выберите событие, чтобы увидеть подробности.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () => setWidth(Math.max(160, Math.round(el.clientWidth)));
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

function dayTitle(day: Day): string {
  const d = new Date(day.start * 60000);
  const explicit = day.entries.some((e) => /^\d{4}-/.test(e.ev.at) || (e.ev.until && /^\d{4}-/.test(e.ev.until)));
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}${explicit ? ` ${d.getUTCFullYear()}` : ""}`;
}

function cardWhen(e: DayEntry): string {
  const clock = (x: string) => formatEventTime(x).match(/\d{2}:\d{2}$/)?.[0];
  const from = clock(e.ev.at);
  const to = e.ev.until ? clock(e.ev.until) : undefined;
  switch (e.card.kind) {
    case "range":
      return from || to ? `${from ?? "00:00"} – ${to ?? "24:00"}` : "весь день";
    case "start":
      return from ? `с ${from}` : "начало";
    case "end":
      return to ? `до ${to}` : "конец";
    case "through":
      return "весь день";
    default:
      return from ?? "весь день";
  }
}

function DayCard({ day, selected, onSelect }: { day: Day; selected: string | null; onSelect: (id: string) => void }) {
  const [ref, width] = useWidth();
  const layout = useMemo(() => layoutDay(day.entries, width, CARD_WIDTH), [day, width]);
  const step = width < 520 ? 6 : 3;
  const hours = Array.from({ length: 24 / step + 1 }, (_, i) => i * step);
  const card = Math.min(CARD_WIDTH, width);
  return (
    <section className="timeline__daycard">
      <h3 className="timeline__daytitle">{dayTitle(day)}</h3>
      <div ref={ref} className="timeline__plot" style={{ ["--lanes" as string]: layout.lanes }}>
        {hours.map((h) => (
          <div key={h} className="timeline__tick" data-end={h === 24 || undefined} style={{ left: (h * 60 * width) / DAY }}>
            <span>{pad(h)}:00</span>
          </div>
        ))}
        {layout.placed.map((p) => {
          const e = day.entries[p.entry];
          const sel = selected === e.ev.id || undefined;
          return (
            <div key={p.entry} className="timeline__event" data-selected={sel} style={{ ["--lane-n" as string]: p.lane }}>
              {p.band && e.band ? (
                <div className="timeline__strip" data-open-start={e.band.openStart || undefined} data-open-end={e.band.openEnd || undefined} style={{ left: p.band.x0, width: Math.max(p.band.x1 - p.band.x0, 4) }}>
                  <span className="timeline__bar" />
                  {!e.band.openStart && <span className="timeline__cap" data-side="start" />}
                  {!e.band.openEnd && <span className="timeline__cap" data-side="end" />}
                </div>
              ) : (
                <span className="timeline__marker" style={{ left: p.marker }} />
              )}
              <button className="timeline__card" data-selected={sel} aria-pressed={!!sel} style={{ left: p.left, width: card }} onClick={() => onSelect(e.ev.id)} title={e.ev.title}>
                <span className="timeline__when">{cardWhen(e)}</span>
                <span className="timeline__title">{e.ev.title}</span>
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
