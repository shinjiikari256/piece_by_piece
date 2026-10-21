import { useCallback, useEffect, useState } from "react";
import { DEBRIEF_POLICY_LABEL, type AdminGroup, type DebriefPolicy, type EventBody, type ServerCaseSummary, type ServerEvent } from "../../../../../shared/api";
import { api } from "../../state/account";
import { ask, tell } from "../dialog";
import { Select } from "../Select";
import { fail } from "./index";
import { formatDate } from "../../util/format";

// ---------- Мероприятия ----------

const POLICIES = (Object.keys(DEBRIEF_POLICY_LABEL) as DebriefPolicy[]).map((value) => ({ value, label: DEBRIEF_POLICY_LABEL[value] }));
const pad = (n: number) => String(n).padStart(2, "0");

/** ISO → «ГГГГ-ММ-ДД чч:мм» по местному времени. */
const toLocal = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
/** «ГГГГ-ММ-ДД чч:мм» → ISO; пусто — null; не разобрали — undefined. */
const fromLocal = (text: string): string | null | undefined => {
  const t = text.trim();
  if (!t) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?$/.exec(t);
  if (!m) return undefined;
  const d = new Date(+m[1], +m[2] - 1, +m[3], +(m[4] ?? 0), +(m[5] ?? 0));
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
};

interface Draft {
  title: string;
  opensAt: string;
  closesAt: string;
  debriefPolicy: DebriefPolicy;
  maxScoredAttempts: string;
  caseIds: string[];
  groupIds: number[];
}
const blank = (): Draft => ({ title: "", opensAt: "", closesAt: "", debriefPolicy: "immediate", maxScoredAttempts: "", caseIds: [], groupIds: [] });
const draftOf = (e: ServerEvent): Draft => ({
  title: e.title,
  opensAt: toLocal(e.opensAt),
  closesAt: toLocal(e.closesAt),
  debriefPolicy: e.debriefPolicy,
  maxScoredAttempts: e.maxScoredAttempts == null ? "" : String(e.maxScoredAttempts),
  caseIds: e.caseIds,
  groupIds: e.groupIds,
});

const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

export function EventsSection({ groups }: { groups: AdminGroup[] }) {
  const [events, setEvents] = useState<ServerEvent[]>([]);
  const [cases, setCases] = useState<ServerCaseSummary[]>([]);
  const [editing, setEditing] = useState<{ id: number | null; draft: Draft } | null>(null);
  const load = useCallback(() => api<ServerEvent[]>("GET", "/events").then(setEvents, fail), []);
  useEffect(() => {
    void load();
    api<ServerCaseSummary[]>("GET", "/cases").then(setCases, fail);
  }, [load]);

  const save = async () => {
    if (!editing) return;
    const d = editing.draft;
    const opensAt = fromLocal(d.opensAt);
    const closesAt = fromLocal(d.closesAt);
    if (opensAt === undefined || closesAt === undefined) return void tell({ title: "Проверьте даты", text: "Дата — в виде 2026-10-21 09:00." });
    const attempts = d.maxScoredAttempts.trim();
    const body: EventBody = {
      title: d.title,
      opensAt,
      closesAt,
      debriefPolicy: d.debriefPolicy,
      maxScoredAttempts: attempts ? Number(attempts) : null,
      caseIds: d.caseIds,
      groupIds: d.groupIds,
    };
    try {
      await (editing.id === null ? api("POST", "/admin/events", body) : api("PUT", `/admin/events/${editing.id}`, body));
      setEditing(null);
      await load();
    } catch (e) {
      fail(e);
    }
  };
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
      </header>
      <p className="muted">Мероприятие — набор дел для групп на заданное время: можно ограничить число зачётных попыток и выбрать, когда студентам показывать разбор.</p>
      {!editing && (
        <button className="btn btn--primary" onClick={() => setEditing({ id: null, draft: blank() })}>
          Новое мероприятие
        </button>
      )}
      {editing && (
        <form
          className="card stack"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <input className="input" value={editing.draft.title} onChange={(e) => setEditing({ ...editing, draft: { ...editing.draft, title: e.target.value } })} placeholder="Название, например «Зачёт по ГК РФ»" />
          <div className="pair">
            <label className="stack">
              <span className="muted small">Открывается (ГГГГ-ММ-ДД чч:мм)</span>
              <input className="input" value={editing.draft.opensAt} onChange={(e) => setEditing({ ...editing, draft: { ...editing.draft, opensAt: e.target.value } })} placeholder="сразу" />
            </label>
            <label className="stack">
              <span className="muted small">Закрывается</span>
              <input className="input" value={editing.draft.closesAt} onChange={(e) => setEditing({ ...editing, draft: { ...editing.draft, closesAt: e.target.value } })} placeholder="не закрывается" />
            </label>
          </div>
          <div className="pair">
            <label className="stack">
              <span className="muted small">Разбор дела студентам</span>
              <Select value={editing.draft.debriefPolicy} options={POLICIES} onChange={(v) => setEditing({ ...editing, draft: { ...editing.draft, debriefPolicy: v as DebriefPolicy } })} />
            </label>
            <label className="stack">
              <span className="muted small">Зачётных попыток на дело</span>
              <input className="input" inputMode="numeric" value={editing.draft.maxScoredAttempts} onChange={(e) => setEditing({ ...editing, draft: { ...editing.draft, maxScoredAttempts: e.target.value.replace(/\D/g, "") } })} placeholder="без ограничения" />
            </label>
          </div>
          <fieldset className="stack">
            <legend className="muted small">Дела</legend>
            {cases.map((c) => (
              <label key={c.id} className="form__check">
                <input type="checkbox" checked={editing.draft.caseIds.includes(c.id)} onChange={() => setEditing({ ...editing, draft: { ...editing.draft, caseIds: toggle(editing.draft.caseIds, c.id) } })} />
                <span>{c.title}</span>
              </label>
            ))}
          </fieldset>
          <fieldset className="stack">
            <legend className="muted small">Группы</legend>
            {groups.length === 0 && <span className="muted small">Групп пока нет.</span>}
            {groups.map((g) => (
              <label key={g.id} className="form__check">
                <input type="checkbox" checked={editing.draft.groupIds.includes(g.id)} onChange={() => setEditing({ ...editing, draft: { ...editing.draft, groupIds: toggle(editing.draft.groupIds, g.id) } })} />
                <span>{g.name}</span>
              </label>
            ))}
          </fieldset>
          <div className="row">
            <button className="btn btn--primary" type="submit" disabled={!editing.draft.title.trim() || editing.draft.caseIds.length === 0}>
              Сохранить
            </button>
            <button className="btn" type="button" onClick={() => setEditing(null)}>
              Отмена
            </button>
          </div>
        </form>
      )}
      {events.length === 0 && !editing && <p className="muted">Мероприятий пока нет.</p>}
      <ul className="list-reset stack">
        {events.map((e) => (
          <li key={e.id} className="card stack">
            <div className="row">
              <b>{e.title}</b>
              <span className="status" data-tone={e.open ? "good" : "warn"}>{e.open ? "идёт" : "закрыто"}</span>
            </div>
            <span className="muted small">{period(e)}</span>
            <span className="small">Дела: {e.caseIds.map(caseName).join(", ")}</span>
            <span className="small">Группы: {e.groupIds.length ? e.groupIds.map(groupName).join(", ") : "—"}</span>
            <span className="muted small">
              Разбор: {DEBRIEF_POLICY_LABEL[e.debriefPolicy]} · попыток: {e.maxScoredAttempts ?? "без ограничения"}
            </span>
            <div className="row">
              <button className="btn btn--sm" onClick={() => setEditing({ id: e.id, draft: draftOf(e) })}>
                Изменить
              </button>
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
