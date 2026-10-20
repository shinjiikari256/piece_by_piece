import { useMemo } from "react";
import { knownEvents, formatEventTime } from "../../../../../shared/events";
import { useGame } from "../../state/store";
import { useCase } from "./index";
import "./timeline.css";

// ---------- Хронология ----------

/** События, о которых игрок уже узнал, по порядку времени. */
export function TimelineTab() {
  const caseFile = useCase();
  const progress = useGame((s) => s.progress);
  const locationId = useGame((s) => s.locationId);
  const events = useMemo(() => knownEvents(caseFile, progress, locationId), [caseFile, progress, locationId]);
  if (!events.length) return <p className="empty">Пока ни одно событие не установлено. Находки и разговоры дополняют хронологию.</p>;
  return (
    <ol className="timeline list-reset">
      {events.map((ev) => (
        <li key={ev.id} className="timeline__item">
          <span className="timeline__time">{formatEventTime(ev.at, ev.until)}</span>
          <span className="timeline__title">{ev.title}</span>
        </li>
      ))}
    </ol>
  );
}
