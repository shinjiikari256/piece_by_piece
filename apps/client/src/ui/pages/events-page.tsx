import { useEffect, useState } from "react";
import { DEBRIEF_POLICY_LABEL, type ServerCaseSummary, type ServerEvent } from "../../../../../shared/api";
import { useAccount } from "../../state/account";
import { api, setReturnTo } from "../../state/api";
import { formatDate } from "../../util/format";
import { scorePercent, scoreTone } from "../components/common";
import { Link, navigate } from "../lib/router";
import { openCase } from "./screens";
import "./events-page.css";

type Phase = "soon" | "open" | "closed";
const PHASE: Record<Phase, { label: string; tone: "accent" | "good" | "warn" }> = {
  soon: { label: "скоро", tone: "accent" },
  open: { label: "идёт", tone: "good" },
  closed: { label: "закрыто", tone: "warn" },
};
const phaseOf = (e: ServerEvent): Phase => (e.open ? "open" : e.opensAt && new Date(e.opensAt) > new Date() ? "soon" : "closed");

const period = (e: ServerEvent) =>
  e.opensAt || e.closesAt ? [e.opensAt && `с ${formatDate(e.opensAt, true)}`, e.closesAt && `до ${formatDate(e.closesAt, true)}`].filter(Boolean).join(" ") : "без ограничения по времени";

/** Вкладка «Мероприятия»: мероприятия группы студента и дела в них; `/events/<id>` — одно мероприятие (сюда ведёт QR). */
export function EventsPage({ eventId }: { eventId?: number }) {
  const server = useAccount((s) => s.server);
  const me = useAccount((s) => s.me);
  const [events, setEvents] = useState<ServerEvent[] | null>(null);
  const [cases, setCases] = useState<ServerCaseSummary[]>([]);

  // не вошли — на вход, потом обратно сюда
  useEffect(() => {
    if (server === "online" && !me) {
      setReturnTo(eventId ? `/events/${eventId}` : "/events");
      navigate("/login");
    }
  }, [server, me, eventId]);
  useEffect(() => {
    if (server !== "online" || !me) return;
    api<ServerEvent[]>("GET", "/events").then(setEvents, () => setEvents([]));
    api<ServerCaseSummary[]>("GET", "/cases").then(setCases, () => setCases([]));
  }, [server, me]);

  if (server === "unknown" || !me) return null;
  if (server === "none") return <p className="page page--narrow muted">Мероприятия работают только с сервером.</p>;
  const student = me.role === "student";
  const shown = (events ?? []).filter((e) => eventId === undefined || e.id === eventId);

  return (
    <div className="page page--narrow">
      <header className="page__head">
        <h1>{eventId === undefined ? "Мероприятия" : (shown[0]?.title ?? "Мероприятие")}</h1>
        {eventId !== undefined && (
          <Link className="btn btn--sm" to="/events">
            Все мероприятия
          </Link>
        )}
      </header>
      {events && shown.length === 0 && <p className="muted">{eventId === undefined ? "Для вашей группы мероприятий пока нет." : "Это мероприятие недоступно: оно не открыто вашей группе или не существует."}</p>}
      <ul className="list-reset stack">
        {shown.map((e) => (
          <li key={e.id} className="card event-card" data-tone={PHASE[phaseOf(e)].tone}>
            <div className="event-card__head">
              <h2>{e.title}</h2>
              <span className="status" data-tone={PHASE[phaseOf(e)].tone}>
                {PHASE[phaseOf(e)].label}
              </span>
            </div>
            <p className="muted small">
              {period(e)} · разбор: {DEBRIEF_POLICY_LABEL[e.debriefPolicy]} · зачётных попыток: {e.maxScoredAttempts ?? "без ограничения"}
            </p>
            {!student && (
              <Link className="btn btn--sm" to={`/admin/events/${e.id}/results`}>
                Результаты мероприятия
              </Link>
            )}
            <ul className="list-reset event-cases">
              {e.caseIds.map((id) => {
                const c = cases.find((x) => x.id === id);
                const done = e.doneByCase?.[id] ?? 0;
                const best = e.bestByCase?.[id];
                const left = e.maxScoredAttempts == null ? null : Math.max(0, e.maxScoredAttempts - done);
                const canPlay = student && e.open && left !== 0;
                return (
                  <li key={id} className="event-case" data-tone={done > 0 ? "good" : undefined}>
                    <div className="event-case__body">
                      <b>{c ? `№${c.number} ${c.title}` : id}</b>
                      <span className="muted small">
                        {done > 0 ? "пройдено" : "не пройдено"}
                        {left === null ? (done > 0 ? ` · сдач: ${done}` : "") : ` · осталось попыток: ${left}`}
                      </span>
                    </div>
                    {best && (
                      <span className="score-pill" data-tone={scoreTone(best.total, best.max)} title={`${best.total} из ${best.max}`}>
                        {Math.round(scorePercent(best.total, best.max))}%
                      </span>
                    )}
                    {student && (
                      <button className="btn btn--sm btn--primary" disabled={!canPlay} onClick={() => void openCase(id, e.id).catch(() => undefined)}>
                        {done > 0 ? "Пройти ещё раз" : "Начать"}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  );
}
