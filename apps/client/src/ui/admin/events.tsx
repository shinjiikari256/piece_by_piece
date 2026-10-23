import { useCallback, useEffect, useState } from "react";
import { DEBRIEF_POLICY_LABEL, type AdminGroup, type ServerCaseSummary, type ServerEvent } from "../../../../../shared/api";
import { api } from "../../state/api";
import { ask } from "../dialog";
import { Link } from "../router";
import { fail } from "./index";
import { formatDate } from "../../util/format";

// ---------- Мероприятия: список ----------

export function EventsSection({ groups }: { groups: AdminGroup[] }) {
  const [events, setEvents] = useState<ServerEvent[]>([]);
  const [cases, setCases] = useState<ServerCaseSummary[]>([]);
  const load = useCallback(() => api<ServerEvent[]>("GET", "/events").then(setEvents, fail), []);
  useEffect(() => {
    void load();
    api<ServerCaseSummary[]>("GET", "/cases").then(setCases, fail);
  }, [load]);

  const remove = async (e: ServerEvent) => {
    if (!(await ask({ title: `Удалить «${e.title}»?`, text: "Результаты сохранятся, но перестанут относиться к мероприятию.", confirmLabel: "Удалить", danger: true }))) return;
    try {
      await api("DELETE", `/admin/events/${e.id}`);
      await load();
    } catch (err) {
      fail(err);
    }
  };

  const caseName = (id: string) => cases.find((c) => c.id === id)?.title ?? id;
  const groupName = (id: number) => groups.find((g) => g.id === id)?.name ?? `#${id}`;
  const period = (e: ServerEvent) =>
    e.opensAt || e.closesAt ? `${e.opensAt ? `с ${formatDate(e.opensAt, true)}` : ""} ${e.closesAt ? `до ${formatDate(e.closesAt, true)}` : ""}`.trim() : "без ограничения по времени";

  return (
    <section>
      <header className="page__head">
        <h1>Мероприятия</h1>
        <Link className="btn btn--primary" to="/admin/events/new">
          Новое мероприятие
        </Link>
      </header>
      <p className="muted">Мероприятие — набор дел для групп на заданное время: можно ограничить число зачётных попыток и выбрать, когда студентам показывать разбор.</p>
      {events.length === 0 && <p className="muted">Мероприятий пока нет.</p>}
      <ul className="list-reset stack">
        {events.map((e) => (
          <li key={e.id} className="card stack">
            <div className="row">
              <b>{e.title}</b>
              <span className="status" data-tone={e.open ? "good" : "warn"}>
                {e.open ? "идёт" : "закрыто"}
              </span>
            </div>
            <span className="muted small">{period(e)}</span>
            <span className="small">Дела: {e.caseIds.map(caseName).join(", ")}</span>
            <span className="small">Группы: {e.groupIds.length ? e.groupIds.map(groupName).join(", ") : "—"}</span>
            <span className="muted small">
              Разбор: {DEBRIEF_POLICY_LABEL[e.debriefPolicy]} · попыток: {e.maxScoredAttempts ?? "без ограничения"}
            </span>
            <div className="row">
              <Link className="btn btn--sm" to={`/admin/events/${e.id}`}>
                Изменить
              </Link>
              <button className="btn btn--sm btn--danger" onClick={() => void remove(e)}>
                Удалить
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
