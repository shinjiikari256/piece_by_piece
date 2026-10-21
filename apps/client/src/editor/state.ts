import { readJson, readRaw, writeJson, writeRaw } from "../state/storage";
import { useSyncExternalStore } from "react";
import type { CaseFile } from "../../../../shared/case";
import { parseCase } from "../../../../shared/migrate";
import { validateCase } from "../content/validate";
import { caseWarnings } from "../content/warnings";
import { registerCaseArt } from "../game/art";
import { saveDraft, savePlaytest } from "../content/drafts";
import { blankCase } from "./template";

/**
 * Состояние конструктора: черновик дела + история для отмены.
 * Черновик всегда структурно соответствует схеме (формы не дают ввести
 * значение не того типа), а смысловые ошибки показывает валидатор.
 */

export type SectionId =
  | "general"
  | "characters"
  | "locations"
  | "evidence"
  | "events"
  | "dialogues"
  | "deductions"
  | "hints"
  | "questions"
  | "solution"
  | "law"
  | "authorship"
  | "settings"
  | "visibility"
  | "flags"
  | "sprites"
  | "json"
  | "errors";

/** Куда перейти внутри раздела (например, к объекту с ошибкой). */
export interface Focus {
  section: SectionId;
  id?: string;
  /** Уточнение: узел диалога, локация предмета и т.п. */
  sub?: string;
  /** Для локаций: что выделить на карте. */
  kind?: "object" | "npc" | "zone";
}

export interface EditorState {
  /** Стартовая страница со списком дел или редактор открытого дела. */
  screen: "home" | "case";
  draft: CaseFile;
  past: CaseFile[];
  future: CaseFile[];
  section: SectionId;
  focus: Focus | null;
  errors: string[];
  /** Не блокируют сохранение: диалог без запуска, флаг без источника и т. п. */
  warnings: string[];
  /** Есть ли изменения после последнего «Сохранить». */
  dirty: boolean;
  /** Браузер не смог записать черновик (хранилище переполнено или недоступно) — правки живут только до перезагрузки. */
  storageFailed: boolean;
  /** Ключ последней правки — подряд идущие правки одного поля склеиваются в один шаг отмены. */
  lastMergeKey: string | null;
  lastEditAt: number;
}

const CURRENT_KEY = "editor:current";
const SAVED_KEY = "editor:saved";
const HISTORY_LIMIT = 150;

function loadCurrent(): CaseFile {
  // нет хранилища или мусор — начинаем с шаблона
  const parsed = parseCase(readJson<unknown>(CURRENT_KEY, null));
  return parsed.success ? parsed.data : blankCase();
}

const errorsOf = (draft: CaseFile) => {
  const r = validateCase(draft);
  return r.ok ? [] : r.errors;
};

/** Предупреждения считаем только для корректного дела (с ошибками смотреть на них рано). */
const warningsOf = (draft: CaseFile) => {
  try {
    return validateCase(draft).ok ? caseWarnings(draft) : [];
  } catch {
    return [];
  }
};

const initialDraft = loadCurrent();
registerCaseArt(initialDraft);
let savedJson = readRaw(SAVED_KEY) ?? JSON.stringify(initialDraft);
let state: EditorState = {
  screen: "home",
  draft: initialDraft,
  past: [],
  future: [],
  section: "general",
  focus: null,
  dirty: JSON.stringify(initialDraft) !== savedJson,
  storageFailed: false,
  errors: errorsOf(initialDraft),
  warnings: warningsOf(initialDraft),
  lastMergeKey: null,
  lastEditAt: 0,
};
const listeners = new Set<() => void>();

let validateTimer: ReturnType<typeof setTimeout> | undefined;
function set(patch: Partial<EditorState>) {
  if (patch.draft) registerCaseArt(patch.draft);
  if (patch.draft) patch = { ...patch, dirty: JSON.stringify(patch.draft) !== savedJson };
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
  if (patch.draft) {
    const stored = writeJson(CURRENT_KEY, patch.draft);
    if (state.storageFailed === stored) {
      state = { ...state, storageFailed: !stored };
      listeners.forEach((l) => l());
    }
    clearTimeout(validateTimer);
    validateTimer = setTimeout(() => {
      state = { ...state, errors: errorsOf(state.draft), warnings: warningsOf(state.draft) };
      listeners.forEach((l) => l());
    }, 250);
  }
}

function markSaved(draft: CaseFile) {
  savedJson = JSON.stringify(draft);
  writeRaw(SAVED_KEY, savedJson); // без хранилища признак «сохранено» живёт до перезагрузки
}

export const editorStore = {
  get: () => state,
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
};

export function useEditor<T>(selector: (s: EditorState) => T): T {
  return useSyncExternalStore(editorStore.subscribe, () => selector(state));
}

export const editor = {
  /** Изменить черновик. mergeKey склеивает быстрые правки одного поля (ввод текста) в один шаг истории. */
  update(fn: (draft: CaseFile) => CaseFile, mergeKey?: string) {
    const changed = fn(state.draft);
    if (changed === state.draft) return;
    // любая правка — новая версия дела: старые сохранения игроков станут устаревшими
    const next = { ...changed, updatedAt: new Date().toISOString().replace(/\.\d+Z$/, "Z") };
    const now = Date.now();
    const merge = mergeKey && mergeKey === state.lastMergeKey && now - state.lastEditAt < 1500;
    set({
      draft: next,
      past: merge ? state.past : [...state.past, state.draft].slice(-HISTORY_LIMIT),
      future: [],
      lastMergeKey: mergeKey ?? null,
      lastEditAt: now,
    });
  },

  undo() {
    const prev = state.past[state.past.length - 1];
    if (!prev) return;
    set({ draft: prev, past: state.past.slice(0, -1), future: [state.draft, ...state.future], lastMergeKey: null });
  },

  redo() {
    const next = state.future[0];
    if (!next) return;
    set({ draft: next, past: [...state.past, state.draft], future: state.future.slice(1), lastMergeKey: null });
  },

  /** Открыть дело в редакторе (новое, сохранённое, импортированное). */
  open(draft: CaseFile) {
    editor.load(draft);
    set({ screen: "case", section: "general", focus: null });
  },

  openHome() {
    set({ screen: "home" });
  },

  /** Загрузить дело целиком (новое, открытое, импортированное) — оно считается сохранённым. */
  load(draft: CaseFile) {
    markSaved(draft);
    set({ draft, past: [...state.past, state.draft].slice(-HISTORY_LIMIT), future: [], lastMergeKey: null });
  },

  goto(section: SectionId, focus?: Omit<Focus, "section">) {
    set({ screen: "case", section, focus: focus ? { section, ...focus } : null });
  },

  /** «Сохранить»: дело без ошибок появляется в игре (черновики конструктора). */
  save() {
    if (state.errors.length || !state.dirty) return false;
    if (!saveDraft(state.draft.id, state.draft)) {
      set({ storageFailed: true });
      return false;
    }
    markSaved(state.draft);
    set({ dirty: false });
    return true;
  },

  /** Тестовый запуск: отдельная копия, сохранять дело не обязательно. */
  playtest() {
    savePlaytest(state.draft);
  },
};

// ---------- пути в объекте ----------

export type Path = (string | number)[];

export function getIn(obj: unknown, path: Path): unknown {
  return path.reduce<unknown>((o, k) => (o == null ? undefined : (o as Record<string | number, unknown>)[k]), obj);
}

/** Неизменяемая запись по пути; undefined удаляет ключ объекта. */
export function setIn<T>(obj: T, path: Path, value: unknown): T {
  if (!path.length) return value as T;
  const [head, ...rest] = path;
  if (Array.isArray(obj)) {
    const copy = [...obj];
    copy[head as number] = setIn(copy[head as number], rest, value);
    return copy as T;
  }
  const source = (obj ?? {}) as Record<string, unknown>;
  const inner = setIn(source[head as string], rest, value);
  const copy = { ...source };
  if (inner === undefined) delete copy[head as string];
  else copy[head as string] = inner;
  return copy as T;
}
