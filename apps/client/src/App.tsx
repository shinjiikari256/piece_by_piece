import { Suspense, lazy, useEffect, useRef, type ReactNode } from "react";
import { useFocusTrap, useWindowKey } from "./ui/lib/hooks";
import { actions, store, useGame } from "./state/store";
import { editorPathOfPlaytest, readPlaytest } from "./content/drafts";
import { validateCase } from "./content/validate";
import { LocalAuthority } from "./content/local-authority";
import { Icon } from "./ui/kit/icons";
import { FROM_EDITOR, OFFLINE, OFFLINE_EDITOR } from "./env";

// запоминаем до того, как адрес очистится
const PARAMS = new URLSearchParams(location.search);
const PLAY_ID = OFFLINE && !OFFLINE_EDITOR ? null : PARAMS.get("play");
if (FROM_EDITOR) document.body.classList.add("is-playtest");
import { GameView, runTool } from "./ui/components/GameView";
import { ContextMenu, copyText, type MenuContext, type MenuItem } from "./ui/kit/contextmenu";
import { Intro } from "./ui/pages/screens";
import { Site } from "./ui/pages/site";
import { Link, useRoute } from "./ui/lib/router";
import { useGameRoute } from "./ui/lib/game-route";
import { FinalScreen, ResultScreen } from "./ui/components/verdict";
import { DialogHost, tell } from "./ui/kit/dialog";

/** Смена временного пароля — онлайн-часть; в офлайн-файле её нет вовсе. */
const ForcePasswordChange = OFFLINE ? null : lazy(() => import("./ui/pages/online").then((m) => ({ default: m.ForcePasswordChange })));

/** Команды правой кнопки: для выделенного текста, карточки материала и общие для расследования. */
function gameMenu({ target, selection }: MenuContext): MenuItem[] {
  const st = store.get();
  const playing = st.screen === "play" && !!st.caseFile;
  const items: MenuItem[] = [];
  if (selection) {
    if (playing) items.push({ label: "Добавить в заметки", icon: "pen", run: () => actions.appendNote(selection) });
    items.push({ label: "Копировать", icon: "notes", run: () => copyText(selection) });
    items.push("sep");
  }
  const card = target.closest<HTMLElement>("[data-mark-key]");
  if (card && playing) {
    const key = card.dataset.markKey!;
    const mark = st.marks[key];
    items.push(
      { label: mark === "important" ? "Снять «Важно»" : "Отметить: важно", icon: "star", run: () => actions.mark(key, "important") },
      { label: mark === "unimportant" ? "Снять «Неважно»" : "Отметить: неважно", icon: "dim", run: () => actions.mark(key, "unimportant") },
      { label: "Название в заметки", icon: "pen", run: () => actions.appendNote(`«${card.dataset.title}»`) },
      "sep",
    );
  }
  if (playing) {
    const busy = !!st.overlay && st.overlay.kind !== "journal" && st.overlay.kind !== "hints";
    items.push(
      { label: "Материалы дела", icon: "folder", hint: "J", disabled: busy, run: () => runTool("journal") },
      { label: st.notesOpen ? "Скрыть заметки" : "Заметки", icon: "notes", hint: "N", run: () => runTool("notes") },
      { label: "Подсказка", icon: "bulb", hint: "H", disabled: busy, run: () => runTool("hints") },
      { label: "Вынести решение", icon: "scale", hint: "V", disabled: busy, run: () => runTool("final") },
      "sep",
      { label: "Выйти в меню", icon: "home", hint: "Esc", run: () => actions.open({ kind: "exit" }) },
    );
  } else if (st.screen === "final") {
    items.push({ label: "Выйти в меню", icon: "home", run: () => actions.open({ kind: "exit" }) });
  } else if (st.screen !== "menu") {
    items.push({ label: "Главное меню", icon: "home", run: actions.goMenu });
  }
  return items;
}

/** Вступление и результат — папкой поверх страницы сайта; клик по затемнению или Esc закрывает. */
function SiteOverlay({ children }: { children: ReactNode }) {
  // фокус уходит в окно: иначе Enter нажимал кнопку на странице под ним (карточку дела)
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref);
  return (
    <div
      ref={ref}
      tabIndex={-1}
      role="presentation"
      className="site-overlay"
      onMouseDown={(e) => {
        if ((e.target as HTMLElement).classList.contains("menu")) actions.leaveToSite();
      }}
    >
      {children}
    </div>
  );
}

function Toasts() {
  const toasts = useGame((s) => s.toasts);
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className="toast" role={t.alert ? "alert" : undefined}>
          {t.text}
        </div>
      ))}
    </div>
  );
}

export function App() {
  const screen = useGame((s) => s.screen);
  const route = useRoute();

  // конструктор запускает дело: ?play=<id>&from=editor — тестовая копия, расследование начинается сразу
  useEffect(() => {
    if (!PLAY_ID) return;
    history.replaceState(null, "", location.pathname + location.hash);
    const result = validateCase(readPlaytest());
    if (result.ok) {
      // «Запустить» — сразу расследование заново, без вступления и вопроса о прошлом сохранении
      actions.openCase(new LocalAuthority(result.caseFile));
      actions.beginInvestigation();
    } else void tell({ title: "Не удалось открыть дело", text: "Тестовая копия не найдена или содержит ошибки — откройте конструктор." });
  }, []);

  // расследование в адресе; смена адреса на вступлении и результате возвращает на сайт
  useGameRoute();

  useWindowKey((e) => {
    if (e.key !== "Escape") return;
    const { overlay, screen, notesOpen } = store.get();
    if (screen === "intro" || screen === "result") {
      actions.leaveToSite();
    } else if (screen === "final") actions.backToInvestigation();
    else if (notesOpen) actions.toggleNotes(false);
    else if (overlay) actions.close();
    else if (screen === "play") actions.open({ kind: "exit" });
  });

  return (
    <>
      {FROM_EDITOR && route.page !== "editor" && (
        <Link className="playtest-banner" to={editorPathOfPlaytest()}>
          <Icon name="back" size={15} /> Тестовый запуск · вернуться в конструктор
        </Link>
      )}
      {(screen === "menu" || screen === "intro" || screen === "result") && <Site />}
      {screen === "intro" && (
        <SiteOverlay>
          <Intro />
        </SiteOverlay>
      )}
      {(screen === "play" || screen === "final") && <GameView />}
      {screen === "final" && <FinalScreen />}
      {screen === "result" && (
        <SiteOverlay>
          <ResultScreen />
        </SiteOverlay>
      )}
      <Toasts />
      {/* у конструктора своё меню правой кнопки */}
      {!(screen === "menu" && route.page === "editor") && <ContextMenu build={gameMenu} />}
      <DialogHost />
      {ForcePasswordChange && (
        <Suspense fallback={null}>
          <ForcePasswordChange />
        </Suspense>
      )}
    </>
  );
}
