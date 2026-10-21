import { Suspense, lazy, useEffect, useRef } from "react";
import { useArrowNav, useWindowKey } from "../ui/hooks";
import { useEditorUrl } from "./url";
import { CaseFile } from "../../../../shared/case";
import { editor, editorStore, useEditor, type SectionId } from "./state";
import { MapEditor } from "./MapEditor";
import { DialogueEditor } from "./DialogueGraph";
import { Icon } from "../ui/icons";
import { refTarget } from "./refs";

import { ContextMenu, copyText, type MenuContext, type MenuItem } from "../ui/contextmenu";
import { GeneralSection } from "./sections/General";
import { SettingsSection } from "./sections/Settings";
import { AuthorshipSection } from "./sections/Authorship";
import { FlagsSection } from "./sections/Flags";
import { SpritesSection } from "./sprites/SpritesSection";
import { LawSection } from "./sections/Law";
import { SolutionSection } from "./sections/Solution";
import { ListSection } from "./sections/List";
import { JsonSection } from "./sections/Json";
import { ErrorsSection } from "./sections/Errors";
import { Toolbar, StorageWarning } from "./EditorToolbar";
import { EditorHome } from "./EditorHome";
import { OFFLINE } from "../env";
import { startPlaytest } from "./actions";
import { listActions } from "./shared";




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
    ...(OFFLINE ? [] : [{ label: "Запустить", icon: "play" as const, run: startPlaytest }]),
  );
  if (st.errors.length) items.push({ label: `Ошибки (${st.errors.length})`, icon: "alert", danger: true, run: () => editor.goto("errors") });
  return items;
}

/** Видимость по группам — онлайн-часть; в офлайн-файле её нет вовсе. */
const VisibilitySection = OFFLINE ? null : lazy(() => import("./sections/Visibility").then((m) => ({ default: m.VisibilitySection })));

const SECTIONS: { id: SectionId; label: string; hint: string }[] = [
  { id: "general", label: "Основное", hint: "Название, вводная, сложность" },
  ...(OFFLINE ? [] : [{ id: "visibility" as const, label: "Видимость", hint: "Кому дело видно в списке: всем или выбранным группам" }]),
  { id: "characters", label: "Персонажи", hint: "Кто участвует и как выглядит" },
  { id: "locations", label: "Локации", hint: "Карта, предметы, люди, области" },
  { id: "evidence", label: "Улики", hint: "Что можно найти" },
  { id: "events", label: "События", hint: "Хронология" },
  { id: "dialogues", label: "Диалоги", hint: "Граф реплик" },
  { id: "deductions", label: "Сопоставления", hint: "Какие улики что доказывают" },
  { id: "hints", label: "Подсказки", hint: "Три уровня" },
  { id: "questions", label: "Вопросы и баллы", hint: "Финальная квалификация" },
  { id: "solution", label: "Решение", hint: "Разбор и источники" },
  { id: "flags", label: "Переменные", hint: "Флаги («произошло или нет») счётчики (числа) и перечисления (одно значение из списка)" },
  { id: "sprites", label: "Спрайты", hint: "Свои предметы: рисунок, опора, состояния и привязка к переменным" },
  { id: "law", label: "Закон", hint: "Что игрок видит во вкладке «Закон»" },
  { id: "settings", label: "Настройки", hint: "Базовый год событий и бонус за время" },
  { id: "authorship", label: "Авторство", hint: "Автор, почта, лицензия" },
  { id: "json", label: "JSON", hint: "Исходник целиком" },
];

/** Раздел-коллекция: список слева, карточка справа. */
const LIST_SECTIONS: Partial<Record<SectionId, keyof CaseFile>> = {
  characters: "characters",
  evidence: "evidence",
  events: "events",
  deductions: "deductions",
  hints: "hints",
  questions: "questions",
};

export function EditorApp() {
  const screen = useEditor((s) => s.screen);
  const section = useEditor((s) => s.section);
  const draft = useEditor((s) => s.draft);
  const errors = useEditor((s) => s.errors);
  const warnings = useEditor((s) => s.warnings);
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
          <button key={s.id} className="ed__nav-item" tabIndex={section === s.id || (section === "errors" && !errors.length && !warnings.length && s.id === "general") ? 0 : -1} aria-current={section === s.id || undefined} onClick={() => editor.goto(s.id)} title={s.hint}>
            {s.label}
            <span className="ed__nav-count">{countFor(draft, s.id)}</span>
          </button>
        ))}
        {(errors.length > 0 || warnings.length > 0) && (
          <button
            className={`ed__nav-item ${errors.length ? "ed__nav-item--errors" : "ed__nav-item--warnings"}`}
            tabIndex={section === "errors" ? 0 : -1}
            aria-current={section === "errors" || undefined}
            onClick={() => editor.goto("errors")}
          >
            <span>
              <Icon name="alert" size={15} /> {errors.length ? "Ошибки" : "Предупреждения"}
            </span>
            <span className="ed__nav-count">{errors.length || warnings.length}</span>
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
        {section === "settings" && <SettingsSection />}
        {VisibilitySection && section === "visibility" && (
          <Suspense fallback={null}>
            <VisibilitySection />
          </Suspense>
        )}
        {section === "authorship" && <AuthorshipSection />}
        {section === "flags" && <FlagsSection />}
        {section === "sprites" && <SpritesSection />}
        {section === "json" && <JsonSection />}
        {section === "errors" && <ErrorsSection />}
      </main>
    </div>
  );
}




function countFor(d: CaseFile, id: SectionId): string {
  const n: Partial<Record<SectionId, number>> = {
    characters: d.characters.length,
    locations: d.locations.length,
    evidence: d.evidence.length,
    events: d.events.length,
    dialogues: d.dialogues.length,
    flags: (d.flags ?? []).length,
    sprites: (d.sprites ?? []).length,
    deductions: d.deductions.length,
    hints: d.hints.length,
    questions: d.questions.length,
  };
  return n[id] !== undefined ? String(n[id]) : "";
}





