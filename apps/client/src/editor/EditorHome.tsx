import { Suspense, lazy, useRef, useState } from "react";
import { formatDate } from "../util/format";
import { CaseFile } from "../../../../shared/case";
import { caseRepository } from "../content/repository";
import { deleteDraft, listDraftIds, readDraft } from "../content/drafts";
import { validateCase } from "../content/validate";
import { editor, useEditor } from "./state";
import { blankCase } from "./template";
import { Icon } from "../ui/icons";
import { ask } from "../ui/dialog";
import { confirmReplace, downloadJson, importJsonFile } from "./actions";
import { OFFLINE } from "../env";

/** Дела с сервера — онлайн-часть; в офлайн-файле её нет вовсе. */
const RemoteCases = OFFLINE ? null : lazy(() => import("./RemoteCases").then((m) => ({ default: m.RemoteCases })));

/** Стартовая страница конструктора: все дела — создать, импортировать, открыть, экспортировать. */
export function EditorHome() {
  const draft = useEditor((s) => s.draft);
  const dirty = useEditor((s) => s.dirty);
  const fileInput = useRef<HTMLInputElement>(null);
  const [, refresh] = useState(0);
  const drafts = listDraftIds()
    .map((id) => validateCase(readDraft(id)))
    .flatMap((r) => (r.ok ? [r.caseFile] : []));
  const draftIds = new Set(drafts.map((d) => d.id));
  const bundled = caseRepository.bundled().filter((c) => !draftIds.has(c.id));
  // версия дела до правок: сохранённый черновик, а если его нет — встроенное дело; у нового, ни разу не сохранённого дела отменять нечего
  const storedDraft = validateCase(readDraft(draft.id));
  const savedVersion = storedDraft.ok ? storedDraft.caseFile : caseRepository.bundled().find((c) => c.id === draft.id);
  const discardChanges = async () => {
    if (!savedVersion) return;
    if (!(await ask({ title: "Отменить изменения?", text: "Несохранённые правки в этом деле будут отброшены (вернуть их можно в редакторе сочетанием Ctrl+Z).", confirmLabel: "Отменить изменения", danger: true }))) return;
    editor.load(savedVersion);
  };
  const row = (c: CaseFile, kind: "draft" | "bundled") => (
    <li key={`${kind}:${c.id}`} className="eh__case">
      <span className="eh__num">№{c.number}</span>
      <span className="eh__info">
        <b>{c.title}</b>
        <span className="muted">
          {kind === "draft" ? "сохранено в конструкторе" : "встроенное дело"} · {c.published ? "видно игрокам" : "скрыто"}
          {c.updatedAt && ` · ${formatDate(c.updatedAt)}`}
        </span>
      </span>
      <button className="btn btn--primary" onClick={() => confirmReplace(() => editor.open(structuredClone(c)))}>
        Открыть
      </button>
      <button className="btn" onClick={() => downloadJson(c)} title="Скачать файл дела">
        Экспорт
      </button>
      {kind === "draft" && (
        <button
          className="btn"
          onClick={() => {
            void ask({ title: `Удалить «${c.title}»?`, text: "Сохранённое дело удалится из конструктора. Встроенные дела не пострадают.", confirmLabel: "Удалить", danger: true }).then(
              (ok) => {
                if (!ok) return;
                deleteDraft(c.id);
                refresh((n) => n + 1);
              },
            );
          }}
        >
          Удалить
        </button>
      )}
    </li>
  );
  return (
    <main className="eh">
      <header className="eh__head">
        <h1>Конструктор дел</h1>
        <div className="eh__actions">
          <button className="btn btn--primary" onClick={() => confirmReplace(() => editor.open(blankCase()))}>
            <Icon name="plus" size={15} /> Новое дело
          </button>
          <button className="btn" onClick={() => fileInput.current?.click()}>
            Импорт JSON…
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => e.target.files?.[0] && confirmReplace(() => importJsonFile(e.target.files![0]))}
          />
        </div>
      </header>
      {dirty && (
        <section className="eh__current">
          <span className="muted">Сейчас в работе</span>
          <b>
            №{draft.number} «{draft.title}»
          </b>
          <button className="btn btn--primary" onClick={() => editor.goto("general")}>
            Продолжить
          </button>
          {savedVersion && (
            <button className="btn" onClick={() => void discardChanges()}>
              Отменить изменения
            </button>
          )}
        </section>
      )}
      {drafts.length > 0 && (
        <>
          <h2>Сохранённые в конструкторе</h2>
          <ul className="eh__list list-reset">{drafts.map((c) => row(c, "draft"))}</ul>
        </>
      )}
      {RemoteCases && (
        <Suspense fallback={null}>
          <RemoteCases />
        </Suspense>
      )}
      <h2>Встроенные дела</h2>
      <ul className="eh__list list-reset">{bundled.map((c) => row(c, "bundled"))}</ul>
    </main>
  );
}
