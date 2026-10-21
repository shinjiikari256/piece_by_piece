import { editorPathOfPlaytest } from "../content/drafts";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { useWindowKey } from "./hooks";
import { percentOf } from "../util/format";
import { FROM_EDITOR } from "../env";
import { Link } from "./router";
import { Loader } from "./loader";
import { gameBridge } from "../game/bridge";
import { actions, store, useGame } from "../state/store";
import { TabbedModal } from "./common";
import { Journal } from "./journal";
import { HowToWindow } from "./screens";
import { DialogueWindow, HintsPanel, ObjectPanel } from "./panels";
import { Icon } from "./icons";
import { Logo } from "./logo";
import { DEFAULT_BONUS_SCORE } from "../../../../shared/scoring";
import { NotesWindow, SelectionToNotes } from "./notes";

// движок Phaser — самый тяжёлый кусок: грузим при входе в дело, а не вместе с сайтом
const PhaserGame = lazy(() => import("../game/PhaserGame").then((m) => ({ default: m.PhaserGame })));

/** Сколько осталось до конца бонуса за время; после — игра продолжается без бонуса. */
function Timer({ startedAt, minutes, points, minScore }: { startedAt: number; minutes: number; points: number; minScore: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);
  const left = Math.max(0, startedAt + minutes * 60_000 - now);
  if (left === 0) {
    return (
      <div className="timer is-over" title={`Бонус за время (+${points}) упущен — расследование можно продолжать без ограничений`}>
        <Icon name="clock" size={16} />
      </div>
    );
  }
  const m = Math.floor(left / 60000);
  const s = Math.floor((left % 60000) / 1000);
  return (
    <div className={`timer ${left < 60_000 ? "is-urgent" : ""}`} title={minScore > 0 ? `Уложитесь и наберите не меньше ${minScore} баллов — получите +${points}` : `Уложитесь вовремя — получите +${points}`}>
      <Icon name="clock" size={16} /> {m}:{String(s).padStart(2, "0")} <span className="timer__bonus">+{points}</span>
    </div>
  );
}

function TopBar() {
  const caseFile = useGame((s) => s.caseFile)!;
  const collected = useGame((s) => s.progress.collected.length);
  const solved = useGame((s) => s.progress.deductions.length);
  const startedAt = useGame((s) => s.startedAt);
  const screen = useGame((s) => s.screen);
  const notesOpen = useGame((s) => s.notesOpen);
  const totalEvidence = caseFile.evidence.length;
  const totalDeductions = caseFile.deductions.length;
  const progress = percentOf(collected + solved, totalEvidence + totalDeductions);

  return (
    <header className="topbar">
      <div className="topbar__case">
        {FROM_EDITOR ? (
          // тестовый запуск: стрелка ведёт обратно в конструктор
          <Link className="icon-btn topbar__home" to={editorPathOfPlaytest()} title="Вернуться в конструктор" aria-label="Вернуться в конструктор">
            <Icon name="back" size={20} />
          </Link>
        ) : (
          <button
            className="icon-btn topbar__home"
            onMouseDown={keepFocus}
            onClick={() => actions.open({ kind: "exit" })}
            title="В главное меню (Esc)"
            aria-label="В главное меню"
          >
            <Icon name="home" size={20} />
          </button>
        )}
        <span className="topbar__number">Дело №{caseFile.number}</span>
        <span className="topbar__title">{caseFile.title}</span>
      </div>
      <div className="topbar__stats">
        {startedAt && caseFile.timeBonus && screen === "play" && (
          <Timer startedAt={startedAt} minutes={caseFile.timeBonus.minutes} points={caseFile.timeBonus.points}
            minScore={caseFile.timeBonus.minScore ?? DEFAULT_BONUS_SCORE}
          />
        )}
        {/* сколько найдено и установлено — в «Материалах»; здесь только общий процент */}
        <span className="topbar__progress" title={`Прогресс расследования: ${progress}% — подробно в материалах дела`}>
          <span className="progress">
            <span className="progress__bar" style={{ width: `${progress}%` }} />
          </span>
          <b>{progress}%</b>
        </span>
        <button
          className="topbar__notes" aria-pressed={notesOpen}
          onMouseDown={keepFocus}
          onClick={() => actions.toggleNotes()}
          title="Заметки (N)"
        >
          <Icon name="notes" size={18} /> Заметки <kbd>N</kbd>
        </button>
        <button
          className="icon-btn topbar__help"
          onMouseDown={keepFocus}
          onClick={() => runTool("howto")}
          title="Как играть (I)"
          aria-label="Как играть"
        >
          <Icon name="help" size={20} />
        </button>
      </div>
    </header>
  );
}

/** Клик мышью не должен оставлять фокус на кнопке — иначе Enter/Пробел нажмут её снова. */
const keepFocus = (e: React.MouseEvent) => e.preventDefault();

type ToolId = "journal" | "hints" | "final";

/** Горячие клавиши панели; по физической клавише (KeyM…), чтобы работали и в русской раскладке. */
type ToolKey = ToolId | "notes" | "howto";
const TOOL_KEYS: Record<string, ToolKey> = { KeyM: "journal", KeyH: "hints", KeyV: "final", KeyN: "notes", KeyI: "howto" };
const KEY_LABEL: Record<ToolId, string> = { journal: "M", hints: "H", final: "V" };

export function runTool(tool: ToolKey) {
  const { overlay } = store.get();
  if (tool === "notes") return actions.toggleNotes();
  if (overlay?.kind === "howto" && tool === "howto") return actions.close();
  // повторное нажатие закрывает своё же окно
  if (overlay?.kind === "journal" && tool === "journal") return actions.close();
  if (overlay?.kind === "hints" && tool === "hints") return actions.close();
  if (overlay) return; // поверх диалога и других окон не переключаемся
  if (tool === "journal") actions.open({ kind: "journal", tab: "materials" });
  if (tool === "hints") actions.open({ kind: "hints" });
  if (tool === "howto") actions.open({ kind: "howto" });
  if (tool === "final") actions.goFinal();
}

function BottomBar() {
  const followers = useGame((s) => s.progress.followers.length);
  const [focus, setFocus] = useState<string | null>(null);

  useEffect(() => {
    gameBridge.focusListeners.add(setFocus);
    return () => void gameBridge.focusListeners.delete(setFocus);
  }, []);
  useWindowKey((e) => {
    const tool = TOOL_KEYS[e.code];
    if (!tool || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.target instanceof Element && e.target.closest("input, textarea, [contenteditable]")) return;
    if (store.get().screen !== "play") return;
    e.preventDefault();
    runTool(tool);
  });

  return (
    <nav className="bottombar" aria-label="Действия">
      <p className="sr-only" role="status">{focus ? `Рядом: ${focus}. Нажмите E, Enter или Пробел` : ""}</p>
      <button
        onMouseDown={keepFocus}
        className="tool"
        disabled={!focus && !followers}
        onClick={() => gameBridge.interactNearest?.()}
        title={!focus && followers ? "Отпустить спутников: они вернутся на свои места (E, Enter, Пробел)" : "Взаимодействие (E, Enter, Пробел)"}
      >
        <span className="tool__icon"><Icon name={!focus && followers ? "user" : "hand"} /></span>
        <span className="tool__label ellipsis">{focus ? focus : followers ? "Отпустить спутников" : "Взаимодействие"}</span>
        <kbd>E</kbd>
      </button>
      <button onMouseDown={keepFocus} className="tool" onClick={() => runTool("journal")}>
        <span className="tool__icon"><Logo size={20} /></span>
        <span className="tool__label ellipsis">Материалы</span>
        <kbd>{KEY_LABEL.journal}</kbd>
      </button>
      <button onMouseDown={keepFocus} className="tool" onClick={() => runTool("hints")}>
        <span className="tool__icon"><Icon name="bulb" /></span>
        <span className="tool__label ellipsis">Подсказка</span>
        <kbd>{KEY_LABEL.hints}</kbd>
      </button>
      <button onMouseDown={keepFocus} className="tool tool--decide" onClick={() => runTool("final")}>
        <span className="tool__icon"><Icon name="scale" /></span>
        <span className="tool__label ellipsis">Вынести решение</span>
        <kbd>{KEY_LABEL.final}</kbd>
      </button>
    </nav>
  );
}

/** Сенсорный экран: джойстик слева, кнопка действия справа. */
function TouchControls() {
  const [touch] = useState(() => window.matchMedia("(pointer: coarse)").matches);
  const [focus, setFocus] = useState(false);
  const base = useRef<HTMLDivElement>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const pointerId = useRef<number | null>(null);
  const overlay = useGame((s) => s.overlay);

  useEffect(() => {
    if (!touch) return;
    // кнопка действия активна, когда рядом есть с чем взаимодействовать
    const onFocus = (label: string | null) => setFocus(!!label);
    gameBridge.focusListeners.add(onFocus);
    return () => {
      gameBridge.focusListeners.delete(onFocus);
      gameBridge.joystick = { x: 0, y: 0 };
    };
  }, [touch]);

  if (!touch || overlay) return null;

  const RADIUS = 44;
  const move = (e: React.PointerEvent) => {
    const r = base.current!.getBoundingClientRect();
    let dx = e.clientX - (r.left + r.width / 2);
    let dy = e.clientY - (r.top + r.height / 2);
    const len = Math.hypot(dx, dy);
    if (len > RADIUS) {
      dx = (dx / len) * RADIUS;
      dy = (dy / len) * RADIUS;
    }
    setKnob({ x: dx, y: dy });
    const dead = len < 8;
    gameBridge.joystick = dead ? { x: 0, y: 0 } : { x: dx / RADIUS, y: dy / RADIUS };
  };
  const release = () => {
    pointerId.current = null;
    setKnob({ x: 0, y: 0 });
    gameBridge.joystick = { x: 0, y: 0 };
  };

  return (
    <div className="touch">
      <div
        ref={base}
        className="touch__stick"
        onPointerDown={(e) => {
          pointerId.current = e.pointerId;
          e.currentTarget.setPointerCapture(e.pointerId);
          move(e);
        }}
        onPointerMove={(e) => e.pointerId === pointerId.current && move(e)}
        onPointerUp={release}
        onPointerCancel={release}
      >
        <span className="touch__knob" style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }} />
      </div>
      <button className={`touch__action ${focus ? "is-ready" : ""}`} onClick={() => gameBridge.interactNearest?.()} aria-label="Взаимодействие">
        <Icon name="hand" size={34} />
      </button>
    </div>
  );
}

/** Эффект «провалить дело»: текст автора и два выхода — заново или к списку дел. */
function FailedWindow({ text }: { text?: string }) {
  return (
    <TabbedModal tabs={[{ id: "failed", label: "Дело провалено", icon: "alert" }]} size="narrow" onClose={() => actions.exitToMenu(false)}>
      <h2 className="modal__title">Дело провалено</h2>
      {text ? <p>{text}</p> : <p>Расследование не удалось довести до конца.</p>}
      <div className="modal__actions">
        <button className="btn btn--primary" onClick={actions.restartAfterFail}>
          Начать заново
        </button>
        <button className="btn" onClick={() => actions.exitToMenu(false)}>
          {FROM_EDITOR ? "Вернуться в конструктор" : "К списку дел"}
        </button>
      </div>
    </TabbedModal>
  );
}

function ExitDialog() {
  return (
    <TabbedModal tabs={[{ id: "exit", label: "Выход", icon: "home" }]} size="narrow">
      <h2 className="modal__title">{FROM_EDITOR ? "Вернуться в конструктор?" : "Выйти в главное меню?"}</h2>
      <p>
        {FROM_EDITOR
          ? "Тестовое прохождение сохраняется автоматически; черновик дела в конструкторе не меняется."
          : "Расследование сохраняется автоматически — к нему можно вернуться через «Выбрать дело»."}
      </p>
      <div className="modal__actions">
        <button className="btn btn--primary" onClick={() => actions.exitToMenu(true)}>
          {FROM_EDITOR ? "Сохранить и вернуться" : "Сохранить и выйти"}
        </button>
        <button className="btn btn--danger" onClick={() => actions.exitToMenu(false)}>
          {FROM_EDITOR ? "Вернуться без сохранения" : "Выйти без сохранения"}
        </button>
        <button className="btn" onClick={actions.close}>
          Остаться
        </button>
      </div>
    </TabbedModal>
  );
}

export function GameView() {
  const caseFile = useGame((s) => s.caseFile)!;
  const overlay = useGame((s) => s.overlay);
  const runId = useGame((s) => s.runId);

  return (
    <div className="game">
      <TopBar />
      <div className="stage">
        <Suspense fallback={<Loader label="Загрузка игрового поля…" />}>
          <PhaserGame key={runId} caseFile={caseFile} />
        </Suspense>
        <TouchControls />
      </div>
      <BottomBar />
      {overlay?.kind === "object" && <ObjectPanel objectId={overlay.objectId} gained={overlay.gained ?? []} />}
      {overlay?.kind === "dialogue" && <DialogueWindow {...overlay} />}
      {overlay?.kind === "journal" && <Journal tab={overlay.tab} match={overlay.match} focus={overlay.focus} />}
      <SelectionToNotes />
      {overlay?.kind === "hints" && <HintsPanel />}
      {overlay?.kind === "howto" && <HowToWindow onClose={actions.close} />}
      <NotesWindow />
      {overlay?.kind === "exit" && <ExitDialog />}
      {overlay?.kind === "failed" && <FailedWindow text={overlay.text} />}
    </div>
  );
}
