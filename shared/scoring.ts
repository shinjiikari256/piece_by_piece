import { clamp } from "./math";
import type { CaseFile, Question, QuestionCategory } from "./case";

export type Answers = Record<string, string[]>;

export interface QuestionResult {
  question: Question;
  selected: string[];
  points: number;
  feedback: { optionId: string; points: number; text: string }[];
}

export interface ScoreGroup {
  label: string;
  points: number;
  max: number;
}

export interface Score {
  total: number;
  max: number;
  /** Бонус за время: получен ли и сколько. */
  timeBonus: {
    points: number;
    max: number;
    minutes: number;
    /** Сколько баллов (без бонуса, после штрафа за подсказки) нужно набрать, чтобы бонус засчитался. */
    minScore: number;
    /** Почему бонус не получен: не уложились или мало баллов. */
    missed: "time" | "score" | null;
    elapsedMin: number;
  } | null;
  groups: ScoreGroup[];
  hintPenalty: number;
  questions: QuestionResult[];
}

/** Группы из ТЗ, п. 13: «квалификация ситуации» объединяет факт нарушения и его юридическую оценку. */
const GROUPS: { label: string; categories: QuestionCategory[] }[] = [
  { label: "Определение права", categories: ["right"] },
  { label: "Квалификация ситуации", categories: ["violation", "qualification"] },
  { label: "Виновное лицо", categories: ["responsible"] },
  { label: "Доказательства", categories: ["evidence"] },
];

export function scoreQuestion(q: Question, selected: string[]): QuestionResult {
  const chosen = q.options.filter((o) => selected.includes(o.id));
  const raw = chosen.reduce((s, o) => s + o.points, 0);
  return {
    question: q,
    selected,
    points: clamp(raw, 0, q.maxPoints),
    feedback: chosen.map((o) => ({ optionId: o.id, points: o.points, text: o.feedback })),
  };
}

export function hintPenalty(c: CaseFile, hintsUsed: number): number {
  return c.hints.filter((h) => h.level <= hintsUsed).reduce((s, h) => s + h.penalty, 0);
}

/** Порог успеха для бонуса за время (в баллах), если в деле не задан свой: любой результат выше нуля. */
export const DEFAULT_BONUS_SCORE = 0;

export function scoreCase(c: CaseFile, answers: Answers, hintsUsed: number, elapsedMs = Infinity): Score {
  const questions = c.questions.map((q) => scoreQuestion(q, answers[q.id] ?? []));
  const groups = GROUPS.map(({ label, categories }) => {
    const rs = questions.filter((r) => categories.includes(r.question.category));
    return {
      label,
      points: rs.reduce((s, r) => s + r.points, 0),
      max: rs.reduce((s, r) => s + r.question.maxPoints, 0),
    };
  });
  const base = groups.reduce((s, g) => s + g.max, 0);
  const penalty = hintPenalty(c, hintsUsed);
  const earned = groups.reduce((s, g) => s + g.points, 0);
  const main = clamp(earned - penalty, 0, base);
  const tb = c.timeBonus;
  let timeBonus: Score["timeBonus"] = null;
  if (tb) {
    // бонус — только за успешное прохождение, уложившись в срок
    const minScore = tb.minScore ?? DEFAULT_BONUS_SCORE;
    const inTime = elapsedMs <= tb.minutes * 60_000;
    const enough = main > 0 && main >= minScore;
    timeBonus = {
      points: inTime && enough ? tb.points : 0,
      max: tb.points,
      minutes: tb.minutes,
      minScore,
      missed: inTime ? (enough ? null : "score") : "time",
      elapsedMin: Number.isFinite(elapsedMs) ? Math.ceil(elapsedMs / 60_000) : 0,
    };
  }
  // бонус возмещает потерянные баллы (подсказки, ложные улики), но выше суммы баллов дела итог не поднимается
  const total = Math.min(base, main + (timeBonus?.points ?? 0));
  return { total, max: base, groups, hintPenalty: penalty, questions, timeBonus };
}
