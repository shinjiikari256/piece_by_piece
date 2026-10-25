import { useEffect, useState } from "react";
import { DEBRIEF_POLICY_LABEL, type EventParticipants, type ParticipantStatus } from "../../../../../../shared/api";
import { api } from "../../../state/api";
import { formatDate, percentOf } from "../../../util/format";
import { ServerResults } from "../../components/results-server";
import { QrCode, downloadQr } from "../../components/qr";
import { scoreTone } from "../../components/common";
import { Icon } from "../../kit/icons";
import { Select } from "../../kit/Select";
import { FolderTabs } from "../../kit/folder";
import { Link, setSearchParams, siteUrl, useSearchParam } from "../../lib/router";
import { fail } from "./index";

const STATUS: Record<ParticipantStatus, { label: string; tone: "good" | "warn" | "bad" }> = {
  done: { label: "прошёл", tone: "good" },
  active: { label: "в процессе", tone: "warn" },
  none: { label: "не приходил", tone: "bad" },
};

/** Страница мероприятия для преподавателя: участники и их прохождение, результаты только в рамках мероприятия, QR для студентов. */
export function EventResults({ id }: { id: number }) {
  const [filters, setFilters] = useState({ case: "", group: "", status: "", q: "" });
  const [data, setData] = useState<EventParticipants | null>(null);
  const tab = useSearchParam("tab") === "results" ? "results" : "participants";
  useEffect(() => {
    const p = new URLSearchParams(Object.entries(filters).filter(([, v]) => v));
    api<EventParticipants>("GET", `/admin/events/${id}/participants?${p}`).then(setData, fail);
  }, [id, filters]);
  if (!data) return null;
  const { event } = data;
  const link = `${siteUrl()}events/${event.id}`;
  const set = (patch: Partial<typeof filters>) => setFilters((f) => ({ ...f, ...patch }));
  const filtered = Object.values(filters).some(Boolean);

  return (
    <section className="stack">
      <header className="page__head page__head--back">
        <Link className="btn btn--icon" to="/events" title="К списку мероприятий" aria-label="К списку мероприятий">
          <Icon name="back" />
        </Link>
        <h1>{event.title}</h1>
        <span className="status" data-tone={event.open ? "good" : "warn"}>
          {event.open ? "идёт" : "закрыто"}
        </span>
        <Link className="btn btn--sm" to={`/admin/events/${event.id}`}>
          Изменить
        </Link>
      </header>
      {event.description && <p className="event-description">{event.description}</p>}
      <div className="card event-share">
        <QrCode text={link} />
        <div className="stack">
          <p className="muted small">
            {event.opensAt || event.closesAt
              ? [event.opensAt && `с ${formatDate(event.opensAt, true)}`, event.closesAt && `до ${formatDate(event.closesAt, true)}`].filter(Boolean).join(" ")
              : "Без ограничения по времени"}{" "}
            · разбор: {DEBRIEF_POLICY_LABEL[event.debriefPolicy]} · зачётных попыток: {event.maxScoredAttempts ?? "без ограничения"}
          </p>
          <p>
            Студенты открывают мероприятие по ссылке или QR-коду; при необходимости сначала входят в учётную запись.
            <br />
            <a href={link}>{link}</a>
          </p>
          <div className="row">
            <button className="btn btn--sm" onClick={() => void navigator.clipboard?.writeText(link)}>
              Копировать ссылку
            </button>
            <button className="btn btn--sm" onClick={() => void downloadQr(link, `qr-${event.title}`)}>
              Скачать QR
            </button>
          </div>
        </div>
      </div>

      <FolderTabs
        tabs={[
          { id: "participants", label: "Участники" },
          { id: "results", label: "Прохождения" },
        ]}
        active={tab}
        onTab={(t) => setSearchParams({ tab: t === "participants" ? null : t })}
      />
      {tab === "participants" && (
        <>
          <div className="toolbar">
            <input className="input" type="search" placeholder="Поиск по ФИО или логину" value={filters.q} onChange={(e) => set({ q: e.target.value })} />
            <Select
              value={filters.case}
              placeholder="Все дела"
              onChange={(v) => set({ case: v })}
              options={[{ value: "", label: "Все дела" }, ...data.cases.map((c) => ({ value: c.id, label: `№${c.number} «${c.title}»` }))]}
            />
            <Select
              value={filters.group}
              placeholder="Все группы"
              onChange={(v) => set({ group: v })}
              options={[{ value: "", label: "Все группы" }, ...data.groups.map((g) => ({ value: String(g.id), label: g.name }))]}
            />
            <Select
              value={filters.status}
              placeholder="Любой статус"
              onChange={(v) => set({ status: v })}
              options={[{ value: "", label: "Любой статус" }, ...(Object.keys(STATUS) as ParticipantStatus[]).map((s) => ({ value: s, label: STATUS[s].label }))]}
            />
            {filtered && (
              <button className="linkbtn" onClick={() => setFilters({ case: "", group: "", status: "", q: "" })}>
                Сбросить фильтры
              </button>
            )}
          </div>
          {data.items.length === 0 ? (
            <p className="muted">{filtered ? "Никого не нашли — измените фильтры." : "В группах мероприятия нет студентов, которых вы видите."}</p>
          ) : (
            <div className="card card--flush">
              <table className="table">
                <thead>
                  <tr>
                    <th scope="col">Студент</th>
                    {data.cases
                      .filter((c) => !filters.case || c.id === filters.case)
                      .map((c) => (
                        <th key={c.id} scope="col" title={c.title}>
                          №{c.number}
                        </th>
                      ))}
                    <th scope="col">Итог</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((p) => (
                    <tr key={p.user.id}>
                      <td>
                        <Link to={`/admin/users/${p.user.id}`}>{p.user.fullName}</Link>
                        {p.user.group && <div className="muted small">{p.user.group.name}</div>}
                      </td>
                      {data.cases
                        .filter((c) => !filters.case || c.id === filters.case)
                        .map((c) => {
                          const x = p.cases[c.id];
                          return (
                            <td key={c.id}>
                              <span className="status" data-tone={STATUS[x.status].tone}>
                                {STATUS[x.status].label}
                              </span>
                              {x.best && (
                                <div className="small">
                                  <span className="score-pill" data-tone={scoreTone(x.best.total, x.best.max)}>
                                    {percentOf(x.best.total, x.best.max)}%
                                  </span>{" "}
                                  <span className="muted">
                                    {x.done > 1 ? `× ${x.done}` : ""}
                                    {x.elapsedMs != null ? ` ${Math.max(1, Math.round(x.elapsedMs / 60_000))} мин` : ""}
                                  </span>
                                </div>
                              )}
                            </td>
                          );
                        })}
                      <td>
                        <span className="status" data-tone={STATUS[p.status].tone}>
                          {STATUS[p.status].label}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
      {tab === "results" && <ServerResults staff eventId={event.id} />}
    </section>
  );
}
