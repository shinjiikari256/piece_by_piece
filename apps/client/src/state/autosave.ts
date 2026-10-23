import type { GameState } from "./store";
import { platform } from "./platform";

/** Поля, из которых состоит сохранение. Тосты, окна и прочее на сохранение не влияют. */
const SAVED_FIELDS = ["screen", "startedAt", "progress", "examined", "marks", "wrongDeductions", "playerNotes", "hintsUsed", "answers", "locationId"] as const;

const isSaving = (s: GameState) => !!s.caseFile && (s.screen === "play" || s.screen === "final");

/**
 * Автосохранение: пока идёт расследование, изменения пишутся в localStorage.
 * Пишем, только если изменилось поле сохранения (сравнение по ссылке, состояние неизменяемо).
 */
export function createAutosave(get: () => GameState, onFail: () => void) {
  let last: GameState | null = null;
  return () => {
    const s = get();
    if (!isSaving(s) || !s.caseFile) {
      last = null;
      return;
    }
    if (last && last.caseFile === s.caseFile && SAVED_FIELDS.every((k) => last![k] === s[k])) return;
    last = s;
    // запись выполняется сразу; если хранилище её не приняло, игрок получит предупреждение
    void platform()
      .saves.write({
        caseId: s.caseFile.id,
        screen: s.screen as "play" | "final",
        startedAt: s.startedAt,
        progress: s.progress,
        examined: s.examined,
        marks: s.marks,
        usedChoices: s.progress.chosen, // для сохранений прежнего вида
        wrongDeductions: s.wrongDeductions,
        playerNotes: s.playerNotes,
        hintsUsed: s.hintsUsed,
        answers: s.answers,
        locationId: s.locationId,
        caseUpdatedAt: s.caseFile.updatedAt,
      })
      .then((ok) => ok || onFail());
  };
}

/** Закрыли вкладку посреди расследования — время до возвращения не считаем. */
export function pauseOnPageHide(get: () => GameState) {
  if (typeof window === "undefined") return;
  window.addEventListener("pagehide", () => {
    const s = get();
    if (s.caseFile && isSaving(s)) void platform().saves.markPaused(s.caseFile.id);
  });
}
