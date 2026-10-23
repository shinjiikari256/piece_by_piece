import { Suspense, lazy, useRef, useState } from "react";
import { formatDate } from "../util/format";
import { CaseFile } from "../../../../shared/case";
import { caseRepository } from "../content/repository";
import { deleteDraft, listDraftIds, readDraft } from "../content/drafts";
import { validateCase } from "../content/validate";
import { editor, useEditor } from "./state";
import { blankCase } from "./template";
import { Icon } from "../ui/kit/icons";
import { ask } from "../ui/kit/dialog";
import { confirmReplace, downloadJson, importJsonFile } from "./actions";
import { OFFLINE } from "../env";
import { useAccount } from "../state/account";
import { CaseIconButton } from "./CaseIconButton";
import { Select } from "../ui/kit/Select";
import { CASE_SORTS, filterCases, sortCases, type CaseSort } from "./case-sort";

/** Дела с сервера — онлайн-часть; в офлайн-файле её нет вовсе. */
const RemoteCases = OFFLINE ? null : lazy(() => import("./RemoteCases").then((m) => ({ default: m.RemoteCases })));

/** Стартовая страница конструктора: все дела — создать, импортировать, открыть, экспортировать. */
export function EditorHome() {
  const draft = useEditor((s) => s.draft);
  const dirty = useEditor((s) => s.dirty);
  const fileInput = useRef<HTMLInputElement>(null);
  const [, refresh] = useState(0);
  const [serverVersion, setServerVersion] = useState(0);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<CaseSort>("updated");
  // с сервером дела живут только на нём: встроенные из сборки в списке не нужны
  const onServer = useAccount((a) => a.server === "online");
  const allDrafts = listDraftIds()
    .map((id) => validateCase(readDraft(id)))
    .flatMap((r) => (r.ok ? [r.caseFile] : []));
  const drafts = sortCases(filterCases(allDrafts, query), sort);
  const draftIds = new Set(allDrafts.map((d) => d.id));
  const bundled = onServer ? [] : sortCases(filterCases(caseRepository.bundled().filter((c) => !draftIds.has(c.id)), query), sort);
  // версия дела до правок: сохранённый черновик, а если его нет — встроенное дело; у нового, ни разу не сохранённого дела отменять нечего
  const storedDraft = validateCase(readDraft(draft.id));
  const savedVersion = storedDraft.ok ? storedDraft.caseFile : onServer ? undefined : caseRepository.bundled().find((c) => c.id === draft.id);
  const discardChanges = async () => {
    if (!savedVersion) return;
    if (
      !(await ask({
        title: "Отменить изменения?",
        text: "Несохранённые правки в этом деле будут отброшены (вернуть их можно в редакторе сочетанием Ctrl+Z).",
        confirmLabel: "Отменить изменения",
        danger: true,
      }))
    )
      return;
    editor.load(savedVersion);
  };
  const row = (c: CaseFile, kind: "draft" | "bundled") => (
    <li key={`${kind}:${c.id}`} className="eh__case">
      <span className="eh__num">№{c.number}</span>
      <span className="eh__info">
        <b>{c.title}</b>
        <span className="muted">
          {kind === "draft" ? "локальный черновик" : "встроенное дело"} · {c.published ? "видно игрокам" : "скрыто"}
          {c.updatedAt && ` · ${formatDate(c.updatedAt)}`}
        </span>
      </span>
      <span className="eh__buttons">
        {kind === "draft" && onServer && <CaseIconButton icon="cloud-up" label="Отправить на сервер" onClick={() => void import("./publish").then((m) => m.publishToServer(c)).then((done) => done && setServerVersion((n) => n + 1))} />}
        <CaseIconButton icon="pen" label="Редактировать" primary onClick={() => confirmReplace(() => editor.open(structuredClone(c)))} />
        <CaseIconButton icon="download" label="Экспорт в файл" onClick={() => downloadJson(c)} />
        {kind === "draft" && (
          <CaseIconButton
            icon="trash"
            label="Удалить черновик"
            danger
            onClick={() => {
              void ask({ title: `Удалить «${c.title}»?`, text: "Черновик удалится из браузера. Дела на сервере и встроенные не пострадают.", confirmLabel: "Удалить", danger: true }).then((ok) => {
                if (!ok) return;
                deleteDraft(c.id);
                refresh((n) => n + 1);
              });
            }}
          />
        )}
      </span>
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
          <input ref={fileInput} type="file" accept="application/json,.json" hidden onChange={(e) => e.target.files?.[0] && confirmReplace(() => importJsonFile(e.target.files![0]))} />
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
      <div className="eh__filters">
        <label className="eh__field eh__field--search">
          <span className="muted small">Поиск</span>
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Название или номер дела…" />
        </label>
        <label className="eh__field eh__field--sort">
          <span className="muted small">Сортировка</span>
          <Select value={sort} options={CASE_SORTS} onChange={(v) => setSort(v as CaseSort)} />
        </label>
      </div>
      {drafts.length > 0 && (
        <>
          <h2>Локальные черновики</h2>
          <ul className="eh__list list-reset">{drafts.map((c) => row(c, "draft"))}</ul>
        </>
      )}
      {RemoteCases && (
        <Suspense fallback={null}>
          <RemoteCases sort={sort} query={query} reloadKey={serverVersion} />
        </Suspense>
      )}
      {bundled.length > 0 && (
        <>
          <h2>Встроенные дела</h2>
          <ul className="eh__list list-reset">{bundled.map((c) => row(c, "bundled"))}</ul>
        </>
      )}
    </main>
  );
}
