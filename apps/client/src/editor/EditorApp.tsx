import { useEffect, useRef, useState } from "react";
import { useArrowNav, useWindowKey } from "../ui/hooks";
import { formatDate } from "../util/format";
import { useEditorUrl } from "./url";
import { setMapDock, useMapDock } from "./layout";
import { z } from "zod";
import { CaseFile } from "../../../../shared/case";
import { parseCase } from "../../../../shared/migrate";
import { caseRepository } from "../content/repository";
import { deleteDraft, listDraftIds, readDraft } from "../content/drafts";
import { validateCase } from "../content/validate";
import { editor, editorStore, useEditor, type SectionId } from "./state";
import { type JS } from "./SchemaForm";
import { Alert } from "../ui/alert";
import { blankCase } from "./template";
import { MapEditor } from "./MapEditor";
import { DialogueEditor } from "./DialogueGraph";
import { Icon } from "../ui/icons";
import { locateError } from "./errors";
import { refTarget } from "./refs";

/** Команды списка, открытого сейчас (для контекстного меню элементов). */
export const listActions: {
  current: { count: number; copy: (i: number) => void; move: (i: number, d: -1 | 1) => void; remove: (i: number) => void } | null;
} = { current: null };
import { ContextMenu, copyText, type MenuContext, type MenuItem } from "../ui/contextmenu";
import { ask, tell } from "../ui/dialog";
import { GeneralSection } from "./sections/General";
import { AuthorshipSection } from "./sections/Authorship";
import { FlagsSection } from "./sections/Flags";
import { LawSection } from "./sections/Law";
import { SolutionSection } from "./sections/Solution";
import { ListSection } from "./sections/List";
import { JsonSection } from "./sections/Json";

/** Заголовок элемента списка без id (id — отдельной строкой). */
export function itemHeading(item: unknown, i: number): string {
  const o = (item ?? {}) as Record<string, unknown>;
  const main = o.title ?? o.name ?? o.text ?? o.label ?? o.prompt ?? o.question;
  if (typeof main === "string" && main) return main.length > 60 ? main.slice(0, 60) + "…" : main;
  if (typeof o.time === "string") return String(o.time);
  if (typeof o.level === "number") return `Подсказка ${o.level}`;
  return typeof o.id === "string" ? o.id : `#${i + 1}`;
}

export const SCHEMA: JS = z.toJSONSchema(CaseFile);

/** Тестовый запуск в этой же вкладке; черновик в конструкторе никуда не денется. */
function startPlaytest() {
  const { errors, draft } = editorStore.get();
  if (errors.length) return editor.goto("errors");
  editor.playtest();
  window.location.href = `/?play=${encodeURIComponent(draft.id)}&from=editor`;
}

/** Правая кнопка в конструкторе: копирование и основные команды. */
function editorMenu({ target, selection }: MenuContext): MenuItem[] {
  const st = editorStore.get();
  const items: MenuItem[] = [];
  if (selection) items.push({ label: "Копировать", icon: "copy", run: () => copyText(selection) }, "sep");
  const chip = target.closest<HTMLElement>("[data-ref-id]");
  if (chip) {
    const goal = refTarget(st.draft, chip.dataset.refId!);
    items.push(
      { label: `Перейти к «${chip.dataset.refLabel}»`, icon: "back", disabled: !goal, run: () => goal && editor.goto(goal.section, goal) },
      { label: "Убрать", icon: "close", danger: true, run: () => chip.querySelector<HTMLButtonElement>(".ef__chip-x")?.click() },
      "sep",
    );
  }
  const listItem = target.closest<HTMLElement>("[data-list-index]");
  if (listItem && listActions.current) {
    const i = Number(listItem.dataset.listIndex);
    const la = listActions.current;
    items.push(
      { label: "Копия", icon: "copy", run: () => la.copy(i) },
      { label: "Выше", icon: "back", disabled: i === 0, run: () => la.move(i, -1) },
      { label: "Ниже", icon: "back", disabled: i >= la.count - 1, run: () => la.move(i, 1) },
      { label: "Удалить", icon: "close", danger: true, run: () => la.remove(i) },
      "sep",
    );
  }
  const id = target.closest("code")?.textContent?.trim();
  if (id && !selection) items.push({ label: `Копировать id «${id}»`, icon: "copy", run: () => copyText(id) }, "sep");
  items.push(
    { label: "Отменить", icon: "undo", hint: "Ctrl+Z", disabled: !st.past.length, run: editor.undo },
    { label: "Повторить", icon: "redo", hint: "Ctrl+Shift+Z", disabled: !st.future.length, run: editor.redo },
    "sep",
    { label: st.dirty ? "Сохранить" : "Сохранено", icon: "save", hint: "Ctrl+S", disabled: !st.dirty || st.errors.length > 0, run: () => editor.save() },
    { label: "Запустить", icon: "play", run: startPlaytest },
  );
  if (st.errors.length) items.push({ label: `Ошибки (${st.errors.length})`, icon: "alert", danger: true, run: () => editor.goto("errors") });
  return items;
}

const SECTIONS: { id: SectionId; label: string; hint: string }[] = [
  { id: "general", label: "Основное", hint: "Название, вводная, бонус за время, показывать ли в списке" },
  { id: "characters", label: "Персонажи", hint: "Кто участвует и как выглядит" },
  { id: "locations", label: "Локации", hint: "Карта, предметы, люди, выходы" },
  { id: "evidence", label: "Улики", hint: "Что можно найти" },
  { id: "events", label: "События", hint: "Хронология" },
  { id: "dialogues", label: "Диалоги", hint: "Граф реплик" },
  { id: "confrontations", label: "Очные ставки", hint: "Разговор нескольких персонажей" },
  { id: "deductions", label: "Сопоставления", hint: "Какие улики что доказывают" },
  { id: "hints", label: "Подсказки", hint: "Три уровня" },
  { id: "questions", label: "Вопросы и баллы", hint: "Финальная квалификация" },
  { id: "solution", label: "Решение", hint: "Разбор и источники" },
  { id: "flags", label: "Флаги", hint: "Пометки «это уже произошло»: названия и где используются" },
  { id: "law", label: "Закон", hint: "Что игрок видит во вкладке «Закон»" },
  { id: "authorship", label: "Авторство", hint: "Автор, почта, лицензия" },
  { id: "json", label: "JSON", hint: "Исходник целиком" },
];

/** Раздел-коллекция: список слева, карточка справа. */
const LIST_SECTIONS: Partial<Record<SectionId, keyof CaseFile>> = {
  characters: "characters",
  evidence: "evidence",
  events: "events",
  confrontations: "confrontations",
  deductions: "deductions",
  hints: "hints",
  questions: "questions",
};

export function EditorApp() {
  const screen = useEditor((s) => s.screen);
  const section = useEditor((s) => s.section);
  const draft = useEditor((s) => s.draft);
  const errors = useEditor((s) => s.errors);
  useEditorUrl(SECTIONS.map((s) => s.id).concat("errors"));

  // на странице конкретного дела шапка сайта не нужна — остаётся только шапка дела
  useEffect(() => {
    const site = document.querySelector(".site");
    site?.classList.toggle("site--editing", screen === "case");
    return () => site?.classList.remove("site--editing");
  }, [screen]);

  useWindowKey((e) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    if (e.code === "KeyS") {
      e.preventDefault();
      editor.save();
      return;
    }
    if (e.code !== "KeyZ") return;
    if (e.target instanceof HTMLElement && e.target.closest("input, textarea")) return; // там своя отмена
    e.preventDefault();
    if (e.shiftKey) editor.redo();
    else editor.undo();
  });

  // Блоки раздела: разделы → список → содержимое. Разделы — одна остановка в Tab (текущий раздел), по ним ходят ↑ / ↓;
  // → уводит вправо (из разделов — в список, из списка — к первому полю содержимого), ← из списка возвращает к разделам, Esc из содержимого — к списку.
  const nav = useRef<HTMLElement>(null);
  useArrowNav(nav, ".ed__nav-item", { within: true });
  useWindowKey((e) => {
    if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey || e.defaultPrevented) return;
    const active = document.activeElement;
    const focus = (el: HTMLElement | null | undefined) => {
      if (!el) return;
      e.preventDefault();
      el.focus();
    };
    const first = (root: Element | null | undefined) =>
      [...(root?.querySelectorAll<HTMLElement>('input:not(:disabled), textarea:not(:disabled), button:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])') ?? [])].find((x) => x.offsetParent !== null);
    if (e.key === "ArrowRight" && active?.closest(".ed__nav")) {
      focus(document.querySelector<HTMLElement>(".ed__main .ed__item[aria-current]") ?? first(document.querySelector(".ed__main")));
    } else if (e.key === "ArrowRight" && active?.classList.contains("ed__item")) {
      focus(first(document.querySelector(".ed__split > .ed__panel")));
    } else if (e.key === "ArrowLeft" && active?.classList.contains("ed__item")) {
      focus(document.querySelector<HTMLElement>(".ed__nav-item[aria-current]") ?? document.querySelector<HTMLElement>(".ed__nav-item"));
    } else if (e.key === "Escape" && active?.closest(".ed__split > .ed__panel")) {
      focus(document.querySelector<HTMLElement>(".ed__list .ed__item[aria-current]"));
    }
  });

  if (screen === "home") {
    return (
      <>
        <EditorHome />
        <ContextMenu build={editorMenu} />
      </>
    );
  }

  return (
    <div className="ed">
      <Toolbar />
      <StorageWarning />
      <ContextMenu build={editorMenu} />
      <nav className="ed__nav" ref={nav}>
        {SECTIONS.map((s) => (
          <button key={s.id} className="ed__nav-item" tabIndex={section === s.id || (section === "errors" && !errors.length && s.id === "general") ? 0 : -1} aria-current={section === s.id || undefined} onClick={() => editor.goto(s.id)} title={s.hint}>
            {s.label}
            <span className="ed__nav-count">{countFor(draft, s.id)}</span>
          </button>
        ))}
        {errors.length > 0 && (
          <button className="ed__nav-item ed__nav-item--errors" tabIndex={section === "errors" ? 0 : -1} aria-current={section === "errors" || undefined} onClick={() => editor.goto("errors")}>
            <span>
              <Icon name="alert" size={15} /> Ошибки
            </span>
            <span className="ed__nav-count">{errors.length}</span>
          </button>
        )}
      </nav>
      <main className="ed__main">
        {section === "general" && <GeneralSection />}
        {LIST_SECTIONS[section] && <ListSection key={section} field={LIST_SECTIONS[section]!} />}
        {section === "locations" && <MapEditor />}
        {section === "dialogues" && <DialogueEditor />}
        {section === "solution" && <SolutionSection />}
        {section === "law" && <LawSection />}
        {section === "authorship" && <AuthorshipSection />}
        {section === "flags" && <FlagsSection />}
        {section === "json" && <JsonSection />}
        {section === "errors" && <ErrorsSection />}
      </main>
    </div>
  );
}

function ErrorsSection() {
  const draft = useEditor((s) => s.draft);
  const errors = useEditor((s) => s.errors);
  const located = errors.map((e) => locateError(e, draft));
  if (!errors.length) {
    return (
      <section className="ed__panel">
        <h2>Ошибок нет</h2>
        <p className="muted">Дело можно сохранить и проверить в игре.</p>
      </section>
    );
  }
  return (
    <section className="ed__panel ed__panel--narrow">
      <h2>Ошибки ({errors.length})</h2>
      <p className="muted">Пока есть ошибки, дело нельзя сохранить и запустить в игре. Нажмите на карточку — откроется место ошибки.</p>
      <ul className="err-list">
        {located.map((e, i) => (
          <li key={i}>
            <Alert
              icon
              className="err-card"
              title={
                <>
                  {e.where}
                  {e.focus.id && <code>{e.focus.id}</code>}
                </>
              }
              onClick={() => editor.goto(e.focus.section, e.focus)}
            >
              {e.message}
            </Alert>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Короткие инструкции к разделам конструктора. */
const HELP: Record<SectionId, { title: string; points: string[] }> = {
  general: {
    title: "Основное",
    points: [
      "Номер, название и подзаголовок видны в списке дел; вводная — первое, что прочтёт игрок.",
      "«Показывать в списке дел» — пока выключено, дело доступно только через «Запустить».",
      "Бонус за время: уложиться в N минут и набрать не меньше порога успеха (если порог пустой — при любом результате выше нуля) — к баллам за вопросы добавится бонус.",
    ],
  },
  characters: {
    title: "Персонажи",
    points: [
      "Все, с кем можно поговорить или кто упоминается в материалах.",
      "Внешность: выберите образец и при желании поменяйте лицо, волосы, одежду. Двух одинаковых людей быть не должно.",
      "Чтобы персонаж появился на карте, поставьте его в разделе «Локации» (инструмент «Люди»).",
    ],
  },
  locations: {
    title: "Локации",
    points: [
      "Вкладки сверху — помещения. Слева инструменты: стены и пол, предметы, люди, выходы.",
      "Предмет с материалом при осмотре сразу кладёт улику в дело; без материала — просто декорация.",
      "Выход ведёт в другую локацию; переход происходит, когда игрок подходит и нажимает «Взаимодействие».",
      "Выбор (V): клик — выделить, перетаскивание — переместить, Delete — удалить, Esc — снять выделение.",
      "Кисть (B) и прямоугольник (R) рисуют пол и стены; с Shift кисть тоже рисует прямоугольником. Ctrl + колесо — масштаб.",
      "Дверь ставится в проём на 2 клетки; с условием она заперта, пока условие не выполнено.",
    ],
  },
  evidence: {
    title: "Улики",
    points: [
      "Улика — документ, вещь, цифровой след; показания — слова персонажа. Вид улики (документ, вещь…) пишите в его подписи.",
      "Достоверность подсказывает игроку, насколько материалу можно верить.",
      "На вкладке «Связи» видно, где игрок получает улику. Если нигде — её нужно выдать предметом или репликой.",
    ],
  },
  events: { title: "События", points: ["Хронология дела. События привязываются к уликам и показываются в карточке как время."] },
  dialogues: {
    title: "Диалоги",
    points: [
      "Карточка — реплика персонажа, строки под ней — варианты ответа игрока.",
      "Тяните от кружка у варианта к другой карточке — это «что ответит персонаж». Отпустили на пустом месте — конец разговора.",
      "«Условие» — вариант виден, только когда выполнены условия (улики, выводы, флаги). Разные реакции на повторный вопрос стройте флагами.",
      "Эффекты реплики: выдать улику, поставить флаг, увести персонажа за игроком и т. д.",
    ],
  },
  confrontations: {
    title: "Очные ставки",
    points: [
      "Разговор нескольких персонажей: игрок приводит всех участников, кроме одного, к нему (они идут следом) и заговаривает.",
      "Во вкладке «Разговор» у каждой реплики выберите, кто её говорит.",
      "Чтобы персонаж пошёл за игроком, в обычном диалоге нужен эффект «персонаж идёт следом».",
    ],
  },
  deductions: {
    title: "Сопоставления",
    points: [
      "2–3 улики, которые вместе что-то доказывают. Игрок выбирает их в материалах и отвечает на вопрос.",
      "Верный ответ даёт вывод — он появляется в материалах как отдельная карточка.",
    ],
  },
  hints: { title: "Подсказки", points: ["Три уровня: от лёгкого намёка до почти ответа. Каждая взятая подсказка снижает итог."] },
  questions: { title: "Вопросы и баллы", points: ["Финальные вопросы игроку. Сумма баллов — любая: у сложного дела можно сделать больше, у простого меньше. Результаты сравниваются в процентах."] },
  flags: {
    title: "Флаги",
    points: [
      "Флаг — пометка «это уже произошло»: ключ отдан, свидетель солгал, вывод установлен.",
      "Его ставят эффекты реплик и сопоставлений, а проверяют условия вариантов, дверей и очных ставок.",
      "У каждого флага — русское название; ключ латиницей собирается из названия автоматически.",
    ],
  },
  law: {
    title: "Закон",
    points: [
      "Вкладка «Закон» в окне «Материалы» — правовая подсказка игроку. Всё заполняется здесь, готовых наборов нет.",
      "«Правовая база» — нормы: статьи нормативных актов, другие документы, со ссылками.",
      "«Пояснения» — комментарии автора. Они нумеруются: в подсказке можно написать «см. пояснение №2».",
    ],
  },
  authorship: {
    title: "Авторство",
    points: [
      "Автор, лицензия и почта показываются игрокам в списке дел и в окне «Дело». Почта нужна для обратной связи: оставьте её пустой, если письма не нужны.",
      "Лицензия — на содержание дела; по умолчанию CC BY 4.0.",
    ],
  },
  solution: { title: "Решение", points: ["Правильный ответ и разбор, который игрок увидит после вердикта. Разбит на вкладки."] },
  json: { title: "JSON", points: ["Всё дело текстом. Правьте осторожно: «Применить» проверит формат."] },
  errors: { title: "Ошибки", points: ["Пока есть ошибки, дело нельзя сохранить и запустить. Клик по карточке ведёт к месту ошибки."] },
};

function HelpPopover({ section, onClose }: { section: SectionId; onClose: () => void }) {
  const help = HELP[section];
  return (
    <div className="ed__help" onMouseLeave={onClose}>
      <b>{help.title}</b>
      <ul>
        {help.points.map((p) => (
          <li key={p}>{p}</li>
        ))}
      </ul>
      <p className="muted">
        Изменения сохраняются кнопкой «Сохранить» (Ctrl+S). «Запустить» запускает дело без сохранения. Правая кнопка мыши —
        быстрые команды.
      </p>
    </div>
  );
}

function countFor(d: CaseFile, id: SectionId): string {
  const n: Partial<Record<SectionId, number>> = {
    characters: d.characters.length,
    locations: d.locations.length,
    evidence: d.evidence.length,
    events: d.events.length,
    dialogues: d.dialogues.length - d.confrontations.length,
    confrontations: d.confrontations.length,
    flags: (d.flags ?? []).length,
    deductions: d.deductions.length,
    hints: d.hints.length,
    questions: d.questions.length,
  };
  return n[id] !== undefined ? String(n[id]) : "";
}

function downloadJson(c: CaseFile) {
  const blob = new Blob([JSON.stringify(c, null, 2) + "\n"], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${c.id}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

async function importJsonFile(file: File) {
  try {
    const parsed = parseCase(JSON.parse(await file.text()));
    if (!parsed.success) {
      await tell({ title: "Файл не похож на дело", text: parsed.errors.slice(0, 8).join("\n") });
      return;
    }
    editor.open(parsed.data);
  } catch (e) {
    await tell({ title: "Не удалось прочитать файл", text: String(e) });
  }
}

/** Перед заменой текущего черновика другим делом. */
function confirmReplace(action: () => void) {
  const { dirty } = editorStore.get();
  if (!dirty) return action();
  void ask({ title: "Несохранённые изменения пропадут", text: "В текущем деле есть несохранённые изменения. Открыть другое дело?", confirmLabel: "Продолжить", danger: true }).then(
    (ok) => ok && action(),
  );
}

/** Браузер не принял черновик: без этой плашки правки молча пропали бы при перезагрузке. */
function StorageWarning() {
  const failed = useEditor((s) => s.storageFailed);
  if (!failed) return null;
  return (
    <Alert
      icon
      className="ed__warn"
      action={
        <button className="btn btn--sm" onClick={() => editor.goto("json")}>
          К экспорту
        </button>
      }
    >
      Браузер не смог сохранить черновик (хранилище переполнено или недоступно) — правки пропадут при перезагрузке. Скачайте файл дела.
    </Alert>
  );
}

function Toolbar() {
  const draft = useEditor((s) => s.draft);
  const errors = useEditor((s) => s.errors);
  const dirty = useEditor((s) => s.dirty);
  const canUndo = useEditor((s) => s.past.length > 0);
  const canRedo = useEditor((s) => s.future.length > 0);
  const [openHelp, setOpenHelp] = useState(false);
  const section = useEditor((s) => s.section);
  const dock = useMapDock();

  return (
    <header className="ed__bar">
      <button className="ed__home" onClick={editor.openHome} title="Все дела конструктора">
        <Icon name="folders" size={20} />
      </button>
      <div className="ed__title">
        <b>
          №{draft.number} «{draft.title}»
        </b>
      </div>
      <button
        className="ed__publish" aria-pressed={draft.published}
        onClick={() => editor.update((d) => ({ ...d, published: !d.published }))}
        title={draft.published ? "Игроки видят дело в списке. Нажмите, чтобы скрыть" : "Дело скрыто от игроков. Нажмите, чтобы показать в списке"}
      >
        <Icon name={draft.published ? "eye" : "dim"} size={16} /> {draft.published ? "Видно игрокам" : "Скрыто"}
      </button>
      <div className="ed__actions">
        {section === "locations" && (
          <span className="seg" role="group" aria-label="Расположение палитры">
            <button className="seg__btn" aria-pressed={dock === "left"} onClick={() => setMapDock("left")} title="Палитра слева от карты" aria-label="Палитра слева">
              <Icon name="dock-left" size={24} />
            </button>
            <button className="seg__btn" aria-pressed={dock === "bottom"} onClick={() => setMapDock("bottom")} title="Палитра под картой" aria-label="Палитра снизу">
              <Icon name="dock-bottom" size={24} />
            </button>
          </span>
        )}
        <button className="icon-btn ed__icon-btn" disabled={!canUndo} onClick={editor.undo} title="Отменить (Ctrl+Z)">
          <Icon name="undo" />
        </button>
        <button className="icon-btn ed__icon-btn" disabled={!canRedo} onClick={editor.redo} title="Повторить (Ctrl+Shift+Z)">
          <Icon name="redo" />
        </button>
        {errors.length > 0 && (
          <button className="ed__status is-bad" onClick={() => editor.goto("errors")} title="Открыть список ошибок">
            <Icon name="alert" size={15} /> {errors.length}
          </button>
        )}
        <button className="btn ed__play" onClick={startPlaytest} title={errors.length ? "Сначала исправьте ошибки" : "Открыть дело в игре"}>
          <Icon name="play" size={15} /> Запустить
        </button>
        <button
          className="btn btn--primary ed__save"
          disabled={!dirty || errors.length > 0}
          onClick={() => editor.save()}
          title={errors.length ? "Нельзя сохранить: есть ошибки" : dirty ? "Сохранить (Ctrl+S) — дело появится в игре" : "Изменений нет"}
        >
          <Icon name="save" size={15} /> {dirty ? "Сохранить" : "Сохранено"}
        </button>
        <div className="ed__menu">
          <button className="btn ed__help-btn" aria-expanded={openHelp} onClick={() => setOpenHelp((v) => !v)} title="Как заполнять этот раздел">
            <Icon name="help" size={15} /> Справка
          </button>
          {openHelp && <HelpPopover section={section} onClose={() => setOpenHelp(false)} />}
        </div>
      </div>
    </header>
  );
}

/** Стартовая страница конструктора: все дела — создать, импортировать, открыть, экспортировать. */
function EditorHome() {
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
      <h2>Встроенные дела</h2>
      <ul className="eh__list list-reset">{bundled.map((c) => row(c, "bundled"))}</ul>
    </main>
  );
}
