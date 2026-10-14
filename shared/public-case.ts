import type { CaseFile, Deduction, Hint, Question } from "./case";

/**
 * Дело в том виде, в каком его получает игрок: без ответов.
 * Убраны решение, баллы и пояснения вариантов, верность и вывод сопоставлений, тексты подсказок.
 * Карта, диалоги, улики и их условия остаются — их всё равно видно при игре.
 */
export type PublicDeduction = Omit<Deduction, "options" | "conclusion"> & { options: { id: string; text: string }[] };
export type PublicQuestion = Omit<Question, "options"> & { options: { id: string; label: string; mark?: string }[] };
export type PublicHint = Omit<Hint, "text">;

export type PublicCase = Omit<CaseFile, "solution" | "topic" | "deductions" | "questions" | "hints"> & {
  deductions: PublicDeduction[];
  questions: PublicQuestion[];
  hints: PublicHint[];
};

export function toPublicCase(c: CaseFile): PublicCase {
  const { solution: _s, topic: _t, deductions, questions, hints, ...rest } = c;
  return {
    ...rest,
    // внутри — только перечисленные поля: новое поле с ответом не утечёт само
    deductions: deductions.map((d) => ({
      id: d.id,
      title: d.title,
      evidenceIds: d.evidenceIds,
      question: d.question,
      options: d.options.map((o) => ({ id: o.id, text: o.text })),
      effects: d.effects,
    })),
    questions: questions.map((q) => ({
      id: q.id,
      category: q.category,
      prompt: q.prompt,
      kind: q.kind,
      source: q.source,
      maxPoints: q.maxPoints,
      options: q.options.map((o) => ({ id: o.id, label: o.label, mark: o.mark })),
    })),
    hints: hints.map((h) => ({ level: h.level, penalty: h.penalty })),
  };
}
