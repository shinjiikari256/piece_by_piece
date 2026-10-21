import { useSyncExternalStore } from "react";
import type { Solution } from "../../../../shared/case";
import type { PublicCase } from "../../../../shared/public-case";
import type { CaseAuthority, RevealedHint } from "../../../../shared/judge";
import { APP_NAME } from "../env";
import { emptyProgress, type Progress } from "../../../../shared/conditions";
import type { ResultRecord } from "./result-record";
import type { Answers, Score } from "../../../../shared/scoring";
import { createAutosave, pauseOnPageHide } from "./autosave";

/** menu — страницы сайта (адрес решает какая, см. ui/router.ts); остальное — расследование. */
export type Screen = "menu" | "intro" | "play" | "final" | "result";
export type JournalTab = "brief" | "materials" | "timeline" | "characters" | "law";

/** Пометка игрока на материале: важное — наверх, неважное — вниз и бледнее. */
export type Mark = "important" | "unimportant";

export type Overlay =
  | { kind: "object"; objectId: string; /** Улики, выданные именно этим осмотром (закладки помечаются «новое»). */ gained?: string[] }
  | {
      kind: "dialogue";
      npcId: string;
      dialogueId: string;
      nodeId: string;
      /** Игрок переспросил уже заданный вопрос: персонаж недоволен и повторяет ответ. */
    }
  | {
      kind: "journal";
      tab: JournalTab;
      /** режим сопоставления в «Материалах» */
      match?: boolean;
      /** что открыть: ключ материала или id персонажа */
      focus?: string;
    }
  | { kind: "failed"; text?: string }
  | { kind: "hints" }
  | { kind: "howto" }
  | { kind: "exit" };

export interface Toast {
  id: number;
  text: string;
  /** сбой, а не уведомление: читалка экрана прерывает речь */
  alert?: boolean;
}

export interface GameState {
  screen: Screen;
  /** Дело без ответов; ответы знает только судья (`authority`). */
  caseFile: PublicCase | null;
  /** Начало расследования (мс) — от него считается бонус за время. */
  startedAt: number | null;
  progress: Progress;
  examined: string[];
  /** Пометки игрока: ключ — id улики или `fact:<id сопоставления>`. */
  marks: Record<string, Mark>;
  notesOpen: boolean;
  wrongDeductions: number;
  playerNotes: string;
  hintsUsed: number;
  /** Открытые подсказки — тексты приходят от судьи. */
  hints: RevealedHint[];
  /** Выводы установленных фактов (id сопоставления → текст) — тоже от судьи. */
  conclusions: Record<string, string>;
  overlay: Overlay | null;
  toasts: Toast[];
  answers: Answers;
  score: Score | null;
  /** Запись о сданном деле (для файла результата). */
  record: ResultRecord | null;
  /** Разбор дела после сдачи; null — не показывают. */
  debrief: Solution | null;
  /** Меняется при каждом (пере)запуске расследования — пересоздаёт сцену. */
  runId: number;
  /** Локация, в которой сейчас игрок. */
  locationId: string;
  /** Куда поставить игрока при входе в локацию (null — сохранённая позиция или старт). */
  spawn: { x: number; y: number } | null;
  /** Последняя позиция игрока: из сохранения при продолжении, затем её обновляет сцена. Не вызывает перерисовку. */
  savedPlayer: { x: number; y: number; locationId: string } | undefined;
}

export const initialState = (): GameState => ({  screen: "menu",
  caseFile: null,
  startedAt: null,
  progress: emptyProgress(),
  examined: [],
  marks: {},
  notesOpen: false,
  wrongDeductions: 0,
  playerNotes: "",
  hintsUsed: 0,
  hints: [],
  conclusions: {},
  overlay: null,
  toasts: [],
  answers: {},
  score: null,
  record: null,
  debrief: null,
  runId: 0,
  locationId: "",
  spawn: null,
  savedPlayer: undefined,
});

/** Текущее состояние игры (живая привязка: читать можно откуда угодно, менять — только через `set`). */
export let state = initialState();
/** Судья текущего дела: проверяет сопоставления, выдаёт подсказки, считает итог. */
let authority: CaseAuthority | null = null;
export const getAuthority = () => authority;
export const setAuthority = (a: CaseAuthority | null) => void (authority = a);
const listeners = new Set<() => void>();

/** Что делать после каждого изменения (после подписчиков): сюда `flow.ts` подключает слежение за состояниями предметов. */
let afterSet: () => void = () => undefined;
export const onAfterSet = (fn: () => void) => void (afterSet = fn);

export function set(patch: Partial<GameState> | ((s: GameState) => Partial<GameState>)) {
  state = { ...state, ...(typeof patch === "function" ? patch(state) : patch) };
  // Ошибка одного подписчика (например, сцены Phaser) не должна лишать обновления остальных
  // и обрывать действие, которое вызвало изменение: иначе окна «не реагируют» на клики.
  for (const l of [...listeners]) {
    try {
      l();
    } catch (e) {
      console.error(`[${APP_NAME}] ошибка подписчика стора:`, e);
    }
  }
  afterSet();
}

let saveWarned = false;
/** Новое расследование: предупреждение о несохранении можно показать снова. */
export const resetSaveWarning = () => void (saveWarned = false);
listeners.add(
  createAutosave(
    () => state,
    () => {
      // один раз за расследование: браузер не хранит прогресс (переполнено или запрещено)
      if (saveWarned) return;
      saveWarned = true;
      toast("Прогресс не сохраняется в этом браузере — не закрывайте вкладку", 3500, true);
    },
  ),
);
pauseOnPageHide(() => state);

export const store = {
  get: () => state,
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

export function useGame<T>(selector: (s: GameState) => T): T {
  return useSyncExternalStore(store.subscribe, () => selector(state));
}

/** Игрок не должен двигаться, пока открыт любой интерфейс поверх сцены. */
export const isWorldBlocked = (s: GameState) => s.screen !== "play" || s.overlay !== null || s.notesOpen;

/** Сцена запомнила позицию игрока (без перерисовки: меняется каждую секунду движения). */
export function rememberPlayer(player: { x: number; y: number; locationId: string }) {
  state = { ...state, savedPlayer: player };
}

let toastSeq = 0;
export function toast(text: string, ms = 3500, alert = false) {
  const id = ++toastSeq;
  set((s) => ({ toasts: [...s.toasts, { id, text, alert }].slice(-3) }));
  setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), ms);
}

/**
 * Вопрос судье. Пока ждём ответа, игрок мог выйти из дела — тогда результат не нужен.
 * Ошибку (в онлайне — нет связи) показываем и возвращаем null.
 */
export async function ask<T>(call: (a: CaseAuthority) => Promise<T>): Promise<T | null> {
  const a = authority;
  if (!a) return null;
  try {
    const result = await call(a);
    return authority === a ? result : null;
  } catch (e) {
    console.error(`[${APP_NAME}] судья не ответил:`, e);
    if (authority === a) toast("Не удалось проверить ответ. Попробуйте ещё раз.", 3500, true);
    return null;
  }
}
