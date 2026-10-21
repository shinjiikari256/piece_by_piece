import { useEffect, useState } from "react";
import type { AdminGroup, CaseVisibility } from "../../../../../shared/api";
import { api, ApiFailure, isStaff, useAccount } from "../../state/account";
import { editor, useEditor } from "../state";

type Mode = CaseVisibility["mode"];

export function VisibilitySection() {
  const draft = useEditor((s) => s.draft);
  const online = useAccount((a) => a.server === "online" && isStaff(a.me));
  return (
    <section className="ed__panel ed__panel--narrow">
      <h2>Видимость</h2>
      <p className="muted">Кому из игроков дело показывается в списке. Скрытое дело открывается только из конструктора.</p>
      <label className="ef ef--bool">
        <input type="checkbox" checked={draft.published} onChange={(e) => editor.update((d) => ({ ...d, published: e.target.checked }), "general")} />
        <span>Показывать в списке дел</span>
      </label>
      {online ? (
        <ServerVisibility caseId={draft.id} published={draft.published} />
      ) : (
        <p className="muted">Выбор групп доступен при работе с сервером: там живут группы и учётные записи.</p>
      )}
    </section>
  );
}

/** Видимость по группам хранится на сервере, не в файле дела: она не уезжает в экспорт и офлайн-файл. */
function ServerVisibility({ caseId, published }: { caseId: string; published: boolean }) {
  const [state, setState] = useState<CaseVisibility | "missing" | "loading">("loading");
  const [groups, setGroups] = useState<AdminGroup[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    setState("loading");
    api<AdminGroup[]>("GET", "/admin/groups").then(setGroups, () => setGroups([]));
    api<CaseVisibility>("GET", `/admin/cases/${encodeURIComponent(caseId)}/visibility`).then(
      setState,
      (e) => (e instanceof ApiFailure && e.status === 404 ? setState("missing") : setError(e instanceof ApiFailure ? e.message : "Нет связи с сервером.")),
    );
  }, [caseId]);

  if (state === "loading") return error ? <p className="muted">{error}</p> : <p className="muted">Загрузка…</p>;
  if (state === "missing") return <p className="muted">Дела ещё нет на сервере. Запишите его на сервер, и здесь появится выбор групп.</p>;

  const save = async (mode: Mode, groupIds: number[]) => {
    setError("");
    try {
      const res = await api<Pick<CaseVisibility, "mode" | "groupIds">>("PUT", `/admin/cases/${encodeURIComponent(caseId)}/visibility`, { mode, groupIds });
      setState({ ...res, lockedGroupIds: state.lockedGroupIds });
    } catch (e) {
      setError(e instanceof ApiFailure ? e.message : "Нет связи с сервером.");
    }
  };
  const locked = state.groupIds.filter((id) => state.lockedGroupIds.includes(id));
  const toggle = (id: number) => void save("groups", state.groupIds.includes(id) ? state.groupIds.filter((g) => g !== id) : [...state.groupIds, id]);

  return (
    <div className="stack">
      <div className="chips-row" role="group" aria-label="Кому видно дело">
        {(["all", "groups"] as const).map((m) => (
          <button key={m} className="toggle-chip" aria-pressed={state.mode === m} onClick={() => void save(m, state.groupIds)}>
            {m === "all" ? "Всем студентам" : "Только выбранным группам"}
          </button>
        ))}
      </div>
      {state.mode === "groups" && (
        <>
          <div className="chips-row">
            {groups.length === 0 && <span className="muted small">Нет доступных групп.</span>}
            {groups.map((g) => (
              <button key={g.id} className="toggle-chip" aria-pressed={state.groupIds.includes(g.id)} onClick={() => toggle(g.id)}>
                {state.groupIds.includes(g.id) ? "✓ " : ""}
                {g.name}
              </button>
            ))}
          </div>
          {locked.length > 0 && <p className="muted small">Ещё групп, открытых администратором: {locked.length}. Вы их не меняете.</p>}
          {state.groupIds.length === 0 && <p className="muted small">Группы не выбраны: дело не увидит ни один студент (мероприятия на него это не влияет).</p>}
        </>
      )}
      {!published && <p className="muted small">Пока дело не показывается в списке, оно скрыто от всех независимо от групп.</p>}
      <p className="muted small">Снятая видимость закрывает только новые попытки: начатое можно дойти до сдачи, результаты остаются. Дела мероприятий группа видит независимо от этой настройки.</p>
      {error && <p className="small" data-tone="bad">{error}</p>}
    </div>
  );
}
