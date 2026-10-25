import { useEffect, useState } from "react";
import { DEBRIEF_POLICY_LABEL, type ServerEvent } from "../../../../../shared/api";
import { useAccount } from "../../state/account";
import { api, setReturnTo } from "../../state/api";
import { formatDate } from "../../util/format";
import { scoreTone } from "../components/common";
import { Link, navigate } from "../lib/router";
import { CaseFileCard, openCase, useCaseList } from "./screens";
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
  const cases = useCaseList() ?? [];

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
  }, [server, me]);

  if (server === "unknown" || !me) return null;
  if (server === "none") return <p className="page page--narrow muted">Мероприятия работают только с сервером.</p>;
  const student = me.role === "student";
  const shown = (events ?? []).filter((e) => eventId === undefined || e.id === eventId);

  const one = eventId === undefined ? undefined : shown[0];
  return (
    <div className="page page--narrow">
      <header className="page__head">
        <h1>{eventId === undefined ? "Мероприятия" : (one?.title ?? "Мероприятие")}</h1>
        {one && (
          <span className="status" data-tone={PHASE[phaseOf(one)].tone}>
            {PHASE[phaseOf(one)].label}
          </span>
        )}
        {eventId !== undefined && (
          <Link className="btn btn--sm" to="/events">
            Все мероприятия
          </Link>
        )}
      </header>
      {events && shown.length === 0 && <p className="muted">{eventId === undefined ? "Для вашей группы мероприятий пока нет." : "Это мероприятие недоступно: оно не открыто вашей группе или не существует."}</p>}
      {eventId === undefined ? (
        <ul className="list-reset stack">
          {shown.map((e) => {
            const doneCases = e.caseIds.filter((id) => (e.doneByCase?.[id] ?? 0) > 0).length;
            return (
              <li key={e.id} className="card event-card" data-tone={PHASE[phaseOf(e)].tone}>
                <div className="event-card__head">
                  <h2>
                    <Link to={`/events/${e.id}`}>{e.title}</Link>
                  </h2>
                  <span className="status" data-tone={PHASE[phaseOf(e)].tone}>
                    {PHASE[phaseOf(e)].label}
                  </span>
                </div>
                {e.description && <p className="event-description">{e.description}</p>}
                <p className="muted small">
                  {period(e)} · дел: {e.caseIds.length}
                  {student && ` · пройдено: ${doneCases}`}
                </p>
                <div className="row">
                  <Link className="btn btn--sm btn--primary" to={`/events/${e.id}`}>
                    Открыть
                  </Link>
                  {!student && (
                    <Link className="btn btn--sm" to={`/admin/events/${e.id}/results`}>
                      Результаты
                    </Link>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        one && (
          <>
            {one.description && <p className="event-description">{one.description}</p>}
            <p className="muted small">
              {period(one)} · разбор: {DEBRIEF_POLICY_LABEL[one.debriefPolicy]} · зачётных попыток: {one.maxScoredAttempts ?? "без ограничения"}
            </p>
            {!student && (
              <div className="row">
                <Link className="btn btn--sm" to={`/admin/events/${one.id}/results`}>
                  Результаты мероприятия
                </Link>
              </div>
            )}
            <ul className="case-files">
              {one.caseIds.map((id) => {
                const c = cases.find((x) => x.id === id);
                if (!c) return null;
                const done = one.doneByCase?.[id] ?? 0;
                const best = one.bestByCase?.[id];
                const left = one.maxScoredAttempts == null ? null : Math.max(0, one.maxScoredAttempts - done);
                const note = `${done > 0 ? "Пройдено" : "Не пройдено"}${left === null ? (done > 0 ? ` · сдач: ${done}` : "") : ` · осталось попыток: ${left}`}`;
                return (
                  <li key={id} className={`case-files__item has-stamps-${best ? 1 : 0}`}>
                    <CaseFileCard c={c} note={note} disabled={!student || !one.open || left === 0} onClick={() => void openCase(id, one.id).catch(() => undefined)} />
                    {best && (
                      <span className="case-stamps">
                        <span className="case-stamp" data-tone={scoreTone(best.total, best.max)} title="Лучший результат в мероприятии">
                          <span className="case-stamp__label">Лучший</span>
                          <span>
                            <span className="case-stamp__total">{best.total}</span>
                            <span className="case-stamp__max">/{best.max}</span>
                          </span>
                        </span>
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </>
        )
      )}
    </div>
  );
}
