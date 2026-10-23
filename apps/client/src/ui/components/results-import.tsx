import { useRef, useState } from "react";
import type { ImportItemResult, ImportStatus } from "../../../../../shared/api";
import { api } from "../../state/api";
import { ApiFailure } from "../../state/api";
import { Select } from "../kit/Select";
import { tell } from "../kit/dialog";

const STATUS: Record<ImportStatus, { label: string; tone: "good" | "warn" | "bad" | "accent" }> = {
  imported: { label: "добавлен", tone: "good" },
  would_import: { label: "можно добавить", tone: "accent" },
  duplicate: { label: "уже есть", tone: "warn" },
  unmatched: { label: "студент не найден", tone: "bad" },
  ambiguous: { label: "несколько студентов", tone: "bad" },
  invalid: { label: "не файл результата", tone: "bad" },
  no_case: { label: "нет дела", tone: "bad" },
};

interface Entry {
  name: string;
  file: unknown;
  userId?: number;
  result?: ImportItemResult;
}

/** Импорт файлов результатов, присланных студентами (офлайн-версия или игра без входа). Баллы портал пересчитывает сам. */
export function ResultsImport({ students, onDone }: { students: { id: number; label: string }[]; onDone: () => void }) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const run = async (list: Entry[], dryRun: boolean) => {
    setBusy(true);
    try {
      const res = await api<ImportItemResult[]>("POST", "/admin/results/import", { dryRun, items: list.map((e) => ({ file: e.file, userId: e.userId })) });
      setEntries(list.map((e, i) => ({ ...e, result: res[i] })));
      if (!dryRun) onDone();
    } catch (e) {
      void tell({ title: "Не получилось", text: e instanceof ApiFailure ? e.message : "Ошибка связи с сервером" });
    } finally {
      setBusy(false);
    }
  };

  const pick = async (files: FileList | null) => {
    if (!files?.length) return;
    const list: Entry[] = [];
    for (const f of [...files].slice(0, 200)) {
      let file: unknown = null;
      try {
        file = JSON.parse(await f.text());
      } catch {
        /* не JSON — сервер отметит как «не файл результата» */
      }
      list.push({ name: f.name, file });
    }
    await run(list, true);
  };

  const setUser = (i: number, userId: number) => setEntries((l) => l.map((e, k) => (k === i ? { ...e, userId } : e)));
  const ready = entries.filter(
    (e) => e.result && (e.result.status === "would_import" || (e.userId && e.result.status !== "duplicate" && e.result.status !== "invalid" && e.result.status !== "no_case")),
  );

  return (
    <div className="card stack">
      <p className="muted">Выберите файлы результатов (.json), которые прислали студенты. Портал сам найдёт студента по ФИО и пересчитает баллы по ответам — цифры из файла не берутся.</p>
      <input ref={input} type="file" accept=".json,application/json" multiple hidden onChange={(e) => void pick(e.target.files).then(() => (e.target.value = ""))} />
      <div className="row">
        <button className="btn" disabled={busy} onClick={() => input.current?.click()}>
          Выбрать файлы
        </button>
        {entries.length > 0 && (
          <button className="btn btn--primary" disabled={busy || ready.length === 0} onClick={() => void run(entries, false)}>
            Добавить результаты ({ready.length})
          </button>
        )}
      </div>
      {entries.length > 0 && (
        <ul className="list-reset stack">
          {entries.map((e, i) => {
            const r = e.result;
            const st = r ? STATUS[r.status] : null;
            const needsUser = r && (r.status === "unmatched" || r.status === "ambiguous");
            return (
              <li key={i} className="row">
                <span className="small">{e.name}</span>
                <span className="small muted">
                  {r?.player} {r?.caseTitle && `· ${r.caseTitle}`}
                </span>
                {r?.total !== undefined && (
                  <span className="small">
                    {r.total}/{r.max}
                  </span>
                )}
                {st && (
                  <span className="status" data-tone={st.tone}>
                    {st.label}
                  </span>
                )}
                {r?.versionChanged && <span className="small muted">дело с тех пор менялось</span>}
                {needsUser && (
                  <Select
                    value={e.userId ? String(e.userId) : ""}
                    placeholder="Выберите студента"
                    options={
                      r.candidates?.map((c) => ({ value: String(c.id), label: `${c.fullName}${c.group ? ` · ${c.group}` : ""}` })) ?? students.map((s) => ({ value: String(s.id), label: s.label }))
                    }
                    onChange={(v) => setUser(i, Number(v))}
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
