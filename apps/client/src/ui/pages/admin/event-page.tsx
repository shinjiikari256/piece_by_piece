import { useEffect, useState } from "react";
import { DEBRIEF_POLICY_LABEL, type AdminGroup, type DebriefPolicy, type EventBody, type ServerCaseSummary, type ServerEvent } from "../../../../../../shared/api";
import { api } from "../../../state/api";
import { DateTimePicker } from "../../kit/DateTimePicker";
import { Icon } from "../../kit/icons";
import { Link, navigate } from "../../lib/router";
import { Select } from "../../kit/Select";
import { fail } from "./index";

// ---------- Мероприятия: создание, правка, настройка ----------

const POLICIES = (Object.keys(DEBRIEF_POLICY_LABEL) as DebriefPolicy[]).map((value) => ({ value, label: DEBRIEF_POLICY_LABEL[value] }));

interface Draft {
  title: string;
  opensAt: string | null;
  closesAt: string | null;
  debriefPolicy: DebriefPolicy;
  maxScoredAttempts: string;
  caseIds: string[];
  groupIds: number[];
}
const blank = (): Draft => ({ title: "", opensAt: null, closesAt: null, debriefPolicy: "immediate", maxScoredAttempts: "", caseIds: [], groupIds: [] });
const draftOf = (e: ServerEvent): Draft => ({
  title: e.title,
  opensAt: e.opensAt,
  closesAt: e.closesAt,
  debriefPolicy: e.debriefPolicy,
  maxScoredAttempts: e.maxScoredAttempts == null ? "" : String(e.maxScoredAttempts),
  caseIds: e.caseIds,
  groupIds: e.groupIds,
});

const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

export function EventPage({ id, groups }: { id: number | "new"; groups: AdminGroup[] }) {
  const [cases, setCases] = useState<ServerCaseSummary[]>([]);
  const [draft, setDraft] = useState<Draft | null>(id === "new" ? blank() : null);
  useEffect(() => {
    api<ServerCaseSummary[]>("GET", "/cases").then(setCases, fail);
    if (id === "new") return setDraft(blank());
    api<ServerEvent[]>("GET", "/events").then((list) => {
      const found = list.find((e) => e.id === id);
      if (found) setDraft(draftOf(found));
      else navigate("/admin/events");
    }, fail);
  }, [id]);

  if (!draft) return <p className="muted">Загрузка…</p>;
  const patch = (p: Partial<Draft>) => setDraft({ ...draft, ...p });
  const allCases = cases.length > 0 && cases.every((c) => draft.caseIds.includes(c.id));
  const badRange = !!draft.opensAt && !!draft.closesAt && draft.closesAt <= draft.opensAt;

  const save = async () => {
    const attempts = draft.maxScoredAttempts.trim();
    const body: EventBody = {
      title: draft.title,
      opensAt: draft.opensAt,
      closesAt: draft.closesAt,
      debriefPolicy: draft.debriefPolicy,
      maxScoredAttempts: attempts ? Number(attempts) : null,
      caseIds: draft.caseIds,
      groupIds: draft.groupIds,
    };
    try {
      await (id === "new" ? api("POST", "/admin/events", body) : api("PUT", `/admin/events/${id}`, body));
      navigate("/admin/events");
    } catch (e) {
      fail(e);
    }
  };

  return (
    <section>
      <header className="page__head page__head--back">
        <Link className="btn btn--icon" to="/admin/events" title="К списку мероприятий" aria-label="К списку мероприятий">
          <Icon name="back" />
        </Link>
        <h1>{id === "new" ? "Новое мероприятие" : "Мероприятие"}</h1>
      </header>
      <form
        className="card stack"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <input className="input" value={draft.title} onChange={(e) => patch({ title: e.target.value })} placeholder="Название, например «Зачёт по ГК РФ»" />
        <div className="stack">
          <span className="muted small">Открывается</span>
          <DateTimePicker label="Открывается" value={draft.opensAt} emptyLabel="сразу" onChange={(v) => patch({ opensAt: v })} />
        </div>
        <div className="stack">
          <span className="muted small">Закрывается</span>
          <DateTimePicker label="Закрывается" value={draft.closesAt} emptyLabel="не закрывается" onChange={(v) => patch({ closesAt: v })} />
          {badRange && (
            <span className="small" data-tone="bad">
              Закрытие должно быть позже открытия.
            </span>
          )}
        </div>
        <div className="pair">
          <label className="stack">
            <span className="muted small">Разбор дела студентам</span>
            <Select value={draft.debriefPolicy} options={POLICIES} onChange={(v) => patch({ debriefPolicy: v as DebriefPolicy })} />
          </label>
          <label className="stack">
            <span className="muted small">Зачётных попыток на дело</span>
            <input
              className="input"
              inputMode="numeric"
              value={draft.maxScoredAttempts}
              onChange={(e) => patch({ maxScoredAttempts: e.target.value.replace(/\D/g, "") })}
              placeholder="без ограничения"
            />
          </label>
        </div>
        <fieldset className="stack">
          <legend className="muted small">Дела</legend>
          <label className="form__check">
            <input type="checkbox" checked={allCases} onChange={(e) => patch({ caseIds: e.target.checked ? cases.map((c) => c.id) : [] })} />
            <b>Все дела</b>
          </label>
          {cases.map((c) => (
            <label key={c.id} className="form__check">
              <input type="checkbox" checked={draft.caseIds.includes(c.id)} onChange={() => patch({ caseIds: toggle(draft.caseIds, c.id) })} />
              <span>{c.title}</span>
            </label>
          ))}
        </fieldset>
        <fieldset className="stack">
          <legend className="muted small">Группы</legend>
          {groups.length === 0 && <span className="muted small">Групп пока нет.</span>}
          {groups.map((g) => (
            <label key={g.id} className="form__check">
              <input type="checkbox" checked={draft.groupIds.includes(g.id)} onChange={() => patch({ groupIds: toggle(draft.groupIds, g.id) })} />
              <span>{g.name}</span>
            </label>
          ))}
        </fieldset>
        <div className="row">
          <button className="btn btn--primary" type="submit" disabled={!draft.title.trim() || draft.caseIds.length === 0 || badRange}>
            Сохранить
          </button>
          <Link className="btn" to="/admin/events">
            Отмена
          </Link>
        </div>
      </form>
    </section>
  );
}
