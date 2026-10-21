import type { CaseFile } from "../../../../shared/case";
import { validateCase } from "./validate";
import { listDraftIds, readDraft } from "./drafts";
import { LocalAuthority } from "./local-authority";
import type { CaseAuthority } from "../../../../shared/judge";
import { OFFLINE, embeddedCases } from "../env";
import type { ServerCaseSummary } from "../../../../shared/api";
import { accountStore, api } from "../state/account";
import { ApiAuthority } from "./api-authority";

/** Вошедший игрок берёт дела и проверку с сервера; гость и офлайн-файл играют на делах из сборки. */
const fromServer = () => !OFFLINE && accountStore.get().server === "online" && !!accountStore.get().me;

export interface CaseSummary {
  id: string;
  number: string;
  title: string;
  tagline: string;
  difficulty: CaseFile["difficulty"];
  published: boolean;
  timeBonus?: CaseFile["timeBonus"];
  evidenceCount: number;
  deductionCount: number;
  /** Черновик из конструктора (localStorage), а не дело из сборки. */
  isDraft: boolean;
  updatedAt?: string;
  meta?: CaseFile["meta"];
}

/**
 * Источник дел. Сейчас — JSON из бандла; чтобы перейти на API,
 * достаточно ещё одной реализации этого интерфейса (fetch + validateCase).
 */
export interface CaseRepository {
  list(): Promise<CaseSummary[]>;
  /** Прохождение дела: игра видит дело без ответов, ответы проверяет судья. */
  open(id: string, eventId?: number): Promise<CaseAuthority>;
}

const summarize = (c: CaseFile, isDraft = false): CaseSummary => ({
  isDraft,
  id: c.id,
  number: c.number,
  title: c.title,
  tagline: c.tagline,
  difficulty: c.difficulty,
  published: c.published,
  timeBonus: c.timeBonus,
  evidenceCount: c.evidence.length,
  deductionCount: c.deductions.length,
  updatedAt: c.updatedAt,
  meta: c.meta,
});

class BundledCaseRepository implements CaseRepository {
  private cases = new Map<string, CaseFile>();

  constructor(modules: Record<string, unknown>) {
    for (const [path, raw] of Object.entries(modules)) {
      const result = validateCase(raw);
      if (result.ok) this.cases.set(result.caseFile.id, result.caseFile);
      else console.error(`Сценарий ${path} пропущен:\n  ${result.errors.join("\n  ")}`);
    }
  }

  /** Черновики конструктора: только корректные, id не должен совпадать с делом из сборки. */
  private drafts() {
    const drafts = new Map<string, CaseFile>();
    if (OFFLINE) return drafts;
    for (const id of listDraftIds()) {
      const result = validateCase(readDraft(id));
      if (result.ok && !this.cases.has(result.caseFile.id)) drafts.set(result.caseFile.id, result.caseFile);
    }
    return drafts;
  }

  async list() {
    const server = fromServer() ? await api<ServerCaseSummary[]>("GET", "/cases").catch(() => null) : null;
    if (server) {
      const ids = new Set(server.map((c) => c.id));
      const drafts = [...this.drafts().values()].filter((c) => !ids.has(c.id)).map((c) => summarize(c, true));
      return [...server.map((c) => ({ ...c, isDraft: false })), ...drafts].sort((a, b) => a.id.localeCompare(b.id));
    }
    // скрытые дела (published: false) игрокам не показываем; открыть их можно из конструктора
    const bundled = [...this.cases.values()].filter((c) => c.published).map((c) => summarize(c));
    const drafts = [...this.drafts().values()].map((c) => summarize(c, true));
    return [...bundled, ...drafts].sort((a, b) => a.id.localeCompare(b.id));
  }

  async open(id: string, eventId?: number): Promise<CaseAuthority> {
    if (fromServer() && !this.drafts().has(id)) return ApiAuthority.open(id, eventId);
    return new LocalAuthority(await this.get(id));
  }

  /** Черновик из конструктора, даже если в сборке есть дело с тем же id (кнопка «Запустить»). */
  async getDraft(id: string) {
    const result = validateCase(readDraft(id));
    if (!result.ok) throw new Error(`Черновик ${id} не найден или содержит ошибки`);
    return result.caseFile;
  }

  /** Полное дело, с ответами, — только для конструктора и судьи. */
  async get(id: string) {
    const c = this.cases.get(id) ?? this.drafts().get(id);
    if (!c) throw new Error(`Дело ${id} не найдено`);
    return c;
  }

  /** Все дела из сборки — для конструктора («открыть существующее»). */
  bundled(): CaseFile[] {
    return [...this.cases.values()];
  }
}

/** Дела сборки: в офлайн-файле — вшитые при экспорте, иначе — JSON из src/content/cases. */
function bundledSources(): Record<string, unknown> {
  if (OFFLINE) return Object.fromEntries((embeddedCases()?.cases ?? []).map((c, i) => [`embedded #${i + 1}`, c]));
  const cases = import.meta.glob("./cases/*.json", { eager: true, import: "default" });
  // тестовые дела для разработки (`content/test-cases`): в сборку не попадают
  const devMode = import.meta.env.MODE === "development" || import.meta.env.MODE === "test"; // не DEV: при NODE_ENV=production в оболочке он ложен и в dev-сервере
  const tests = devMode ? import.meta.glob("./test-cases/*.json", { eager: true, import: "default" }) : {};
  return { ...cases, ...tests };
}

export const caseRepository = new BundledCaseRepository(bundledSources());
