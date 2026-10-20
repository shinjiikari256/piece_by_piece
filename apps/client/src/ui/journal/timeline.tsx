import { useMemo } from "react";
import type { CaseEvent } from "../../../../../shared/case";
import { eventParts, knownEvents } from "../../../../../shared/events";
import { useGame } from "../../state/store";
import { useCase } from "./index";
import "./timeline.css";

// ---------- Хронология ----------

/** События, о которых игрок уже узнал: ось времени по дням, внутри дня — по часам. */
export function TimelineTab() {
  const caseFile = useCase();
  const progress = useGame((s) => s.progress);
  const locationId = useGame((s) => s.locationId);
  const days = useMemo(() => {
    const out: { key: string; day: string; items: { ev: CaseEvent; when: string; range: boolean }[] }[] = [];
    for (const ev of knownEvents(caseFile, progress, locationId)) {
      const { dayKey, day, when, range } = eventParts(ev.at, ev.until);
      let group = out[out.length - 1];
      if (group?.key !== dayKey) out.push((group = { key: dayKey, day, items: [] }));
      group.items.push({ ev, when, range });
    }
    return out;
  }, [caseFile, progress, locationId]);
  if (!days.length) return <p className="empty">Пока ни одно событие не установлено. Находки и разговоры дополняют хронологию.</p>;
  return (
    <div className="timeline">
      {days.map((d) => (
        <section key={d.key} className="timeline__day">
          <h3 className="timeline__date">{d.day}</h3>
          <ol className="list-reset">
            {d.items.map(({ ev, when, range }) => (
              <li key={ev.id} className="timeline__item" data-range={range || undefined}>
                <span className="timeline__when">{when}</span>
                <span className="timeline__mark" aria-hidden />
                <span className="timeline__title">{ev.title}</span>
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}
