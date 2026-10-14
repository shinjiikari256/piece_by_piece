import type { CaseFile } from "../../../../shared/case";
import { toPublicCase, type PublicCase } from "../../../../shared/public-case";
import * as judge from "../../../../shared/judge";
import type { CaseAuthority, FinishInput } from "../../../../shared/judge";

/** Судья в браузере: полное дело лежит рядом (офлайн-сборка, черновики, тестовый запуск из конструктора). */
export class LocalAuthority implements CaseAuthority {
  readonly caseFile: PublicCase;

  constructor(private readonly full: CaseFile) {
    this.caseFile = toPublicCase(full);
  }

  async checkDeduction(deductionId: string, optionId: string) {
    const verdict = judge.checkDeduction(this.full, deductionId, optionId);
    if (!verdict) throw new Error(`Нет варианта ${optionId} в сопоставлении ${deductionId}`);
    return verdict;
  }

  async revealHint(level: number) {
    const hint = judge.revealHint(this.full, level);
    if (!hint) throw new Error(`Нет подсказки уровня ${level}`);
    return hint;
  }

  async restore(deductionIds: string[], hintsUsed: number) {
    return judge.revealed(this.full, deductionIds, hintsUsed);
  }

  async finish(input: FinishInput) {
    return judge.finish(this.full, input);
  }

  async debrief() {
    return this.full.solution;
  }
}
