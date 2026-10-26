import { Suspense, lazy, useEffect, useState } from "react";
import { Link } from "../lib/router";
import type { ResultsStats } from "../../../../../shared/api";
import { resultsStats } from "../../../../../shared/results-stats";
import { isStaff, useAccount } from "../../state/account";
import { platform } from "../../state/platform";
import type { ResultRecord } from "../../state/result-record";
import { usePlatformValue } from "../../state/platform-hooks";
import { Select } from "../kit/Select";
import { ask, tell } from "../kit/dialog";
import { Icon } from "../kit/icons";
import { Pager, ResultsTable, fromLocal, type ResultRow } from "../components/results";
import { openResult } from "./screens";
import { TabbedModal } from "../components/common";
import { Loader } from "../kit/loader";
import { OFFLINE } from "../../env";

/** Результаты с сервера — отдельным куском; в офлайн-файле его нет вовсе. */
const ServerResults = OFFLINE ? null : lazy(() => import("../components/results-server").then((m) => ({ default: m.ServerResults })));

/**
 * «Результаты»: прохождения с фильтрами (дело, группа, пользователь) и пагинацией, «Статистика» по выборке.
 * Студент — только свои (фильтр по делу); без сервера — результаты из этого браузера.
 */

export const PAGE_SIZE = 20;

export interface Filters {
  case: string;
  group: string;
  user: string;
  /** Id мероприятия или `none` (свободная игра). */
  event: string;
}
export const NO_FILTERS: Filters = { case: "", group: "", user: "", event: "" };

export const query = (f: Filters, extra: Record<string, string | number> = {}) => {
  const p = new URLSearchParams();
  if (f.case) p.set("case", f.case);
  if (f.group) p.set("group", f.group);
  if (f.user) p.set("user", f.user);
  if (f.event) p.set("event", f.event);
  for (const [k, v] of Object.entries(extra)) p.set(k, String(v));
  return p.toString();
};

export const open = (r: ResultRow) => void openResult(r.caseId, r.record!).catch(() => tell({ title: "Не удалось открыть результат", text: "Этого дела больше нет в списке." }));

export function ResultsPage() {
  const server = useAccount((s) => s.server);
  const me = useAccount((s) => s.me);
  if (server === "unknown") return null;
  if (server === "online" && me && ServerResults)
    return (
      <Suspense fallback={<Loader label="Загружаем результаты…" />}>
        <ServerResults staff={isStaff(me)} />
      </Suspense>
    );
  return <LocalResults online={server === "online"} />;
}

function LocalResults({ online }: { online: boolean }) {
  const [caseId, setCaseId] = useState("");
  const [page, setPage] = useState(1);
  const [stats, setStats] = useState(false);
  const [all, reload] = usePlatformValue(() => platform().results.list(), [] as ResultRecord[]);
  const cases = [...new Map(all.map((r) => [r.caseId, r])).values()];
  const filtered = all.filter((r) => !caseId || r.caseId === caseId);
  const rows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map(fromLocal);

  return (
    <div className="page">
      <header className="page__head">
        <h1>Мои результаты</h1>
        <span className="toolbar toolbar--inline">
          {all.length > 0 && (
            <button
              className="linkbtn"
              onClick={async () => {
                if (!(await ask({ title: "Очистить историю результатов?", text: "Результаты пропадут из этого браузера.", confirmLabel: "Очистить", danger: true }))) return;
                await platform().results.clear();
                reload();
              }}
            >
              Очистить историю
            </button>
          )}
          <button className="btn" onClick={() => setStats(true)} disabled={!filtered.length}>
            <Icon name="scale" size={16} /> Статистика
          </button>
        </span>
      </header>
      <p className="muted">
        Результаты хранятся только в этом браузере.
        {online && (
          <>
            {" "}
            <Link to="/login">Войдите</Link>, чтобы они сохранялись в учётной записи и были видны преподавателю.
          </>
        )}
      </p>
      {cases.length > 1 && (
        <div className="toolbar">
          <Select
            value={caseId}
            placeholder="Все дела"
            onChange={(v) => {
              setCaseId(v);
              setPage(1);
            }}
            options={[{ value: "", label: "Все дела" }, ...cases.map((c) => ({ value: c.caseId, label: `№${c.number} «${c.title}»` }))]}
          />
        </div>
      )}
      {filtered.length === 0 ? (
        <EmptyResults filtered={false} />
      ) : (
        <div className="card card--flush">
          <ResultsTable rows={rows} onOpen={open} />
        </div>
      )}
      <Pager page={page} pageSize={PAGE_SIZE} total={filtered.length} onPage={setPage} />
      {stats && (
        <StatsModal
          source={async () =>
            resultsStats(
              filtered.map((r) => ({
                userId: "me",
                caseId: r.caseId,
                total: r.total,
                max: r.max,
                hintsUsed: r.hintsUsed,
                wrongDeductions: r.wrongDeductions ?? 0,
                elapsedMs: r.input?.elapsedMs ?? null,
                score: r.score ?? null,
              })),
            )
          }
          onClose={() => setStats(false)}
        />
      )}
    </div>
  );
}

export function EmptyResults({ filtered }: { filtered: boolean }) {
  return (
    <div className="card empty-state">
      <p>{filtered ? "По этим фильтрам прохождений нет." : "Завершённых дел пока нет."}</p>
      {!filtered && (
        <Link className="btn btn--primary" to="/cases">
          Выбрать дело
        </Link>
      )}
    </div>
  );
}

// ---------- Статистика ----------

export function StatsModal({ source, onClose }: { source: () => Promise<ResultsStats>; onClose: () => void }) {
  const [s, setS] = useState<ResultsStats | null>(null);
  useEffect(() => void source().then(setS, () => setS(null)), []); // eslint-disable-line react-hooks/exhaustive-deps -- статистику грузим один раз при открытии окна
  const n = (v: number | null, unit = "") => (v == null ? "—" : `${v}${unit}`);
  return (
    <TabbedModal tabs={[{ id: "stats", label: "Статистика по выборке", icon: "evidence" }]} onClose={onClose}>
      {!s ? (
        <Loader />
      ) : (
        <div className="analytics">
          <div className="stats">
            <Tile label="Прохождений" value={String(s.attempts)} />
            <Tile label="Участников" value={String(s.users)} />
            <Tile label="Дел" value={String(s.cases)} />
            <Tile label="Средний результат" value={n(s.avgPercent, "%")} />
            <Tile label="Медиана" value={n(s.medianPercent, "%")} />
            <Tile label="Время в среднем" value={s.avgMinutes == null ? "—" : s.avgMinutes < 1 ? "< 1 мин" : `${Math.round(s.avgMinutes)} мин`} />
            <Tile label="Подсказок в среднем" value={n(s.avgHints)} />
            <Tile label="Ошибок сопоставлений" value={n(s.avgWrongDeductions)} />
            <Tile label="Получили бонус за время" value={n(s.bonusShare, "%")} />
          </div>
          <div className="analytics__charts">
            <Bars title="Распределение результатов" items={s.buckets.map((b) => ({ label: b.label, value: b.count }))} unit="" />
            <Bars title="Средний результат по разделам решения" items={s.sections.map((x) => ({ label: x.label, value: x.percent }))} unit="%" max={100} />
            <Bars title="Сколько подсказок брали" items={s.hints.map((h) => ({ label: h.label, value: h.count }))} unit="" />
          </div>
          <p className="muted small">Процент — от максимума без бонуса за время, поэтому может быть больше 100.</p>
        </div>
      )}
    </TabbedModal>
  );
}

const Tile = ({ label, value }: { label: string; value: string }) => (
  <div className="stat">
    <div className="stat__value">{value}</div>
    <div className="stat__label">{label}</div>
  </div>
);

function Bars({ title, items, unit, max }: { title: string; items: { label: string; value: number }[]; unit: string; max?: number }) {
  const top = max ?? Math.max(1, ...items.map((i) => i.value));
  return (
    <section className="bars">
      <h3>{title}</h3>
      {items.length === 0 && <p className="muted small">Нет данных.</p>}
      {items.map((i) => (
        <div key={i.label} className="bars__row">
          <span className="bars__label">{i.label}</span>
          <span className="bars__track">
            <span className="bars__fill" style={{ width: `${Math.min(100, (i.value / top) * 100)}%` }} />
          </span>
          <span className="bars__value">
            {i.value}
            {unit}
          </span>
        </div>
      ))}
    </section>
  );
}
