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
  description: string;
  publishAt: string | null;
  opensAt: string | null;
  closesAt: string | null;
  requiredCases: string;
  debriefPolicy: DebriefPolicy;
  maxScoredAttempts: string;
  caseIds: string[];
  groupIds: number[];
}
const blank = (): Draft => ({
  title: "",
  description: "",
  publishAt: null,
  opensAt: null,
  closesAt: null,
  requiredCases: "",
  debriefPolicy: "immediate",
  maxScoredAttempts: "",
  caseIds: [],
  groupIds: [],
});
const draftOf = (e: ServerEvent): Draft => ({
  title: e.title,
  description: e.description,
  publishAt: e.publishAt,
  opensAt: e.opensAt,
  closesAt: e.closesAt,
  requiredCases: e.requiredCases == null ? "" : String(e.requiredCases),
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
      else navigate("/events");
    }, fail);
  }, [id]);

  if (!draft) return <p className="muted">Загрузка…</p>;
  const patch = (p: Partial<Draft>) => setDraft({ ...draft, ...p });
  const allCases = cases.length > 0 && cases.every((c) => draft.caseIds.includes(c.id));
  const badRange = !!draft.opensAt && !!draft.closesAt && draft.closesAt <= draft.opensAt;
  const badPublish = !!draft.publishAt && !!draft.opensAt && draft.publishAt > draft.opensAt;
  const required = Number(draft.requiredCases);
  const badRequired = draft.requiredCases.trim() !== "" && (required < 1 || required > draft.caseIds.length);

  const save = async () => {
    const attempts = draft.maxScoredAttempts.trim();
    const body: EventBody = {
      title: draft.title,
      description: draft.description,
      publishAt: draft.publishAt,
      opensAt: draft.opensAt,
      closesAt: draft.closesAt,
      requiredCases: draft.requiredCases.trim() ? Number(draft.requiredCases) : null,
      debriefPolicy: draft.debriefPolicy,
      maxScoredAttempts: attempts ? Number(attempts) : null,
      caseIds: draft.caseIds,
      groupIds: draft.groupIds,
    };
    try {
      await (id === "new" ? api("POST", "/admin/events", body) : api("PUT", `/admin/events/${id}`, body));
      navigate("/events");
    } catch (e) {
      fail(e);
    }
  };

  return (
    <section>
      <header className="page__head page__head--back">
        <Link className="btn btn--icon" to="/events" title="К списку мероприятий" aria-label="К списку мероприятий">
          <Icon name="back" />
        </Link>
        <h1>{id === "new" ? "Новое мероприятие" : "Мероприятие"}</h1>
      </header>
      <form
        className="stack event-form"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <section className="card stack">
          <h2>Основное</h2>
          <input className="input" value={draft.title} onChange={(e) => patch({ title: e.target.value })} placeholder="Название, например «Зачёт по ГК РФ»" />
          <textarea
            className="input"
            rows={3}
            value={draft.description}
            onChange={(e) => patch({ description: e.target.value })}
            placeholder="Описание для студентов: что за мероприятие, что нужно сделать (необязательно)"
          />
        </section>
        <section className="card stack">
          <h2>Сроки</h2>
          <div className="cols-3">
            <div className="stack">
              <span className="muted small">Видно студентам с</span>
              <DateTimePicker label="Видно студентам с" value={draft.publishAt} emptyLabel="сразу" onChange={(v) => patch({ publishAt: v })} />
              <span className="muted small">До этого момента мероприятия для студентов нет. Не позже начала.</span>
              {badPublish && (
                <span className="small" data-tone="bad">
                  Открытие для студентов должно быть не позже начала.
                </span>
              )}
            </div>
            <div className="stack">
              <span className="muted small">Начало</span>
              <DateTimePicker label="Начало" value={draft.opensAt} emptyLabel="сразу" onChange={(v) => patch({ opensAt: v })} />
              <span className="muted small">До начала студенты видят мероприятие, но не список дел.</span>
            </div>
            <div className="stack">
              <span className="muted small">Окончание</span>
              <DateTimePicker label="Окончание" value={draft.closesAt} emptyLabel="не заканчивается" onChange={(v) => patch({ closesAt: v })} />
              {badRange && (
                <span className="small" data-tone="bad">
                  Закрытие должно быть позже открытия.
                </span>
              )}
            </div>
          </div>
        </section>
        <section className="card stack">
          <h2>Правила прохождения</h2>
          <div className="cols-3">
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
            <label className="stack">
              <span className="muted small">Сколько дел достаточно сдать для успеха</span>
              <input className="input" inputMode="numeric" value={draft.requiredCases} onChange={(e) => patch({ requiredCases: e.target.value.replace(/\D/g, "") })} placeholder="все дела" />
              <span className="muted small">Берутся лучшие по проценту результаты. Не заполнено — нужны все дела.</span>
              {badRequired && (
                <span className="small" data-tone="bad">
                  От 1 до числа выбранных дел ({draft.caseIds.length}).
                </span>
              )}
            </label>
          </div>
        </section>
        <section className="card stack">
          <h2>Дела</h2>
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
        </section>
        <section className="card stack">
          <h2>Группы</h2>
          {groups.length === 0 && <span className="muted small">Групп пока нет.</span>}
          {groups.map((g) => (
            <label key={g.id} className="form__check">
              <input type="checkbox" checked={draft.groupIds.includes(g.id)} onChange={() => patch({ groupIds: toggle(draft.groupIds, g.id) })} />
              <span>{g.name}</span>
            </label>
          ))}
        </section>
        <div className="row event-form__actions">
          <button className="btn btn--primary" type="submit" disabled={!draft.title.trim() || draft.caseIds.length === 0 || badRange || badPublish || badRequired}>
            Сохранить
          </button>
          <Link className="btn" to="/events">
            Отмена
          </Link>
        </div>
      </form>
    </section>
  );
}
