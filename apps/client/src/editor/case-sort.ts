import type { SelectOption } from "../ui/kit/Select";

export type CaseSort = "updated" | "created" | "number" | "title";

export const CASE_SORTS: SelectOption[] = [
  { value: "updated", label: "По обновлению" },
  { value: "created", label: "По созданию" },
  { value: "number", label: "По номеру" },
  { value: "title", label: "По названию" },
];

export interface Sortable {
  number: string | number;
  title: string;
  updatedAt?: string;
  /** Нет у черновиков и встроенных дел: тогда берётся дата обновления. */
  createdAt?: string;
}

const time = (s?: string) => (s ? Date.parse(s) || 0 : 0);

/** Новые даты сверху; номера и названия — по возрастанию. */
export function sortCases<T extends Sortable>(list: T[], by: CaseSort): T[] {
  const cmp: Record<CaseSort, (a: T, b: T) => number> = {
    updated: (a, b) => time(b.updatedAt) - time(a.updatedAt),
    created: (a, b) => time(b.createdAt ?? b.updatedAt) - time(a.createdAt ?? a.updatedAt),
    number: (a, b) => String(a.number).localeCompare(String(b.number), "ru", { numeric: true }),
    title: (a, b) => a.title.localeCompare(b.title, "ru"),
  };
  return [...list].sort((a, b) => cmp[by](a, b) || String(a.number).localeCompare(String(b.number), "ru", { numeric: true }));
}

/** Поиск по названию и номеру, без учёта регистра. */
export function filterCases<T extends Sortable>(list: T[], query: string): T[] {
  const q = query.trim().toLowerCase();
  return q ? list.filter((c) => c.title.toLowerCase().includes(q) || String(c.number).toLowerCase().includes(q)) : list;
}
