import { useEffect, useState } from "react";
import { api, ApiFailure } from "../state/api";
import { TabbedModal } from "../ui/components/common";

interface EditorsInfo {
  teachers: { id: number; fullName: string }[];
  editorIds: number[];
  ownerId: number | null;
}

const sameIds = (a: number[], b: number[]) => a.length === b.length && a.every((x) => b.includes(x));

/** Соавторы дела на сервере: преподаватели, которые тоже могут записывать версии. Админ правит всё и в списке не нужен. */
export function EditorsDialog({ caseId, number, title, onClose }: { caseId: string; number: string | number; title: string; onClose: () => void }) {
  const [info, setInfo] = useState<EditorsInfo | null>(null);
  const [saved, setSaved] = useState<number[]>([]);
  const [ids, setIds] = useState<number[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const url = `/admin/cases/${encodeURIComponent(caseId)}/editors`;

  useEffect(() => {
    api<EditorsInfo>("GET", url).then(
      (v) => {
        setInfo(v);
        setSaved(v.editorIds);
        setIds(v.editorIds);
      },
      (e) => setError(e instanceof ApiFailure ? e.message : "Нет связи с сервером."),
    );
  }, [url]);

  const save = async () => {
    setError("");
    setBusy(true);
    try {
      const res = await api<{ editorIds: number[] }>("PUT", url, { userIds: ids });
      setSaved(res.editorIds);
      setIds(res.editorIds);
    } catch (e) {
      setError(e instanceof ApiFailure ? e.message : "Нет связи с сервером.");
    } finally {
      setBusy(false);
    }
  };

  const candidates = info?.teachers.filter((t) => t.id !== info.ownerId) ?? [];
  return (
    <TabbedModal tabs={[{ id: "editors", label: "Соавторы", icon: "user" }]} size="narrow" onClose={onClose}>
      <div className="stack">
        <h3>
          №{number} «{title}»
        </h3>
        {!info ? (
          <p className="muted">{error || "Загрузка…"}</p>
        ) : (
          <>
            <p className="muted small">Соавторы могут открывать дело и записывать новые версии, но не удаляют его и не меняют видимость. Администратор правит любое дело.</p>
            {candidates.length === 0 && <span className="muted small">Других преподавателей пока нет.</span>}
            <div className="chips-row" role="group" aria-label="Соавторы">
              {candidates.map((t) => {
                const on = ids.includes(t.id);
                return (
                  <button key={t.id} className="toggle-chip" aria-pressed={on} onClick={() => setIds(on ? ids.filter((x) => x !== t.id) : [...ids, t.id])}>
                    {on ? "✓ " : ""}
                    {t.fullName}
                  </button>
                );
              })}
            </div>
            {error && (
              <p className="small" data-tone="bad">
                {error}
              </p>
            )}
          </>
        )}
        <div className="row">
          <button className="btn btn--primary" disabled={!info || sameIds(ids, saved) || busy} onClick={() => void save()}>
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
