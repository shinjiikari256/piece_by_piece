import { objectEvidenceIds } from "../../../../shared/case";
import type { PublicDeduction } from "../../../../shared/public-case";
import type { DeductionVerdict } from "../../../../shared/judge";
import { applyEffects, choiceKey, meets } from "../../../../shared/conditions";
import { findObject } from "../content/case-utils";
import { ask, set, state, toast, type Mark, type Overlay } from "./core";
import { announce, enterNode, fxCtx, withZoneTargets } from "./flow";

/** Работа с материалами дела: пометки, заметки, диалоги, сопоставления, подсказки, ответы. */
export const investigation = {
  /** Положить в дело все улики, которые выдаёт предмет (в обход условий осмотра): для тестов и быстрой подготовки состояния. */
  addObjectToJournal(objectId: string) {
    const obj = state.caseFile && findObject(state.caseFile, objectId);
    const ids = obj ? objectEvidenceIds(obj) : [];
    if (!ids.length) return;
    const { progress, newEvidence, messages, removedEvidence, followUp } = applyEffects(ids.map((evidenceId) => ({ type: "addEvidence" as const, evidenceId })), state.progress, fxCtx());
    set({ progress });
    announce(newEvidence, messages, removedEvidence, followUp);
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
    if (!state.progress.chosen.includes(key)) set((s) => ({ progress: { ...s.progress, chosen: [...s.progress.chosen, key] } }));
    // эффекты варианта — при каждом выборе, до ответа персонажа
    if (choice.effects?.length) {
      const { progress, newEvidence, messages, removedEvidence, followUp } = applyEffects(withZoneTargets(choice.effects), state.progress, fxCtx(`choice:${o.dialogueId}/${o.nodeId}/${choice.id}`));
      set({ progress });
      announce(newEvidence, messages, removedEvidence, followUp);
      // эффект запустил другой диалог — обычный переход по варианту не нужен
      if (followUp.dialogueId && state.caseFile?.dialogues.some((d) => d.id === followUp.dialogueId)) return;
      // дело провалено — окно уже открыто, дальше диалог не идёт
      if (followUp.failCase) return;
    }
    if (choice.next === null) set({ overlay: null });
    else enterNode(o.npcId, o.dialogueId, choice.next);
  },

  /** Предъявить материал из журнала собеседнику: первое подходящее предъявление узла, иначе реакции нет. */
  present(evidenceId: string) {
    const o = state.overlay;
    if (o?.kind !== "dialogue" || !state.progress.collected.includes(evidenceId)) return;
    const dialogue = state.caseFile?.dialogues.find((d) => d.id === o.dialogueId);
    const node = dialogue?.nodes.find((n) => n.id === o.nodeId);
    const hit = node?.presentations?.find(
      (p) => (!p.evidenceIds.length || p.evidenceIds.includes(evidenceId)) && meets(p.requires, state.progress, state.locationId),
    );
    if (!dialogue || !hit) return toast("Собеседник не реагирует");
    // отметка ✓ у предъявленного материала; условие `chosen` понимает её как вариант `present:<id улики>`
    const key = choiceKey(o.dialogueId, o.nodeId, `present:${evidenceId}`);
    if (!state.progress.chosen.includes(key)) set((s) => ({ progress: { ...s.progress, chosen: [...s.progress.chosen, key] } }));
    if (hit.effects.length) {
      const { progress, newEvidence, messages, removedEvidence, followUp } = applyEffects(withZoneTargets(hit.effects), state.progress, fxCtx(`present:${o.dialogueId}/${o.nodeId}/${hit.id}`));
      set({ progress });
      announce(newEvidence, messages, removedEvidence, followUp);
      if (followUp.failCase) return;
      if (followUp.dialogueId && state.caseFile?.dialogues.some((d) => d.id === followUp.dialogueId)) return;
    }
    if (hit.next === null) set({ overlay: null });
    else enterNode(o.npcId, o.dialogueId, hit.next);
  },

  isChoiceVisible(choice: { requires?: Parameters<typeof meets>[0] }) {
    return meets(choice.requires, state.progress, state.locationId);
  },

  isChoiceUsed(dialogueId: string, nodeId: string, choiceId: string) {
    return state.progress.chosen.includes(choiceKey(dialogueId, nodeId, choiceId));
  },

  open(overlay: Overlay) {
    if (state.screen === "play" || overlay.kind === "howto" || overlay.kind === "exit") set({ overlay });
  },
  close: () => set({ overlay: null }),

  findDeduction(evidenceIds: string[]): PublicDeduction | undefined {
    const key = [...evidenceIds].sort().join("+");
    return state.caseFile?.deductions.find((d) => [...d.evidenceIds].sort().join("+") === key && meets(d.requires, state.progress, state.locationId));
  },

  /** Ответ на вопрос сопоставления; верный — устанавливает факт. null — судья не ответил. */
  async answerDeduction(deductionId: string, optionId: string): Promise<DeductionVerdict | null> {
    const d = state.caseFile?.deductions.find((x) => x.id === deductionId);
    if (!d) return null;
    const verdict = await ask((a) => a.checkDeduction(deductionId, optionId));
    if (!verdict) return null;
    if (!verdict.correct) {
      set((s) => ({ wrongDeductions: s.wrongDeductions + 1 }));
      if (d.failEffects?.length) {
        const { progress, newEvidence, messages, removedEvidence, followUp } = applyEffects(withZoneTargets(d.failEffects), state.progress, fxCtx(`deductionFail:${d.id}`));
        set({ progress });
        announce(newEvidence, messages, removedEvidence, followUp);
      }
      return verdict;
    }
    if (!state.progress.deductions.includes(d.id)) {
      const base = { ...state.progress, deductions: [...state.progress.deductions, d.id] };
      const { progress, newEvidence, messages, removedEvidence, followUp } = applyEffects(d.effects, base, fxCtx(`deduction:${d.id}`));
      set((s) => ({ progress, conclusions: { ...s.conclusions, [d.id]: verdict.conclusion ?? "" } }));
      toast(`Установлен вывод: ${d.title}`);
      announce(newEvidence, messages, removedEvidence, followUp);
    }
    return verdict;
  },

  setNotes: (playerNotes: string) => set({ playerNotes }),

  async revealHint() {
    const next = [...(state.caseFile?.hints ?? [])].sort((a, b) => a.level - b.level)[state.hintsUsed];
    if (!next || !meets(next.requires, state.progress, state.locationId)) return;
    const hint = await ask((a) => a.revealHint(next.level));
    // повторный клик, пока ждали, не должен открыть подсказку дважды
    if (!hint || state.hints.some((h) => h.level === hint.level)) return;
    set((s) => ({ hintsUsed: s.hintsUsed + 1, hints: [...s.hints, hint] }));
  },

  setAnswer(questionId: string, selected: string[]) {
    set((s) => ({ answers: { ...s.answers, [questionId]: selected } }));
  },
};
