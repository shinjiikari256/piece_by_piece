import type { CaseFile, Effect } from "../../../../../shared/case";

export type CounterRow = { counterId: string; min?: number; max?: number };
export type EnumRow = { enumId: string; in?: string[]; notIn?: string[] };

/** Что делать с найденным: вернуть новое значение или `null` (убрать). Обход сам не знает, где что лежит. */
export interface VariableHooks {
  /** Эффект «изменить переменную» (с любой вложенностью — хоть в `requires` другого эффекта). */
  effect?: (e: Effect) => Effect | null;
  /** Ключ флага в `flags` / `notFlags` условия. */
  flag?: (id: string) => string | null;
  /** Строка условия по счётчику. */
  counter?: (r: CounterRow) => CounterRow | null;
  /** Строка условия по перечислению. */
  enumRow?: (r: EnumRow) => EnumRow | null;
}

const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x);
const isEmptyObj = (x: unknown) => isObj(x) && !Object.keys(x).length;
const hasKey = (k: string) => (r: unknown) => isObj(r) && k in r;

/**
 * Единый рекурсивный обход любой части дела: сам находит эффекты «изменить переменную» и строки условий
 * (`flags`, `notFlags`, `counters`, `enums`) на любой глубине, поэтому новое место с условием или эффектом подхватывается без правок.
 * Опустевшие списки, условия `requires` и альтернативы `anyOf` / `allOf` исчезают.
 */
export function walkVariables<T>(node: T, hooks: VariableHooks): T {
  return walk(node, hooks) as T;
}

function walkList(key: string | undefined, list: unknown[], hooks: VariableHooks): unknown[] {
  const strings = list.length > 0 && list.every((x) => typeof x === "string");
  if (hooks.flag && strings && (key === "flags" || key === "notFlags")) return list.map((x) => hooks.flag!(x as string)).filter((x) => x !== null);
  if (hooks.counter && key === "counters" && list.length > 0 && list.every(hasKey("counterId"))) return list.map((r) => hooks.counter!(r as CounterRow)).filter((x) => x !== null);
  if (hooks.enumRow && key === "enums" && list.length > 0 && list.every(hasKey("enumId"))) return list.map((r) => hooks.enumRow!(r as EnumRow)).filter((x) => x !== null);
  const out: unknown[] = [];
  for (const x of list) {
    if (hooks.effect && isObj(x) && x.type === "changeVariable") {
      const next = hooks.effect(x as Effect);
      if (next) out.push(walk(next, hooks));
    } else out.push(walk(x, hooks));
  }
  return key === "anyOf" || key === "allOf" ? out.filter((x) => !isEmptyObj(x)) : out;
}

function walk(node: unknown, hooks: VariableHooks, key?: string): unknown {
  if (Array.isArray(node)) return walkList(key, node, hooks);
  if (!isObj(node)) return node;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(node)) {
    const next = walk(v, hooks, k);
    const emptied = Array.isArray(v) && v.length > 0 && Array.isArray(next) && !next.length;
    // условие, из которого убрали всё, исчезает целиком
    if (emptied && ["flags", "notFlags", "counters", "enums", "anyOf", "allOf"].includes(k)) continue;
    if (k === "requires" && isEmptyObj(next) && !isEmptyObj(v)) continue;
    out[k] = next;
  }
  return out;
}

/**
 * Убрать переменную (флаг, счётчик или перечисление) из дела целиком: запись в списке, эффекты по ней и упоминания в условиях.
 * Ключи флагов, счётчиков и перечислений не пересекаются, поэтому достаточно ключа.
 */
export function deleteVariable(d: CaseFile, id: string): CaseFile {
  const { flags, counters, enums, ...rest } = d;
  const cleaned = walkVariables(rest, {
    effect: (e) => (e.type === "changeVariable" && e.variableId === id ? null : e),
    flag: (f) => (f === id ? null : f),
    counter: (r) => (r.counterId === id ? null : r),
    enumRow: (r) => (r.enumId === id ? null : r),
  });
  const keep = <X extends { id: string }>(list: X[] | undefined) => list?.filter((x) => x.id !== id);
  const out: Record<string, unknown> = { ...cleaned };
  for (const [k, list] of [["flags", flags], ["counters", counters], ["enums", enums]] as const) {
    const left = keep(list as { id: string }[] | undefined);
    if (left?.length) out[k] = left;
  }
  return out as unknown as CaseFile;
}
