import { useMemo, useState } from "react";
import type { CaseEvent } from "../../../../../shared/case";
import { defaultEventYear, eventSpan, formatEventTime, knownEvents } from "../../../../../shared/events";
import { resolveLook } from "../../game/art";
import { useGame } from "../../state/store";
import { Portrait } from "../panels";
import { Select } from "../Select";
import { layoutTimeline, TIMELINE_DEFAULTS } from "./timeline-layout";
import { useCase } from "./index";
import "./timeline.css";

// ---------- Хронология ----------

const ZOOM = [1.5, 3, 6, 12];
const MONTHS = ["янв", "фев", "мар", "апр", "мая", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];
const pad = (n: number) => String(n).padStart(2, "0");

/** События, о которых игрок уже узнал, на шкале времени: моменты — метки, события, которые длились, — полосы. */
export function TimelineTab() {
  const caseFile = useCase();
  const progress = useGame((s) => s.progress);
  const locationId = useGame((s) => s.locationId);
  const [zoom, setZoom] = useState(1);
  const [person, setPerson] = useState("all");
  const [selected, setSelected] = useState<string | null>(null);

  const known = useMemo(() => knownEvents(caseFile, progress, locationId), [caseFile, progress, locationId]);
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

  const year = useMemo(() => defaultEventYear(caseFile.events), [caseFile.events]);
  const layout = useMemo(() => layoutTimeline(shown.map((ev) => eventSpan(ev, year)), { pxPerMin: ZOOM[zoom] }), [shown, year, zoom]);

  if (!known.length) return <p className="empty">Пока ни одно событие не установлено. Находки и разговоры дополняют хронологию.</p>;

  const tickLabel = (minute: number) => {
    const d = new Date(minute * 60000);
    return { day: `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`, clock: `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}` };
  };
  // подпись времени пропускаем, если она налезает на предыдущую
  let lastLabelX = -Infinity;
  const ticks = layout.ticks.map((t) => {
    const show = t.x - lastLabelX >= 56;
    if (show) lastLabelX = t.x;
    return { ...t, show, ...tickLabel(t.minute) };
  });
  const current = shown.find((ev) => ev.id === selected);

  return (
    <div className="timeline">
      <div className="timeline__tools">
        {people.length > 0 && (
          <Select
            variant="filter"
            label="Фигурант"
            highlight={person !== "all"}
            value={person}
            onChange={setPerson}
            options={[{ value: "all", label: "все" }, ...people.map((c) => ({ value: c.id, label: c.name, art: <Portrait look={resolveLook(c)} /> }))]}
          />
        )}
        <span className="timeline__zoom">
          Масштаб
          <button className="btn btn--sm btn--icon" aria-label="Мельче" disabled={zoom === 0} onClick={() => setZoom(zoom - 1)}>−</button>
          <button className="btn btn--sm btn--icon" aria-label="Крупнее" disabled={zoom === ZOOM.length - 1} onClick={() => setZoom(zoom + 1)}>+</button>
        </span>
      </div>

      {shown.length === 0 ? (
        <p className="empty">У выбранного человека нет известных событий.</p>
      ) : (
        <div className="timeline__scroll">
          <div className="timeline__plot" style={{ width: layout.width, ["--lanes" as string]: layout.lanes }}>
            {layout.breaks.map((b) => (
              <div key={b.x} className="timeline__break" style={{ left: b.x, width: b.width }} />
            ))}
            {ticks.map((t) => (
              <div key={t.minute} className="timeline__tick" style={{ left: t.x }}>
                {t.show && t.newDay && <span className="timeline__day">{t.day}</span>}
                {t.show && <span className="timeline__clock">{t.clock}</span>}
              </div>
            ))}
            {layout.placed.map((p) => {
              const ev = shown[p.index];
              return <Entry key={ev.id} ev={ev} x0={p.x0} x1={p.x1} lane={p.lane} selected={ev.id === selected} onSelect={() => setSelected(ev.id === selected ? null : ev.id)} />;
            })}
          </div>
        </div>
      )}

      {current && (
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
      )}
    </div>
  );
}

function Entry({ ev, x0, x1, lane, selected, onSelect }: { ev: CaseEvent; x0: number; x1: number; lane: number; selected: boolean; onSelect: () => void }) {
  const range = x1 > x0;
  return (
    <>
      <div className="timeline__span" data-range={range || undefined} data-selected={selected || undefined} style={{ left: x0, width: Math.max(x1 - x0, 0), ["--lane-n" as string]: lane }} />
      <button className="timeline__card" data-selected={selected || undefined} aria-pressed={selected} style={{ left: x0, width: TIMELINE_DEFAULTS.cardWidth, ["--lane-n" as string]: lane }} onClick={onSelect} title={ev.title}>
        <span className="timeline__when">{formatEventTime(ev.at, ev.until)}</span>
        <span className="timeline__title">{ev.title}</span>
      </button>
    </>
  );
}
