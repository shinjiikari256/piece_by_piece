import { useEffect, useState } from "react";
import type { AdminGroup, CaseVisibility } from "../../../../shared/api";
import { api, ApiFailure } from "../state/api";
import { TabbedModal } from "../ui/components/common";

type Mode = CaseVisibility["mode"];

const MODES: { mode: Mode; label: string; hint: string }[] = [
  { mode: "public", label: "Всем, включая гостей", hint: "Дело видно и без входа" },
  { mode: "all", label: "Всем авторизованным", hint: "Нужен вход, группа не важна" },
  { mode: "groups", label: "Только выбранным группам", hint: "Остальные студенты дела не видят" },
  { mode: "none", label: "Никому", hint: "Дело скрыто от студентов; открывается из конструктора и в мероприятиях" },
];

const sameIds = (a: number[], b: number[]) => a.length === b.length && a.every((x) => b.includes(x));

/** Видимость дела на сервере: хранится в базе, а не в файле дела (не уезжает в экспорт и офлайн-файл). Применяется кнопкой «Сохранить». */
export function VisibilityDialog({ caseId, number, title, published, onClose }: { caseId: string; number: string | number; title: string; published: boolean; onClose: () => void }) {
  const [saved, setSaved] = useState<CaseVisibility | null>(null);
  const [mode, setMode] = useState<Mode>("all");
  const [groupIds, setGroupIds] = useState<number[]>([]);
  const [groups, setGroups] = useState<AdminGroup[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<AdminGroup[]>("GET", "/admin/groups").then(setGroups, () => setGroups([]));
    api<CaseVisibility>("GET", `/admin/cases/${encodeURIComponent(caseId)}/visibility`).then(
      (v) => {
        setSaved(v);
        setMode(v.mode);
        setGroupIds(v.groupIds);
      },
      (e) => setError(e instanceof ApiFailure ? e.message : "Нет связи с сервером."),
    );
  }, [caseId]);

  const dirty = !!saved && (mode !== saved.mode || (mode === "groups" && !sameIds(groupIds, saved.groupIds)));
  const save = async () => {
    if (!saved) return;
    setError("");
    setBusy(true);
    try {
      const res = await api<Pick<CaseVisibility, "mode" | "groupIds">>("PUT", `/admin/cases/${encodeURIComponent(caseId)}/visibility`, { mode, groupIds });
      setSaved({ ...res, lockedGroupIds: saved.lockedGroupIds });
      setGroupIds(res.groupIds);
    } catch (e) {
      setError(e instanceof ApiFailure ? e.message : "Нет связи с сервером.");
    } finally {
      setBusy(false);
    }
  };

  const body = () => {
    if (!saved) return <p className="muted">{error || "Загрузка…"}</p>;
    const locked = saved.lockedGroupIds;
    const free = groups.filter((g) => !locked.includes(g.id));
    const allGroups = free.length > 0 && free.every((g) => groupIds.includes(g.id));
    const toggle = (id: number) => setGroupIds(groupIds.includes(id) ? groupIds.filter((g) => g !== id) : [...groupIds, id]);
    return (
      <div className="stack">
        <p className="muted small">Кому дело показывается в списке. Изменения применяются кнопкой «Сохранить».</p>
        <div className="chips-row" role="group" aria-label="Кому видно дело">
          {MODES.map((m) => (
            <button key={m.mode} className="toggle-chip" aria-pressed={mode === m.mode} title={m.hint} onClick={() => setMode(m.mode)}>
              {m.label}
            </button>
          ))}
        </div>
        {mode === "groups" && (
          <fieldset className="stack">
            <legend className="muted small">Группы</legend>
            {groups.length === 0 && <span className="muted small">Нет доступных групп.</span>}
            {free.length > 0 && (
              <label className="form__check">
                <input type="checkbox" checked={allGroups} onChange={(e) => setGroupIds(e.target.checked ? [...new Set([...groupIds, ...free.map((g) => g.id)])] : groupIds.filter((id) => locked.includes(id)))} />
                <b>Все группы</b>
              </label>
            )}
            {groups.map((g) => (
              <label key={g.id} className="form__check">
                <input type="checkbox" checked={groupIds.includes(g.id)} disabled={locked.includes(g.id)} onChange={() => toggle(g.id)} />
                <span>{g.name}</span>
              </label>
            ))}
            {locked.length > 0 && <p className="muted small">Групп, открытых администратором: {locked.length}. Вы их не меняете.</p>}
            {groupIds.length === 0 && <p className="muted small">Группы не выбраны: дело не увидит ни один студент (мероприятия на него это не влияет).</p>}
          </fieldset>
        )}
        {!published && <p className="muted small">Пока дело не показывается в списке («Показывать в списке дел» в общих данных), оно скрыто от всех независимо от доступа.</p>}
        <p className="muted small">Снятая видимость закрывает только новые попытки: начатое можно дойти до сдачи, результаты остаются. Дела мероприятий группа видит независимо от этой настройки.</p>
        {!dirty && !error && saved && <p className="muted small">Сохранено на сервере.</p>}
        {error && (
          <p className="small" data-tone="bad">
            {error}
          </p>
        )}
      </div>
    );
  };

  return (
    <TabbedModal tabs={[{ id: "visibility", label: "Видимость", icon: "eye" }]} size="narrow" onClose={onClose}>
      <div className="stack">
        <h3>
          №{number} «{title}»
        </h3>
        {body()}
        <div className="row">
          <button className="btn btn--primary" disabled={!dirty || busy} onClick={() => void save()}>
            Сохранить
          </button>
          <button className="btn" onClick={onClose}>
            Закрыть
          </button>
        </div>
      </div>
    </TabbedModal>
  );
}
