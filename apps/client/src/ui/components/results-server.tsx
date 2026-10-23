import { useEffect, useState } from "react";
import type { ResultsFilters, ResultsPage as ResultsPageData, ResultsStats } from "../../../../../shared/api";
import { api } from "../../state/api";
import { Select } from "../kit/Select";
import { Icon } from "../kit/icons";
import { Pager, ResultsTable, fromServer } from "./results";
import { ResultsImport } from "./results-import";
import { EmptyResults, NO_FILTERS, PAGE_SIZE, StatsModal, open, query, type Filters } from "../pages/results-page";

/** «Результаты» с сервера: вошедший видит свои (студент) или все с фильтрами (преподаватель, админ). Только онлайн-сборка. */
export function ServerResults({ staff }: { staff: boolean }) {
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ResultsPageData | null>(null);
  const [options, setOptions] = useState<ResultsFilters | null>(null);
  const [stats, setStats] = useState(false);
  const [importing, setImporting] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => void api<ResultsFilters>("GET", "/results/filters").then(setOptions, () => setOptions(null)), []);
  useEffect(() => {
    api<ResultsPageData>("GET", `/results?${query(filters, { page, pageSize: PAGE_SIZE })}`).then(setData, () => setData(null));
  }, [filters, page, reload]);

  const set = (patch: Partial<Filters>) => {
    setFilters((f) => ({ ...f, ...patch }));
    setPage(1);
  };
  const filtered = Object.values(filters).some(Boolean);
  const rows = data?.items.map((r) => fromServer(r)) ?? [];

  return (
    <div className="page page--wide">
      <header className="page__head">
        <h1>{staff ? "Результаты" : "Мои результаты"}</h1>
        <button className="btn" onClick={() => setStats(true)} disabled={!data?.total}>
          <Icon name="scale" size={16} /> Статистика
        </button>
        {staff && (
          <a className="btn" href={`/api/results/export.csv?${query(filters)}`} download="results.csv">
            Выгрузить CSV
          </a>
        )}
        {staff && (
          <button className="btn" aria-pressed={importing} onClick={() => setImporting((v) => !v)}>
            Импорт файлов
          </button>
        )}
      </header>
      {staff && importing && (
        <ResultsImport students={(options?.users ?? []).map((u) => ({ id: u.id, label: `${u.fullName}${u.group ? ` · ${u.group}` : ""}` }))} onDone={() => setReload((n) => n + 1)} />
      )}
      <div className="toolbar">
        <Select
          value={filters.case}
          placeholder="Все дела"
          onChange={(v) => set({ case: v })}
          options={[{ value: "", label: "Все дела" }, ...(options?.cases ?? []).map((c) => ({ value: c.id, label: `№${c.number} «${c.title}»` }))]}
        />
        {staff && (
          <>
            <Select
              value={filters.group}
              placeholder="Все группы"
              onChange={(v) => set({ group: v })}
              options={[{ value: "", label: "Все группы" }, ...(options?.groups ?? []).map((g) => ({ value: String(g.id), label: g.name })), { value: "none", label: "Без группы" }]}
            />
            <Select
              value={filters.user}
              placeholder="Все пользователи"
              onChange={(v) => set({ user: v })}
              options={[
                { value: "me", label: "Мои" },
                { value: "", label: "Все пользователи" },
                ...(options?.users ?? []).map((u) => ({ value: String(u.id), label: u.group ? `${u.fullName} · ${u.group}` : u.fullName })),
              ]}
            />
          </>
        )}
        {filtered && (
          <button className="linkbtn" onClick={() => set(NO_FILTERS)}>
            Сбросить фильтры
          </button>
        )}
      </div>
      {data && data.total === 0 ? (
        <EmptyResults filtered={filtered} />
      ) : (
        <div className="card card--flush">
          <ResultsTable rows={rows} onOpen={open} showUser={staff} />
        </div>
      )}
      {data && <Pager page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />}
      {stats && <StatsModal source={() => api<ResultsStats>("GET", `/results/stats?${query(filters)}`)} onClose={() => setStats(false)} />}
    </div>
  );
}
