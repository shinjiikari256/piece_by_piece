import type { CaseFile, Solution } from "./case";
import type { PublicCase } from "./public-case";
import { scoreCase, type Answers, type Score } from "./scoring";

/**
 * «Судья» — всё, что требует знания ответов. Чистые функции над полным делом:
 * в офлайне их вызывает браузер (LocalAuthority), в онлайне — сервер.
 */

export interface DeductionVerdict {
  correct: boolean;
  feedback: string;
  /** Установленный факт — только для верного ответа. */
  conclusion?: string;
}

export interface RevealedHint {
  level: number;
  text: string;
  penalty: number;
}

export interface FinishInput {
  answers: Answers;
  hintsUsed: number;
  /** Время расследования (null — неизвестно, бонуса нет); в онлайне сервер считает его сам. */
  elapsedMs: number | null;
  wrongDeductions: number;
  /** Материалы, помеченные игроком важными, — для статистики. */
  importantEvidence: string[];
}

/** Формат записи результата; меняется, когда меняются поля результата или ответа. */
export const RESULT_FORMAT_VERSION = 1;

export interface CaseResult {
  score: Score;
  /** Версия конфигурации дела, по которой считали (updatedAt). */
  caseConfigVersion: string | null;
  /** Разбор дела; null — политика мероприятия его не показывает. */
  debrief: Solution | null;
}

/** Что игрок уже узнал: выводы установленных фактов и открытые подсказки (при продолжении расследования). */
export interface Revealed {
  conclusions: Record<string, string>;
  hints: RevealedHint[];
}

/** Связь игрока с судьёй на одно прохождение дела. */
export interface CaseAuthority {
  readonly caseFile: PublicCase;
  checkDeduction(deductionId: string, optionId: string): Promise<DeductionVerdict>;
  /** Открыть подсказку следующего уровня; штраф учитывает судья. */
  revealHint(level: number): Promise<RevealedHint>;
  /** Восстановить узнанное по сохранению. */
  restore(deductionIds: string[], hintsUsed: number): Promise<Revealed>;
  finish(input: FinishInput): Promise<CaseResult>;
  /** Разбор для уже сданного дела (открыть результат из списка). */
  debrief(): Promise<Solution | null>;
}

export function checkDeduction(c: CaseFile, deductionId: string, optionId: string): DeductionVerdict | null {
  const d = c.deductions.find((x) => x.id === deductionId);
  const option = d?.options.find((x) => x.id === optionId);
  if (!d || !option) return null;
  return option.correct
    ? { correct: true, feedback: option.feedback, conclusion: d.conclusion }
    : { correct: false, feedback: option.feedback };
}

export function revealHint(c: CaseFile, level: number): RevealedHint | null {
  const h = c.hints.find((x) => x.level === level);
  return h ? { level: h.level, text: h.text, penalty: h.penalty } : null;
}

export function revealed(c: CaseFile, deductionIds: string[], hintsUsed: number): Revealed {
  return {
    conclusions: Object.fromEntries(
      c.deductions.filter((d) => deductionIds.includes(d.id)).map((d) => [d.id, d.conclusion]),
    ),
    hints: c.hints
      .filter((h) => h.level <= hintsUsed)
      .sort((a, b) => a.level - b.level)
      .map((h) => ({ level: h.level, text: h.text, penalty: h.penalty })),
  };
}

export function finish(c: CaseFile, input: FinishInput): CaseResult {
  return {
    score: scoreCase(c, input.answers, input.hintsUsed, input.elapsedMs ?? Infinity),
    caseConfigVersion: c.updatedAt ?? null,
    debrief: c.solution,
  };
}
