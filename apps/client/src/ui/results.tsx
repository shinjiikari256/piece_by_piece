import { Link } from "./router";
import type { ResultListItem, ServerResult } from "../../../../shared/api";
import type { Score } from "../../../../shared/scoring";
import type { ResultRecord } from "../state/profile";
import { scorePercent, scoreTone } from "./common";
import { formatDate } from "../util/format";

/** Строка таблицы результатов — из браузера (ResultRecord) или с сервера (ServerResult). */
export interface ResultRow {
  key: string;
  caseId: string;
  number: string;
  title: string;
  total: number;
  max: number;
  hintsUsed: number;
  wrongDeductions: number | null;
  elapsedMs: number | null;
  at: number;
  record: ResultRecord | null;
  /** Чьё прохождение — в таблице преподавателя. */
  user?: { id: number; fullName: string; group: string | null };
}

export const fromLocal = (r: ResultRecord): ResultRow => ({
  key: `local:${r.at}`,
  caseId: r.caseId,
  number: r.number,
  title: r.title,
  total: r.total,
  max: r.max,
  hintsUsed: r.hintsUsed,
  wrongDeductions: r.wrongDeductions ?? null,
  elapsedMs: r.input?.elapsedMs ?? null,
  at: r.at,
  record: r.score ? r : null,
});

/** owner — чьё прохождение (для карточки пользователя, где у строк нет поля user). */
export function fromServer(r: ServerResult | ResultListItem, owner?: { id?: number; fullName: string; group?: string }): ResultRow {
  const who = "user" in r ? { id: r.user.id, fullName: r.user.fullName, group: r.user.group?.name } : owner;
  const at = new Date(r.finishedAt).getTime();
  return {
    key: `server:${r.id}`,
    caseId: r.caseId,
    number: r.caseNumber,
    title: r.caseTitle,
    total: r.total,
    max: r.max,
    hintsUsed: r.hintsUsed,
    wrongDeductions: r.wrongDeductions,
    elapsedMs: r.elapsedMs,
    at,
    user: "user" in r ? { id: r.user.id, fullName: r.user.fullName, group: r.user.group?.name ?? null } : undefined,
    record: {
      caseId: r.caseId,
      number: r.caseNumber,
      title: r.caseTitle,
      total: r.total,
      max: r.max,
      hintsUsed: r.hintsUsed,
      at,
      score: r.score as Score,
      wrongDeductions: r.wrongDeductions,
      input: (r.input ?? undefined) as ResultRecord["input"],
      owner: who,
    },
  };
}

const minutes = (ms: number | null) => (ms == null ? "—" : `${Math.max(1, Math.round(ms / 60_000))} мин`);
const when = (at: number) => formatDate(at, true);
const bonusMax = (r: ResultRow) => r.record?.score?.timeBonus?.max ?? 0;
const percent = (r: ResultRow) => Math.round(scorePercent(r.total, r.max, bonusMax(r)));

export function ResultsTable({ rows, onOpen, showUser }: { rows: ResultRow[]; onOpen: (row: ResultRow) => void; showUser?: boolean }) {
  return (
    <table className="table">
      <thead>
        <tr>
          {showUser && <th>Кто</th>}
          <th>Дело</th>
          <th className="num">Баллы</th>
          <th className="num">Процент</th>
          <th className="num">Подсказки</th>
          <th className="num">Время</th>
          <th>Когда</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr
            key={r.key}
            className={r.record ? "is-link" : ""}
            onClick={() => r.record && onOpen(r)}
            title={r.record ? "Открыть результат и разбор" : undefined}
          >
            {showUser && (
              <td>
                {r.user ? (
                  <>
                    <Link to={`/admin/users/${r.user.id}`} onClick={(e) => e.stopPropagation()}>
                      {r.user.fullName}
                    </Link>
                    {r.user.group && <div className="muted small">{r.user.group}</div>}
                  </>
                ) : (
                  "—"
                )}
              </td>
            )}
            <td>
              <span className="muted">№{r.number}</span> {r.title}
            </td>
            <td className="num">
              <b>{r.total}</b> / {r.max}
            </td>
            <td className="num">
              <span className="score-pill" data-tone={scoreTone(r.total, r.max, bonusMax(r))}>{percent(r)}%</span>
            </td>
            <td className="num">{r.hintsUsed}</td>
            <td className="num">{minutes(r.elapsedMs)}</td>
            <td>{when(r.at)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Пагинация: ‹ 1 … 4 5 6 … 12 › и «показано X–Y из N». */
export function Pager({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total === 0) return null;
  const nums = [...new Set([1, page - 1, page, page + 1, pages].filter((n) => n >= 1 && n <= pages))].sort((a, b) => a - b);
  return (
    <nav className="pager" aria-label="Страницы">
      <span className="muted small">
        {(page - 1) * pageSize + 1}–{Math.min(total, page * pageSize)} из {total}
      </span>
      {pages > 1 && (
        <span className="pager__pages">
          <button className="pager__btn" disabled={page === 1} onClick={() => onPage(page - 1)} aria-label="Предыдущая">
            ‹
          </button>
          {nums.map((n, i) => (
            <span key={n}>
              {i > 0 && n - nums[i - 1] > 1 && <span className="pager__gap">…</span>}
              <button className="pager__btn" onClick={() => onPage(n)} aria-current={n === page ? "page" : undefined}>
                {n}
              </button>
            </span>
          ))}
          <button className="pager__btn" disabled={page === pages} onClick={() => onPage(page + 1)} aria-label="Следующая">
            ›
          </button>
        </span>
      )}
    </nav>
  );
}
