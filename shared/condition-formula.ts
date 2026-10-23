import type { Condition } from "./case";

/**
 * Формула над строками условия. Автор видит пронумерованные строки и вводит связку (`1 && (2 || 3)`),
 * а в деле лежит обычное условие: строки узла (все сразу) ∧ `allOf` ∧ `anyOf`. Номера существуют только здесь:
 * после любой правки они пересчитываются по порядку чтения формулы.
 *
 * Ограничения: без отрицания группы (отрицания есть у самих строк: «флагов нет», «улик нет» …) и без повторов номеров —
 * каждая строка входит в формулу ровно один раз. Этого хватает для любой формулы «и / или», где строки не повторяются.
 */

/** Строки условия, каждая со своим ключом (одна строка на ключ в узле), в порядке показа. */
export const LIST_KEYS = ["evidence", "notEvidence", "flags", "notFlags", "deductions", "notDeductions", "following", "notFollowing", "inLocation", "notInLocation"] as const;
export type ListKey = (typeof LIST_KEYS)[number];
/** Строки-списки записей: каждая запись — отдельная строка. */
export const ARRAY_KEYS = ["counters", "enums", "chosen"] as const;
export type ArrayKey = (typeof ARRAY_KEYS)[number];

export type Ast = { t: "atom"; n: number } | { t: "and"; args: Ast[] } | { t: "or"; args: Ast[] };

/** `atoms` — строки по номерам (номер = позиция + 1), каждая — условие из одной строки; `ast` — связка (`null` — условия нет). */
export interface ConditionModel {
  atoms: Condition[];
  ast: Ast | null;
}

const atom = (n: number): Ast => ({ t: "atom", n });

/** «И» из частей: вложенные «и» раскрываются, одна часть — она сама, ни одной — `null`. */
function and(parts: (Ast | null)[]): Ast | null {
  const args = parts.flatMap((p) => (p === null ? [] : p.t === "and" ? p.args : [p]));
  return args.length === 0 ? null : args.length === 1 ? args[0] : { t: "and", args };
}
function or(parts: Ast[]): Ast {
  const args = parts.flatMap((p) => (p.t === "or" ? p.args : [p]));
  return args.length === 1 ? args[0] : { t: "or", args };
}

/** Строки одного узла как отдельные однострочные условия, в каноническом порядке. */
function rowsOf(c: Condition): Condition[] {
  const out: Condition[] = [];
  for (const k of LIST_KEYS) if (c[k] !== undefined) out.push({ [k]: c[k] });
  for (const k of ARRAY_KEYS) for (const item of c[k] ?? []) out.push({ [k]: [item] } as Condition);
  return out;
}

/** Условие из дела → строки с номерами и связка. Пустая «или»-альтернатива означает «всегда верно», поэтому такая группа «или» выпадает. */
export function conditionToModel(c: Condition | undefined): ConditionModel {
  const atoms: Condition[] = [];
  const visit = (node: Condition): Ast | null => {
    const parts: (Ast | null)[] = [];
    for (const row of rowsOf(node)) {
      atoms.push(row);
      parts.push(atom(atoms.length));
    }
    for (const part of node.allOf ?? []) parts.push(visit(part));
    if (node.anyOf?.length) {
      const alts = node.anyOf.map(visit);
      if (!alts.some((a) => a === null)) parts.push(or(alts as Ast[]));
    }
    return and(parts);
  };
  const ast = c ? visit(c) : null;
  return { atoms, ast };
}

const copy = <T>(x: T): T => JSON.parse(JSON.stringify(x));

/** Положить строку в узел; `false` — слот ключа занят (строка пойдёт в `allOf`, чтобы не слиться с другой). */
function place(node: Condition, row: Condition): boolean {
  const [key] = Object.keys(row) as (ListKey | ArrayKey)[];
  if ((ARRAY_KEYS as readonly string[]).includes(key)) {
    const list = (node[key as ArrayKey] ?? []) as unknown[];
    (node as Record<string, unknown>)[key] = [...list, ...((row[key as ArrayKey] ?? []) as unknown[])];
    return true;
  }
  if (node[key as ListKey] !== undefined) return false;
  (node as Record<string, unknown>)[key] = copy(row[key as ListKey]);
  return true;
}

/** Строки и связка → условие для дела. */
export function modelToCondition(m: ConditionModel): Condition {
  const build = (a: Ast): Condition => {
    if (a.t === "atom") return copy(m.atoms[a.n - 1] ?? {});
    if (a.t === "or") return { anyOf: a.args.map(build) };
    const node: Condition = {};
    const groups: Ast[] = [];
    for (const arg of a.args) {
      if (arg.t !== "atom") {
        groups.push(arg);
        continue;
      }
      const row = m.atoms[arg.n - 1] ?? {};
      if (!place(node, row)) node.allOf = [...(node.allOf ?? []), copy(row)];
    }
    for (const g of groups) {
      if (g.t === "or" && !node.anyOf) node.anyOf = g.args.map(build);
      else node.allOf = [...(node.allOf ?? []), build(g)];
    }
    return node;
  };
  return m.ast ? build(m.ast) : {};
}

// ---------- правки модели ----------

/** Убрать часть формулы; пустые группы исчезают, группа из одной части заменяется ею. */
function without(ast: Ast | null, n: number): Ast | null {
  if (!ast) return null;
  if (ast.t === "atom") return ast.n === n ? null : ast.n > n ? atom(ast.n - 1) : ast;
  const args = ast.args.map((x) => without(x, n)).filter((x): x is Ast => x !== null);
  if (!args.length) return null;
  return ast.t === "and" ? and(args) : or(args);
}

/** Добавить строку: в конец формулы через «и». */
export function addAtom(m: ConditionModel, row: Condition): ConditionModel {
  const atoms = [...m.atoms, row];
  return { atoms, ast: and([m.ast, atom(atoms.length)]) };
}

/** Убрать строку по номеру (с 1); номера следующих сдвигаются. */
export function removeAtom(m: ConditionModel, n: number): ConditionModel {
  return { atoms: m.atoms.filter((_, i) => i !== n - 1), ast: without(m.ast, n) };
}

/** Заменить содержимое строки. */
export function replaceAtom(m: ConditionModel, n: number, row: Condition): ConditionModel {
  return { atoms: m.atoms.map((a, i) => (i === n - 1 ? row : a)), ast: m.ast };
}

// ---------- запись формулы ----------

/** `1 && (2 || 3)`; `&&` сильнее `||`, поэтому `1 || 2 && 3` значит «1 или (2 и 3)». */
export function formulaOf(ast: Ast | null): string {
  if (!ast) return "";
  if (ast.t === "atom") return String(ast.n);
  if (ast.t === "and") return ast.args.map((x) => (x.t === "or" ? `(${formulaOf(x)})` : formulaOf(x))).join(" && ");
  return ast.args.map(formulaOf).join(" || ");
}

/** Та же формула словами: «1 и (2 или 3)». */
export function describeFormula(ast: Ast | null): string {
  if (!ast) return "";
  if (ast.t === "atom") return String(ast.n);
  const wrap = (x: Ast) => (x.t === "atom" ? describeFormula(x) : `(${describeFormula(x)})`);
  if (ast.t === "and") return ast.args.map(wrap).join(" и ");
  return ast.args.map(wrap).join(" или ");
}

type Token = { k: "num"; n: number } | { k: "and" | "or" | "(" | ")" };

function tokenize(text: string): Token[] | string {
  const out: Token[] = [];
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (/\s/.test(ch)) i++;
    else if (/\d/.test(ch)) {
      let j = i;
      while (j < text.length && /\d/.test(text[j])) j++;
      out.push({ k: "num", n: Number(text.slice(i, j)) });
      i = j;
    } else if (ch === "&" || ch === "|") {
      out.push({ k: ch === "&" ? "and" : "or" });
      i += text[i + 1] === ch ? 2 : 1;
    } else if (ch === "(" || ch === ")") {
      out.push({ k: ch });
      i++;
    } else if (/[а-яё]/i.test(ch)) {
      let j = i;
      while (j < text.length && /[а-яё]/i.test(text[j])) j++;
      const word = text.slice(i, j).toLowerCase();
      if (word === "и") out.push({ k: "and" });
      else if (word === "или") out.push({ k: "or" });
      else return `Неизвестное слово «${text.slice(i, j)}»: связки — и, или, && и ||`;
      i = j;
    } else return `Неожиданный символ «${ch}»`;
  }
  return out;
}

export type FormulaResult = { ok: true; ast: Ast } | { ok: false; error: string };

/** Разобрать формулу над `count` строками: каждая строка должна войти ровно один раз. */
export function parseFormula(text: string, count: number): FormulaResult {
  const tokens = tokenize(text);
  if (typeof tokens === "string") return { ok: false, error: tokens };
  if (!tokens.length) return { ok: false, error: "Формула пуста" };
  let pos = 0;
  const fail = (error: string): never => {
    throw new Error(error);
  };
  const expr = (): Ast => {
    const parts = [term()];
    while (tokens[pos]?.k === "or") {
      pos++;
      parts.push(term());
    }
    return or(parts);
  };
  const term = (): Ast => {
    const parts = [factor()];
    while (tokens[pos]?.k === "and") {
      pos++;
      parts.push(factor());
    }
    return and(parts)!;
  };
  const factor = (): Ast => {
    const t = tokens[pos++];
    if (!t) return fail("Формула оборвана: после связки нужно условие");
    if (t.k === "num") return atom(t.n);
    if (t.k === "(") {
      const inner = expr();
      if (tokens[pos++]?.k !== ")") return fail("Не закрыта скобка");
      return inner;
    }
    return fail(t.k === ")" ? "Лишняя закрывающая скобка" : "После связки нужно условие, а не ещё одна связка");
  };
  try {
    const ast = expr();
    if (pos < tokens.length) return { ok: false, error: tokens[pos].k === ")" ? "Лишняя закрывающая скобка" : "Между условиями нужна связка: и / или" };
    const used = new Map<number, number>();
    const walk = (a: Ast): void => (a.t === "atom" ? void used.set(a.n, (used.get(a.n) ?? 0) + 1) : a.args.forEach(walk));
    walk(ast);
    for (const [n, times] of used) {
      if (n < 1 || n > count) return { ok: false, error: `Нет условия №${n}` };
      if (times > 1) return { ok: false, error: `Условие №${n} использовано дважды: повторять условия нельзя, перестройте формулу` };
    }
    for (let n = 1; n <= count; n++) if (!used.has(n)) return { ok: false, error: `Условие №${n} не входит в формулу` };
    return { ok: true, ast };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
