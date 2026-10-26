import { editorPathOfPlaytest } from "../content/drafts";
import { RESULT_FORMAT_VERSION, type CaseAuthority, type FinishInput } from "../../../../shared/judge";
import { FROM_EDITOR, GAME_VERSION } from "../env";
import { currentRoute, navigate } from "../ui/lib/router";
import { startProgress } from "../../../../shared/conditions";
import { registerCaseArt } from "../game/art";
import { startLocation } from "../content/case-utils";
import type { ResultRecord } from "./result-record";
import { isSaveOutdated, sanitizeSave } from "./save-data";
import { platform } from "./platform";
import { ask, getAuthority, initialState, resetSaveWarning, set, setAuthority, state, toast } from "./core";
import { enterLocation } from "./flow";

let submitting = false;

/** Жизненный цикл расследования: открыть дело, начать, продолжить, выйти, сдать. */
export const session = {
  /** На главную страницу сайта. */
  goMenu: () => {
    setAuthority(null);
    set(initialState());
    navigate("/");
  },
  /** Сменился адрес (ссылка в шапке, «назад» в браузере) на вступлении или результате — показать страницу сайта. */
  leaveToSite() {
    if (state.screen !== "intro" && state.screen !== "result") return;
    setAuthority(null);
    set(initialState());
    // адрес расследования больше не нужен: сайт — на списке дел (или в конструкторе, если это тестовый запуск)
    const page = currentRoute().page;
    if (page === "play" || page === "playtest") navigate(FROM_EDITOR ? editorPathOfPlaytest() : "/cases", { replace: true });
  },

  /** К списку дел. */
  goSelect: () => {
    setAuthority(null);
    set(initialState());
    navigate("/cases");
  },
  showHowTo: () => set({ overlay: { kind: "howto" } }),

  openCase(judge: CaseAuthority) {
    setAuthority(judge);
    const caseFile = judge.caseFile;
    registerCaseArt(caseFile);
    set({ ...initialState(), screen: "intro", caseFile, locationId: startLocation(caseFile).id });
  },

  /** Новое расследование: старое сохранение этого дела стирается. */
  beginInvestigation() {
    resetSaveWarning();
    const caseId = state.caseFile?.id;
    set((s) => ({
      screen: "play",
      progress: startProgress(s.caseFile),
      startedAt: Date.now(),
      runId: s.runId + 1,
    }));
    // стираем старое сохранение после смены состояния: автосохранение только что записало новое начало, а оно не нужно, пока игрок ничего не сделал
    if (caseId) void platform().saves.clear(caseId);
    void getAuthority()
      ?.begin?.()
      .catch(() => toast("Нет связи с сервером: время расследования может не засчитаться", 3500, true));
    // старт тоже вход в локацию
    enterLocation(state.locationId);
  },

  /** Продолжить по сохранению; без аргумента — уже открытое дело (экран вступления). */
  async resume(judge = getAuthority()) {
    if (!judge) return;
    const caseFile = judge.caseFile;
    registerCaseArt(caseFile);
    const raw = await platform().saves.read(caseFile.id);
    // устаревшее сохранение не загружаем — экран дела покажет предупреждение
    // сохранение другого прохождения (свободная игра ↔ мероприятие, закрытая попытка) тоже не берём
    if (!raw || isSaveOutdated(raw, caseFile) || (raw.attemptId && judge.attemptId && raw.attemptId !== judge.attemptId)) return session.openCase(judge);
    const save = sanitizeSave(raw, caseFile);
    setAuthority(judge);
    const known = await ask((a) => a.restore(save.progress.deductions, save.hintsUsed));
    if (!known) return session.openCase(judge);
    set({
      ...initialState(),
      caseFile,
      screen: save.screen,
      // пока игрока не было, таймер стоял
      startedAt: known.elapsedMs != null ? Date.now() - known.elapsedMs : (save.startedAt ?? Date.now()) + (save.pausedAt ? Math.max(0, Date.now() - save.pausedAt) : 0),
      // выбранные варианты раньше лежали отдельно (`usedChoices`)
      progress: { ...save.progress, chosen: save.progress.chosen ?? save.usedChoices ?? [] },
      examined: save.examined,
      marks: save.marks ?? {},
      wrongDeductions: known.wrongDeductions ?? save.wrongDeductions,
      playerNotes: save.playerNotes,
      hintsUsed: known.hintsUsed,
      hints: known.hints,
      conclusions: known.conclusions,
      answers: save.answers,
      locationId: caseFile.locations.some((l) => l.id === save.locationId) ? save.locationId : startLocation(caseFile).id,
      savedPlayer: save.player,
      runId: state.runId + 1,
    });
  },

  /** Начать провалившееся дело заново (окно «Дело провалено»). */
  restartAfterFail() {
    if (state.overlay?.kind !== "failed") return;
    set({ overlay: null });
    session.beginInvestigation();
  },

  /** Выход в главное меню; без сохранения — расследование сбрасывается. */
  exitToMenu(keepProgress: boolean) {
    if (!keepProgress && state.caseFile) void platform().saves.clear(state.caseFile.id);
    if (keepProgress && state.caseFile) void platform().saves.markPaused(state.caseFile.id);
    const judge = getAuthority();
    void (keepProgress ? judge?.pause?.() : judge?.discard?.())?.catch(() => {});
    setAuthority(null);
    set({ ...initialState(), runId: state.runId });
    navigate(FROM_EDITOR ? editorPathOfPlaytest() : "/cases");
  },

  goFinal() {
    set({ screen: "final", overlay: null });
  },

  backToInvestigation() {
    set({ screen: "play" });
  },

  /** Открыть сохранённый результат прохождения (из списка дел или профиля). */
  async showResult(judge: CaseAuthority, record: ResultRecord) {
    if (!record.score) return;
    setAuthority(judge);
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
        eventId: getAuthority()?.eventId,
      };
      // запись выполняется сразу (локально); дошёл ли результат до сервера, платформа сообщит позже
      const delivery = platform().results.record(record);
      set({ screen: "result", score, record, debrief: result.debrief });
      void delivery.then(({ delivered }) => delivered || toast("Результат не удалось отправить на сервер — он сохранён в этом браузере", 3500, true));
    } finally {
      submitting = false;
    }
  },
};
