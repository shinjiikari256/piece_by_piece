import { useEffect, useState } from "react";
import type { ResultsFilters, ResultsPage as ResultsPageData, ResultsStats } from "../../../../../shared/api";
import { api } from "../../state/api";
import { Select } from "../kit/Select";
import { Icon } from "../kit/icons";
import { ask, tell } from "../kit/dialog";
import { Pager, ResultsTable, fromServer, type RowSelection } from "./results";
import { ResultsImport } from "./results-import";
import { EmptyResults, NO_FILTERS, PAGE_SIZE, StatsModal, open, query, type Filters } from "../pages/results-page";

/** «Результаты» с сервера: вошедший видит свои (студент) или все с фильтрами (преподаватель, админ). Только онлайн-сборка. */
export function ServerResults({ staff, eventId }: { staff: boolean; eventId?: number }) {
  // внутри мероприятия оно зафиксировано: фильтр не показывается и не сбрасывается
  const base: Filters = eventId === undefined ? NO_FILTERS : { ...NO_FILTERS, event: String(eventId) };
  const [filters, setFilters] = useState<Filters>(base);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ResultsPageData | null>(null);
  const [options, setOptions] = useState<ResultsFilters | null>(null);
  const [stats, setStats] = useState(false);
  const [importing, setImporting] = useState(false);
  const [reload, setReload] = useState(0);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());

  useEffect(() => void api<ResultsFilters>("GET", "/results/filters").then(setOptions, () => setOptions(null)), []);
  useEffect(() => {
    api<ResultsPageData>("GET", `/results?${query(filters, { page, pageSize: PAGE_SIZE })}`).then(setData, () => setData(null));
  }, [filters, page, reload]);

  // выбор живёт в пределах страницы и фильтра
  useEffect(() => setSelected(new Set()), [filters, page, reload]);

  const selection: RowSelection = {
    selected,
    toggle: (key) => setSelected((s) => (s.has(key) ? new Set([...s].filter((k) => k !== key)) : new Set([...s, key]))),
    toggleAll: (on) => setSelected(on ? new Set(data?.items.map((r) => `server:${r.id}`)) : new Set()),
  };
  const remove = async () => {
    const ids = [...selected].map((k) => Number(k.slice("server:".length)));
    if (!(await ask({ title: `Удалить результаты (${ids.length})?`, text: "Прохождения исчезнут из списков и статистики, а зачётная попытка мероприятия освободится. Отменить нельзя.", confirmLabel: "Удалить", danger: true }))) return;
    try {
      await api("POST", "/results/delete", { ids });
      setReload((n) => n + 1);
    } catch (e) {
      void tell({ title: "Не удалось удалить", text: e instanceof Error ? e.message : "Ошибка" });
    }
  };

  const set = (patch: Partial<Filters>) => {
    setFilters((f) => ({ ...f, ...patch }));
    setPage(1);
  };
  const filtered = Object.entries(filters).some(([k, v]) => v && !(eventId !== undefined && k === "event"));
  const rows = data?.items.map((r) => fromServer(r)) ?? [];

  return (
    <div className={eventId === undefined ? "page page--wide" : "stack"}>
      <header className="page__head">
        {eventId === undefined ? <h1>{staff ? "Результаты" : "Мои результаты"}</h1> : <h2>Прохождения</h2>}
        <div className="row page__tools">
          <button className="btn" onClick={() => setStats(true)} disabled={!data?.total}>
            <Icon name="scale" size={16} /> Статистика
          </button>
          {staff && (
            <a className="btn" href={`/api/results/export.csv?${query(filters)}`} download="results.csv">
              Выгрузить CSV
            </a>
          )}
          {staff && selected.size > 0 && (
            <button className="btn btn--danger" onClick={() => void remove()}>
              Удалить выбранные ({selected.size})
            </button>
          )}
          {staff && (
            <button className="btn" aria-pressed={importing} onClick={() => setImporting((v) => !v)}>
              Импорт файлов
            </button>
          )}
        </div>
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
        {eventId === undefined && (options?.events.length ?? 0) > 0 && (
          <Select
            value={filters.event}
            placeholder="Все мероприятия"
            onChange={(v) => set({ event: v })}
            options={[{ value: "", label: "Все мероприятия" }, { value: "none", label: "Без мероприятия" }, ...(options?.events ?? []).map((e) => ({ value: String(e.id), label: e.title }))]}
          />
        )}
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
          <button className="linkbtn" onClick={() => set(base)}>
            Сбросить фильтры
          </button>
        )}
      </div>
      {data && data.total === 0 ? (
        <EmptyResults filtered={filtered} />
      ) : (
        <div className="card card--flush">
          <ResultsTable rows={rows} onOpen={open} showUser={staff} selection={staff ? selection : undefined} />
        </div>
      )}
      {data && <Pager page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />}
      {stats && <StatsModal source={() => api<ResultsStats>("GET", `/results/stats?${query(filters)}`)} onClose={() => setStats(false)} />}
    </div>
  );
}
