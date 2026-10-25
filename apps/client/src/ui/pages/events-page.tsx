import { useEffect, useState } from "react";
import { DEBRIEF_POLICY_LABEL, type ServerCaseSummary, type ServerEvent } from "../../../../../shared/api";
import { useAccount } from "../../state/account";
import { api, setReturnTo } from "../../state/api";
import { formatDate } from "../../util/format";
import { scoreTone } from "../components/common";
import { ask } from "../kit/dialog";
import { Icon } from "../kit/icons";
import { compareEvents, durationText, PHASE, phaseOf, statusText, whenText } from "../lib/event-status";
import { Link, navigate, siteUrl } from "../lib/router";
import { CaseFileCard, openCase } from "./screens";
import "./events-page.css";

const period = (e: ServerEvent) =>
  e.opensAt || e.closesAt ? [e.opensAt && `с ${formatDate(e.opensAt, true)}`, e.closesAt && `до ${formatDate(e.closesAt, true)}`].filter(Boolean).join(" ") : "без ограничения по времени";

/** Текущее время для обратного отсчёта: раз в секунду, если до какого-то срока меньше часа, иначе реже. */
function useNow(events: ServerEvent[] | null): number {
  const [now, setNow] = useState(Date.now());
  const soon = (events ?? []).some((e) => [e.opensAt, e.closesAt].some((t) => t && Math.abs(new Date(t).getTime() - now) < 3_600_000));
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), soon ? 1000 : 30_000);
    return () => clearInterval(id);
  }, [soon]);
  return now;
}

/** Статус словами и сроки: до начала — длительность, потом — когда закончится. */
function StatusLine({ e, now, staff }: { e: ServerEvent; now: number; staff: boolean }) {
  const phase = phaseOf(e, now);
  const hidden = staff && e.publishAt && new Date(e.publishAt).getTime() > now;
  return (
    <span className="event-status">
      <span className="status" data-tone={PHASE[phase].tone}>
        {statusText(e, now)}
      </span>
      {phase === "soon" && <span className="muted small">{durationText(e)}</span>}
      {hidden && <span className="muted small">студентам не видно: откроется {whenText(e.publishAt!, now)}</span>}
    </span>
  );
}

const doneCount = (e: ServerEvent) => e.caseIds.filter((id) => (e.doneByCase?.[id] ?? 0) > 0).length;

const iconBtn = "btn btn--icon btn--sm";

/** Действия персонала над мероприятием: результаты, изменить, ссылка, удалить — кнопками-иконками. */
function EventActions({ e, onDeleted, results = true }: { e: ServerEvent; onDeleted: () => void; results?: boolean }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    void navigator.clipboard?.writeText(`${siteUrl()}events/${e.id}`).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  const remove = async () => {
    if (!(await ask({ title: `Удалить «${e.title}»?`, text: "Результаты сохранятся, но перестанут относиться к мероприятию.", confirmLabel: "Удалить", danger: true }))) return;
    try {
      await api("DELETE", `/admin/events/${e.id}`);
      onDeleted();
    } catch (err) {
      void ask({ title: "Не удалось удалить", text: err instanceof Error ? err.message : String(err), confirmLabel: "Понятно" });
    }
  };
  return (
    <span className="row event-actions">
      {results && (
        <Link className={iconBtn} to={`/admin/events/${e.id}/results`} title="Результаты и QR-код" aria-label="Результаты и QR-код">
          <Icon name="list" />
        </Link>
      )}
      <button className={iconBtn} onClick={copy} title={copied ? "Ссылка скопирована" : "Скопировать ссылку"} aria-label="Скопировать ссылку">
        <Icon name={copied ? "check" : "link"} />
      </button>
      <Link className={iconBtn} to={`/admin/events/${e.id}`} title="Изменить" aria-label="Изменить">
        <Icon name="pen" />
      </Link>
      <button className={`${iconBtn} btn--danger`} onClick={() => void remove()} title="Удалить" aria-label="Удалить">
        <Icon name="trash" />
      </button>
    </span>
  );
}

/** Вкладка «Мероприятия»: мероприятия группы студента и дела в них; `/events/<id>` — одно мероприятие (сюда ведёт QR). */
export function EventsPage({ eventId }: { eventId?: number }) {
  const server = useAccount((s) => s.server);
  const me = useAccount((s) => s.me);
  const [events, setEvents] = useState<ServerEvent[] | null>(null);
  const [cases, setCases] = useState<ServerCaseSummary[]>([]);
  const [reloadKey, setReloadKey] = useState(0);
  const now = useNow(events);

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
  }, [server, me, reloadKey]);
  // дела мероприятий в общий список не входят — берём список дел именно этого мероприятия
  useEffect(() => {
    if (server !== "online" || !me || eventId === undefined) return;
    api<ServerCaseSummary[]>("GET", `/cases?event=${eventId}`).then(setCases, () => setCases([]));
  }, [server, me, eventId]);

  if (server === "unknown" || !me) return null;
  if (server === "none") return <p className="page page--narrow muted">Мероприятия работают только с сервером.</p>;
  const student = me.role === "student";
  const reload = () => setReloadKey((k) => k + 1);
  const shown = (events ?? []).filter((e) => eventId === undefined || e.id === eventId).sort((x, y) => compareEvents(x, y, now));

  const one = eventId === undefined ? undefined : shown[0];
  const started = one ? phaseOf(one, now) !== "soon" : false;
  return (
    <div className="page page--narrow">
      <header className={eventId === undefined ? "page__head" : "page__head page__head--back"}>
        {eventId !== undefined && (
          <Link className="btn btn--icon" to="/events" title="Ко всем мероприятиям" aria-label="Ко всем мероприятиям">
            <Icon name="back" />
          </Link>
        )}
        <h1>{eventId === undefined ? "Мероприятия" : (one?.title ?? "Мероприятие")}</h1>
        {one && !student && <EventActions e={one} onDeleted={() => navigate("/events")} />}
        {eventId === undefined && !student && (
          <Link className="btn btn--primary event-create" to="/admin/events/new">
            <Icon name="plus" /> Создать
          </Link>
        )}
      </header>
      {events && shown.length === 0 && <p className="muted">{eventId === undefined ? (student ? "Для вашей группы мероприятий пока нет." : "Мероприятий пока нет.") : "Это мероприятие недоступно: оно не открыто вашей группе или не существует."}</p>}
      {eventId === undefined ? (
        <ul className="list-reset stack">
          {shown.map((e) => {
            const phase = phaseOf(e, now);
            // студент заходит в мероприятие, только когда оно началось; персонал — в результаты
            const to = student ? (phase === "soon" ? null : `/events/${e.id}`) : `/admin/events/${e.id}/results`;
            const done = Math.min(doneCount(e), e.required);
            return (
              // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions -- клик по карточке дублирует ссылку-заголовок и кнопку внутри: с клавиатуры работают они
              <li
                key={e.id}
                className="card event-card"
                data-tone={PHASE[phase].tone}
                data-link={to ? "" : undefined}
                onClick={(ev) => {
                  if (to && !(ev.target as HTMLElement).closest("a,button")) navigate(to);
                }}
              >
                <div className="event-card__head">
                  <h2>{to ? <Link to={to}>{e.title}</Link> : e.title}</h2>
                  <StatusLine e={e} now={now} staff={!student} />
                </div>
                {e.description && <p className="event-description">{e.description}</p>}
                {!student && (
                  <p className="muted small">
                    справились: {e.passed ?? 0} из {e.participants ?? 0} студентов
                  </p>
                )}
                <div className="row event-card__foot">
                  {to && (
                    <Link className="btn btn--sm btn--primary" to={to}>
                      {student ? "Дела" : "Результаты"}
                    </Link>
                  )}
                  {student && phase !== "soon" && (
                    <div className="event-progress">
                      <span className="progress" role="progressbar" aria-label="Сдано дел" aria-valuemin={0} aria-valuemax={e.required} aria-valuenow={done}>
                        <span className="progress__bar" style={{ width: `${(done / e.required) * 100}%` }} />
                      </span>
                      <span className="event-progress__text">
                        <b>
                          {done} из {e.required}
                        </b>
                        <span className="muted small">{e.required < e.caseCount ? `дел сдано (в мероприятии ${e.caseCount})` : "дел сдано"}</span>
                      </span>
                    </div>
                  )}
                  {!student && <EventActions e={e} onDeleted={reload} results={false} />}
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        one && (
          <>
            <div className="row">
              <StatusLine e={one} now={now} staff={!student} />
            </div>
            {one.description && <p className="event-description">{one.description}</p>}
            <p className="muted small">
              {period(one)} · разбор: {DEBRIEF_POLICY_LABEL[one.debriefPolicy]} · зачётных попыток: {one.maxScoredAttempts ?? "без ограничения"} · нужно дел: {one.required} из {one.caseCount}
            </p>
            {!started && student && <p className="muted">Список дел станет виден, когда мероприятие начнётся.</p>}
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
                    <CaseFileCard c={{ ...c, isDraft: false }} note={note} disabled={!student || !one.open || left === 0} onClick={() => void openCase(id, one.id).catch(() => undefined)} />
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
