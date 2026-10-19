import { editorPathOfPlaytest } from "../content/drafts";
import { useSyncExternalStore } from "react";
import type { Effect, Solution, ZoneAction } from "../../../../shared/case";
import type { PublicCase, PublicDeduction } from "../../../../shared/public-case";
import { RESULT_FORMAT_VERSION, type CaseAuthority, type DeductionVerdict, type FinishInput, type RevealedHint } from "../../../../shared/judge";
import { APP_NAME, FROM_EDITOR, GAME_VERSION } from "../env";
import { currentRoute, navigate } from "../ui/router";
import { createAutosave, pauseOnPageHide } from "./autosave";
import { applyEffects, emptyProgress, meets, startProgress, type Progress } from "../../../../shared/conditions";
import { allNpcs, findObject, startLocation, zoneTargetCell } from "../content/case-utils";
import { gameBridge } from "../game/bridge";
import type { ResultRecord } from "./result-record";
import type { Answers, Score } from "../../../../shared/scoring";
import { isSaveOutdated, sanitizeSave } from "./save-data";
import { platform } from "./platform";

/** menu — страницы сайта (адрес решает какая, см. ui/router.ts); остальное — расследование. */
export type Screen = "menu" | "intro" | "play" | "final" | "result";
export type JournalTab = "brief" | "materials" | "characters" | "law";

/** Пометка игрока на материале: важное — наверх, неважное — вниз и бледнее. */
export type Mark = "important" | "unimportant";

export type Overlay =
  | { kind: "object"; objectId: string }
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
  | { kind: "hints" }
  | { kind: "howto" }
  | { kind: "exit" };

export interface Toast {
  id: number;
  text: string;
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
  usedChoices: string[];
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



const initialState = (): GameState => ({
  screen: "menu",
  caseFile: null,
  startedAt: null,
  progress: emptyProgress(),
  examined: [],
  marks: {},
  notesOpen: false,
  usedChoices: [],
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

let state = initialState();
/** Судья текущего дела: проверяет сопоставления, выдаёт подсказки, считает итог. */
let authority: CaseAuthority | null = null;
const listeners = new Set<() => void>();

function set(patch: Partial<GameState> | ((s: GameState) => Partial<GameState>)) {
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
}

let saveWarned = false;
listeners.add(
  createAutosave(
    () => state,
    () => {
      // один раз за расследование: браузер не хранит прогресс (переполнено или запрещено)
      if (saveWarned) return;
      saveWarned = true;
      toast("Прогресс не сохраняется в этом браузере — не закрывайте вкладку");
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

let toastSeq = 0;
let submitting = false;
function toast(text: string) {
  const id = ++toastSeq;
  set((s) => ({ toasts: [...s.toasts, { id, text }].slice(-3) }));
  setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 3500);
}

function evidenceTitle(id: string) {
  return state.caseFile?.evidence.find((e) => e.id === id)?.title ?? id;
}

function announceEvidence(ids: string[]) {
  ids.forEach((id) => toast(`В дело добавлено: ${evidenceTitle(id)}`));
}

const whereIs = (characterId: string) => gameBridge.whereIs?.(characterId);
/** Границы счётчиков дела — для эффектов «изменить переменную». */
const counterDefs = () => state.caseFile?.counters ?? [];

/**
 * `moveTo` с областью: персонаж встаёт на свободную клетку внутри неё — подставляем её в `x, y`
 * (чужие итоговые места и клетки, занятые раньше в этом же наборе эффектов, пропускаем).
 */
function withZoneTargets(effects: Effect[]): Effect[] {
  const c = state.caseFile;
  if (!c || !effects.some((e) => e.type === "moveTo" && e.zoneId)) return effects;
  const taken = new Map<string, Set<string>>();
  const mark = (locationId: string, x: number, y: number) => taken.set(locationId, (taken.get(locationId) ?? new Set()).add(`${x},${y}`));
  for (const [id, p] of Object.entries(state.progress.npcPlaces)) if (!effects.some((e) => e.type === "moveTo" && e.characterId === id)) mark(p.locationId, p.x, p.y);
  return effects.map((e) => {
    if (e.type !== "moveTo" || !e.zoneId) return e;
    const loc = c.locations.find((l) => l.id === e.locationId);
    const zone = loc?.zones.find((z) => z.id === e.zoneId);
    const cell = loc && zone ? zoneTargetCell(loc, zone, e.characterId, taken.get(loc.id)) : null;
    if (!cell) return e; // области нет или она вся занята: идёт на запасную клетку
    mark(e.locationId, cell.x, cell.y);
    return { ...e, x: cell.x, y: cell.y };
  });
}

function enterNode(npcId: string, dialogueId: string, nodeId: string) {
  const dialogue = state.caseFile?.dialogues.find((d) => d.id === dialogueId);
  const node = dialogue?.nodes.find((n) => n.id === nodeId);
  if (!node) return;
  const { progress, newEvidence } = applyEffects(withZoneTargets(node.effects), state.progress, whereIs, counterDefs());
  set({ progress, overlay: { kind: "dialogue", npcId, dialogueId, nodeId } });
  announceEvidence(newEvidence);
}

/**
 * Вопрос судье. Пока ждём ответа, игрок мог выйти из дела — тогда результат не нужен.
 * Ошибку (в онлайне — нет связи) показываем и возвращаем null.
 */
async function ask<T>(call: (a: CaseAuthority) => Promise<T>): Promise<T | null> {
  const a = authority;
  if (!a) return null;
  try {
    const result = await call(a);
    return authority === a ? result : null;
  } catch (e) {
    console.error(`[${APP_NAME}] судья не ответил:`, e);
    if (authority === a) toast("Не удалось проверить ответ. Попробуйте ещё раз.");
    return null;
  }
}

/** Сколько спутник стоит в области без подходящего действия, прежде чем уйти домой. */
const FOLLOWER_DISMISS_MS = 3000;
const dismissTimers = new Map<string, ReturnType<typeof setTimeout>>();

/** Устойчивый ключ действия области (не зависит от порядка в списке) — для «сработало один раз». */
const actionKey = (zoneId: string, a: ZoneAction) =>
  `${zoneId}:${a.kind}:${a.kind === "dialogue" ? a.dialogueId : a.kind === "object" ? a.objectId : a.kind === "effects" ? JSON.stringify(a.effects) : a.to}`;

/** Первое подходящее действие области: условие выполнено, цель существует; `auto` — только с автозапуском и ещё не сработавшие. */
function zoneAction(zoneId: string, auto = false): ZoneAction | undefined {
  const c = state.caseFile;
  const zone = c?.locations.flatMap((l) => l.zones).find((z) => z.id === zoneId);
  return zone?.actions.find(
    (a) =>
      meets(a.requires, state.progress, state.locationId) &&
      (a.kind !== "dialogue" || c!.dialogues.some((d) => d.id === a.dialogueId)) &&
      (!auto || (a.auto && !state.progress.fired.includes(actionKey(zoneId, a)))),
  );
}

/** Выполнить действие области: диалог, взаимодействие с предметом или выход. */
function runZoneAction(zoneId: string, a: ZoneAction) {
  if (a.kind === "dialogue") {
    const dialogue = state.caseFile?.dialogues.find((d) => d.id === a.dialogueId);
    if (dialogue) enterNode(`zone:${zoneId}`, dialogue.id, dialogue.startNodeId);
  } else if (a.kind === "object") actions.interact(a.objectId);
  else if (a.kind === "effects") {
    const { progress, newEvidence } = applyEffects(withZoneTargets(a.effects), state.progress, whereIs, counterDefs());
    set({ progress });
    announceEvidence(newEvidence);
  } else actions.travel({ to: a.to, spawn: a.spawn });
}

const choiceKey = (dialogueId: string, nodeId: string, choiceId: string) =>
  `${dialogueId}/${nodeId}/${choiceId}`;

export const actions = {
  /** На главную страницу сайта. */
  goMenu: () => {
    authority = null;
    set(initialState());
    navigate("/");
  },
  /** Сменился адрес (ссылка в шапке, «назад» в браузере) на вступлении или результате — показать страницу сайта. */
  leaveToSite() {
    if (state.screen !== "intro" && state.screen !== "result") return;
    authority = null;
    set(initialState());
    // адрес расследования больше не нужен: сайт — на списке дел (или в конструкторе, если это тестовый запуск)
    const page = currentRoute().page;
    if (page === "play" || page === "playtest") navigate(FROM_EDITOR ? editorPathOfPlaytest() : "/cases", { replace: true });
  },

  /** К списку дел. */
  goSelect: () => {
    authority = null;
    set(initialState());
    navigate("/cases");
  },
  showHowTo: () => set({ overlay: { kind: "howto" } }),

  openCase(judge: CaseAuthority) {
    authority = judge;
    const caseFile = judge.caseFile;
    set({ ...initialState(), screen: "intro", caseFile, locationId: startLocation(caseFile).id });
  },

  /** Новое расследование: старое сохранение этого дела стирается. */
  beginInvestigation() {
    saveWarned = false;
    const caseId = state.caseFile?.id;
    set((s) => ({
      screen: "play",
      progress: startProgress(s.caseFile),
      startedAt: Date.now(),
      runId: s.runId + 1,
    }));
    // стираем старое сохранение после смены состояния: автосохранение только что записало новое начало, а оно не нужно, пока игрок ничего не сделал
    if (caseId) void platform().saves.clear(caseId);
  },

  /** Продолжить по сохранению; без аргумента — уже открытое дело (экран вступления). */
  async resume(judge = authority) {
    if (!judge) return;
    const caseFile = judge.caseFile;
    const raw = await platform().saves.read(caseFile.id);
    // устаревшее сохранение не загружаем — экран дела покажет предупреждение
    if (!raw || isSaveOutdated(raw, caseFile)) return actions.openCase(judge);
    const save = sanitizeSave(raw, caseFile);
    authority = judge;
    const known = await ask((a) => a.restore(save.progress.deductions, save.hintsUsed));
    if (!known) return actions.openCase(judge);
    set({
      ...initialState(),
      caseFile,
      screen: save.screen,
      // пока игрока не было, таймер стоял
      startedAt: (save.startedAt ?? Date.now()) + (save.pausedAt ? Math.max(0, Date.now() - save.pausedAt) : 0),
      progress: save.progress,
      examined: save.examined,
      marks: save.marks ?? {},
      usedChoices: save.usedChoices,
      wrongDeductions: save.wrongDeductions,
      playerNotes: save.playerNotes,
      hintsUsed: save.hintsUsed,
      hints: known.hints,
      conclusions: known.conclusions,
      answers: save.answers,
      locationId: caseFile.locations.some((l) => l.id === save.locationId) ? save.locationId : startLocation(caseFile).id,
      savedPlayer: save.player,
      runId: state.runId + 1,
    });
  },

  /** Есть ли сейчас подходящее действие у области (подсказка «Взаимодействие» показывается только тогда). */
  hasZoneAction(zoneId: string) {
    return !!zoneAction(zoneId);
  },

  /** Игрок вошёл в область: срабатывает первое подходящее действие с автозапуском (один раз за прохождение). */
  enterZone(zoneId: string) {
    if (isWorldBlocked(state)) return;
    const action = zoneAction(zoneId, true);
    if (!action) {
      // область с действиями, из которых сейчас ничего не подходит: спутники постоят и уйдут по своим местам
      const zone = state.caseFile?.locations.flatMap((l) => l.zones).find((z) => z.id === zoneId);
      if (zone?.actions.length && !zoneAction(zoneId) && state.progress.followers.length) {
        const where = state.locationId;
        clearTimeout(dismissTimers.get(zoneId));
        dismissTimers.set(
          zoneId,
          setTimeout(() => {
            dismissTimers.delete(zoneId);
            if (state.screen === "play" && state.locationId === where) actions.releaseFollowers();
          }, FOLLOWER_DISMISS_MS),
        );
      }
      return;
    }
    set((s) => ({ progress: { ...s.progress, fired: [...s.progress.fired, actionKey(zoneId, action)] } }));
    runZoneAction(zoneId, action);
  },

  /** Игрок вышел из области: спутники больше не «ждут» там. */
  leaveZone(zoneId: string) {
    clearTimeout(dismissTimers.get(zoneId));
    dismissTimers.delete(zoneId);
  },

  /** Отвязать всех спутников: каждый возвращается на своё место пешком (вручную — кнопка «Отпустить», сама — см. `enterZone`). */
  releaseFollowers() {
    const ids = state.progress.followers;
    if (!ids.length) return;
    const { progress } = applyEffects(ids.map((characterId) => ({ type: "returnHome" as const, characterId })), state.progress);
    set({ progress });
  },

  /** Переход через дверь в другую локацию; сцену перестраивает OfficeScene. */
  travel(exit: { to: string; spawn: { x: number; y: number } }) {
    if (isWorldBlocked(state)) return;
    set({ locationId: exit.to, spawn: exit.spawn });
  },

  /** Сцена запомнила позицию игрока (без перерисовки: меняется каждую секунду движения). */
  rememberPlayer(player: { x: number; y: number; locationId: string }) {
    state = { ...state, savedPlayer: player };
  },

  /**
   * Сцена сообщает, где персонаж оказался на самом деле: дошёл, вернулся или остался на месте, когда путь закрыт.
   * `null` — стоит на исходном месте (запись в `npcPlaces` не нужна).
   */
  npcPlaced(characterId: string, place: { locationId: string; x: number; y: number } | null) {
    const npcPlaces = { ...state.progress.npcPlaces };
    if (place) npcPlaces[characterId] = place;
    else delete npcPlaces[characterId];
    set({ progress: { ...state.progress, npcPlaces } });
  },

  /** Сцена забрала точку появления. */
  consumeSpawn() {
    if (state.spawn) set({ spawn: null });
  },

  /** Выход в главное меню; без сохранения — расследование сбрасывается. */
  exitToMenu(keepProgress: boolean) {
    if (!keepProgress && state.caseFile) void platform().saves.clear(state.caseFile.id);
    if (keepProgress && state.caseFile) void platform().saves.markPaused(state.caseFile.id);
    authority = null;
    set({ ...initialState(), runId: state.runId });
    navigate(FROM_EDITOR ? editorPathOfPlaytest() : "/cases");
  },

  /** Вызывается из Phaser по E/клику: объект или NPC. */
  interact(targetId: string) {
    const s = state;
    if (isWorldBlocked(s) || !s.caseFile) return;
    if (targetId.startsWith("door:")) {
      const door = s.caseFile.locations.find((l) => l.id === s.locationId)?.doors.find((d) => `door:${d.id}` === targetId);
      if (door) toast(door.lockedText ? `Заперто. ${door.lockedText}` : "Заперто.");
      return;
    }
    if (targetId.startsWith("zone:")) {
      const action = zoneAction(targetId.slice(5));
      if (action) runZoneAction(targetId.slice(5), action);
      return;
    }
    const npc = allNpcs(s.caseFile).find((n) => n.id === targetId);
    if (npc) {
      // диалоги по условию — по порядку, первый подходящий; иначе диалог по умолчанию
      const dialogueId = npc.dialogues.find((d) => meets(d.requires, s.progress, s.locationId))?.dialogueId ?? npc.dialogueId;
      const dialogue = s.caseFile.dialogues.find((d) => d.id === dialogueId);
      if (!dialogue) return;
      enterNode(npc.id, dialogue.id, dialogue.startNodeId);
      return;
    }
    // осмотренное сразу попадает в дело
    const obj = findObject(s.caseFile, targetId);
    if (obj?.interaction) {
      const first = !s.examined.includes(obj.id);
      // эффекты — только при первом осмотре
      const { progress, newEvidence } = applyEffects(
        [{ type: "addEvidence", evidenceId: obj.interaction.evidenceId }, ...(first ? withZoneTargets(obj.interaction.effects ?? []) : [])],
        s.progress,
        whereIs,
        counterDefs(),
      );
      set({
        progress,
        overlay: { kind: "object", objectId: obj.id },
        examined: s.examined.includes(obj.id) ? s.examined : [...s.examined, obj.id],
      });
      announceEvidence(newEvidence);
    }
  },

  /** Совместимость: осмотр и так добавляет материал в дело. */
  addObjectToJournal(objectId: string) {
    const obj = state.caseFile && findObject(state.caseFile, objectId);
    if (!obj?.interaction) return;
    const { progress, newEvidence } = applyEffects([{ type: "addEvidence", evidenceId: obj.interaction.evidenceId }], state.progress);
    set({ progress });
    announceEvidence(newEvidence);
  },

  /** Пометить материал важным/неважным; повторная пометка тем же — снимает. */
  mark(key: string, mark: Mark) {
    set((s) => {
      const marks = { ...s.marks };
      if (marks[key] === mark) delete marks[key];
      else marks[key] = mark;
      return { marks };
    });
  },

  /** Поставить пометку (без переключения): кнопки «Важно/Неважно» в окне осмотра. */
  setMark(key: string, mark: Mark) {
    set((s) => ({ marks: { ...s.marks, [key]: mark } }));
  },

  toggleNotes(open?: boolean) {
    set((s) => ({ notesOpen: open ?? !s.notesOpen }));
  },

  /** Дописать выделенный текст в конец заметок. */
  appendNote(text: string) {
    const clean = text.trim().replace(/\s+/g, " ");
    if (!clean) return;
    // цитату в кавычки, если она сама с них не начинается
    const quote = /^[«"„“]/.test(clean) ? clean : `«${clean}»`;
    set((s) => ({ playerNotes: `${s.playerNotes.trimEnd()}${s.playerNotes.trim() ? "\n" : ""}— ${quote}` }));
    toast("Добавлено в заметки");
  },

  choose(choiceId: string) {
    const o = state.overlay;
    if (o?.kind !== "dialogue") return;
    const dialogue = state.caseFile?.dialogues.find((d) => d.id === o.dialogueId);
    const choice = dialogue?.nodes.find((n) => n.id === o.nodeId)?.choices.find((c) => c.id === choiceId);
    if (!dialogue || !choice || !meets(choice.requires, state.progress, state.locationId)) return;
    // запоминаем выбранное — для отметки ✓; повторный выбор просто снова ведёт к ответу.
    // Разные реакции на повтор автор строит флагами и условиями.
    const key = choiceKey(o.dialogueId, o.nodeId, choice.id);
    if (!state.usedChoices.includes(key)) set((s) => ({ usedChoices: [...s.usedChoices, key] }));
    // эффекты варианта — при каждом выборе, до ответа персонажа
    if (choice.effects?.length) {
      const { progress, newEvidence } = applyEffects(withZoneTargets(choice.effects), state.progress, whereIs, counterDefs());
      set({ progress });
      announceEvidence(newEvidence);
    }
    if (choice.next === null) set({ overlay: null });
    else enterNode(o.npcId, o.dialogueId, choice.next);
  },

  isChoiceVisible(choice: { requires?: Parameters<typeof meets>[0] }) {
    return meets(choice.requires, state.progress, state.locationId);
  },

  isChoiceUsed(dialogueId: string, nodeId: string, choiceId: string) {
    return state.usedChoices.includes(choiceKey(dialogueId, nodeId, choiceId));
  },

  open(overlay: Overlay) {
    if (state.screen === "play" || overlay.kind === "howto" || overlay.kind === "exit") set({ overlay });
  },
  close: () => set({ overlay: null }),

  findDeduction(evidenceIds: string[]): PublicDeduction | undefined {
    const key = [...evidenceIds].sort().join("+");
    return state.caseFile?.deductions.find((d) => [...d.evidenceIds].sort().join("+") === key);
  },

  /** Ответ на вопрос сопоставления; верный — устанавливает факт. null — судья не ответил. */
  async answerDeduction(deductionId: string, optionId: string): Promise<DeductionVerdict | null> {
    const d = state.caseFile?.deductions.find((x) => x.id === deductionId);
    if (!d) return null;
    const verdict = await ask((a) => a.checkDeduction(deductionId, optionId));
    if (!verdict) return null;
    if (!verdict.correct) {
      set((s) => ({ wrongDeductions: s.wrongDeductions + 1 }));
      return verdict;
    }
    if (!state.progress.deductions.includes(d.id)) {
      const base = { ...state.progress, deductions: [...state.progress.deductions, d.id] };
      const { progress, newEvidence } = applyEffects(d.effects, base, undefined, counterDefs());
      set((s) => ({ progress, conclusions: { ...s.conclusions, [d.id]: verdict.conclusion ?? "" } }));
      toast(`Установлен вывод: ${d.title}`);
      announceEvidence(newEvidence);
    }
    return verdict;
  },

  setNotes: (playerNotes: string) => set({ playerNotes }),

  async revealHint() {
    const next = [...(state.caseFile?.hints ?? [])].sort((a, b) => a.level - b.level)[state.hintsUsed];
    if (!next) return;
    const hint = await ask((a) => a.revealHint(next.level));
    // повторный клик, пока ждали, не должен открыть подсказку дважды
    if (!hint || state.hints.some((h) => h.level === hint.level)) return;
    set((s) => ({ hintsUsed: s.hintsUsed + 1, hints: [...s.hints, hint] }));
  },

  goFinal() {
    set({ screen: "final", overlay: null });
  },

  backToInvestigation() {
    set({ screen: "play" });
  },

  setAnswer(questionId: string, selected: string[]) {
    set((s) => ({ answers: { ...s.answers, [questionId]: selected } }));
  },

  /** Открыть сохранённый результат прохождения (из списка дел или профиля). */
  async showResult(judge: CaseAuthority, record: ResultRecord) {
    if (!record.score) return;
    authority = judge;
    const debrief = await ask((a) => a.debrief());
    set({
      ...initialState(),
      screen: "result",
      caseFile: judge.caseFile,
      score: record.score,
      record,
      debrief,
      wrongDeductions: record.wrongDeductions ?? 0,
    });
  },

  async submit() {
    const c = state.caseFile;
    if (!c || submitting) return;
    submitting = true;
    try {
      const input: FinishInput = {
        answers: state.answers,
        hintsUsed: state.hintsUsed,
        elapsedMs: state.startedAt ? Date.now() - state.startedAt : null,
        wrongDeductions: state.wrongDeductions,
        importantEvidence: Object.keys(state.marks).filter((k) => state.marks[k] === "important"),
      };
      const result = await ask((a) => a.finish(input));
      if (!result) return;
      void platform().saves.clear(c.id);
      const { score } = result;
      const record: ResultRecord = {
        caseId: c.id,
        number: c.number,
        title: c.title,
        total: score.total,
        max: score.max,
        hintsUsed: state.hintsUsed,
        at: Date.now(),
        score,
        wrongDeductions: state.wrongDeductions,
        input,
        caseConfigVersion: result.caseConfigVersion,
        gameVersion: GAME_VERSION,
        resultFormatVersion: RESULT_FORMAT_VERSION,
      };
      // запись выполняется сразу (локально); дошёл ли результат до сервера, платформа сообщит позже
      const delivery = platform().results.record(record);
      set({ screen: "result", score, record, debrief: result.debrief });
      void delivery.then(({ delivered }) => delivered || toast("Результат не удалось отправить на сервер — он сохранён в этом браузере"));
    } finally {
      submitting = false;
    }
  },
};
