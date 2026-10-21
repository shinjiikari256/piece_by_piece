import type { ServerPublicCase } from "../../../../shared/api";
import type { PublicCase } from "../../../../shared/public-case";
import type { Solution } from "../../../../shared/case";
import type { CaseAuthority, CaseResult, DeductionVerdict, FinishInput, Revealed, RevealedHint } from "../../../../shared/judge";
import { GAME_VERSION } from "../env";
import { api } from "../state/account";

/**
 * Судья на сервере: ответов в браузере нет, проверку, подсказки и итог даёт API.
 * Все запросы закреплены за версией дела (`?v=`), с которой прохождение началось.
 */
export class ApiAuthority implements CaseAuthority {
  private constructor(
    readonly caseFile: PublicCase,
    private readonly caseVersionId: number,
  ) {}

  static async open(caseId: string): Promise<ApiAuthority> {
    const res = await api<ServerPublicCase>("GET", `/cases/${encodeURIComponent(caseId)}`);
    return new ApiAuthority(res.caseFile, res.caseVersionId);
  }

  private path(suffix: string) {
    return `/cases/${encodeURIComponent(this.caseFile.id)}${suffix}?v=${this.caseVersionId}`;
  }

  checkDeduction(deductionId: string, optionId: string) {
    return api<DeductionVerdict>("POST", this.path(`/deductions/${encodeURIComponent(deductionId)}/check`), { optionId });
  }

  revealHint(level: number) {
    return api<RevealedHint>("POST", this.path(`/hints/${level}`));
  }

  restore(deductionIds: string[], hintsUsed: number) {
    return api<Revealed>("POST", this.path("/restore"), { deductionIds, hintsUsed });
  }

  async finish(input: FinishInput): Promise<CaseResult> {
    const res = await api<CaseResult>("POST", this.path("/finish"), {
      ...input,
      elapsedMs: input.elapsedMs == null ? null : Math.round(input.elapsedMs),
      gameVersion: GAME_VERSION,
    });
    return { score: res.score, caseConfigVersion: res.caseConfigVersion, debrief: res.debrief, recordedOnServer: true };
  }

  debrief() {
    return api<Solution | null>("GET", this.path("/debrief"));
  }
}
