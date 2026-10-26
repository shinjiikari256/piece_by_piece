import type { ServerAttempt, ServerCaseSummary } from "../../../../shared/api";
import type { PublicCase } from "../../../../shared/public-case";
import type { Solution } from "../../../../shared/case";
import type { CaseAuthority, CaseResult, DeductionVerdict, FinishInput, Revealed, RevealedHint } from "../../../../shared/judge";
import { GAME_VERSION } from "../env";
import { api } from "../state/api";

/**
 * Судья на сервере: ответов в браузере нет, проверку, подсказки, время и итог даёт API.
 * Каждое прохождение — попытка на сервере: подсказки, ошибки и время считает она, а не клиент.
 */
/** Дела, которые сервер показывает вошедшему игроку; нет связи — null (тогда список из сборки). */
export const serverCases = () => api<ServerCaseSummary[]>("GET", "/cases").catch(() => null);

/** Дела с доступом для гостей; нет связи — null. */
export const publicCases = () => api<ServerCaseSummary[]>("GET", "/public/cases").catch(() => null);

export class ApiAuthority implements CaseAuthority {
  private constructor(
    readonly caseFile: PublicCase,
    private id: string,
    private started: boolean,
    readonly eventId?: number,
  ) {}

  /** Открыть дело: вернуться к начатой попытке или создать новую (`fresh` — закрыть начатую). */
  static async open(caseId: string, eventId?: number): Promise<ApiAuthority> {
    const a = await api<ServerAttempt>("POST", `/cases/${encodeURIComponent(caseId)}/attempts`, { eventId });
    return new ApiAuthority(a.caseFile, a.attemptId, a.started, eventId);
  }

  get attemptId() {
    return this.id;
  }

  private path(suffix: string) {
    return `/attempts/${this.id}${suffix}`;
  }

  checkDeduction(deductionId: string, optionId: string) {
    return api<DeductionVerdict>("POST", this.path(`/deductions/${encodeURIComponent(deductionId)}/check`), { optionId });
  }

  revealHint(level: number) {
    return api<RevealedHint>("POST", this.path(`/hints/${level}`));
  }

  /** Что узнано, решает сервер по журналу попытки; сохранению игрока он не верит. */
  restore(_deductionIds: string[], _hintsUsed: number) {
    return api<Revealed>("GET", this.path("/revealed"));
  }

  async begin() {
    // вторая попытка с «Начать» (например, после провала дела) — новое прохождение
    if (this.started) await this.discard();
    await api("POST", this.path("/start"), {});
    this.started = true;
  }

  async pause() {
    if (this.started) await api("POST", this.path("/pause"), {});
  }

  async discard() {
    if (!this.started) return;
    const a = await api<ServerAttempt>("POST", `/cases/${encodeURIComponent(this.caseFile.id)}/attempts`, { fresh: true, eventId: this.eventId });
    this.id = a.attemptId;
    this.started = false;
  }

  /** Сервер сам записывает результат (`source: "server"`) — клиент его не отправляет. Время, подсказки и ошибки берёт из попытки. */
  async finish(input: FinishInput): Promise<CaseResult> {
    const res = await api<CaseResult>("POST", this.path("/finish"), {
      answers: input.answers,
      importantEvidence: input.importantEvidence,
      gameVersion: GAME_VERSION,
    });
    return { score: res.score, caseConfigVersion: res.caseConfigVersion, debrief: res.debrief };
  }

  debrief() {
    return api<Solution | null>("GET", `/cases/${encodeURIComponent(this.caseFile.id)}/debrief`);
  }
}
