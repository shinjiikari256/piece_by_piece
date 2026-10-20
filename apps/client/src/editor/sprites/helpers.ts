import type { CaseFile, Condition, CustomSprite, SpriteParam } from "../../../../../shared/case";

export type Op = CustomSprite["frames"][string][number];

/** Цвет с прозрачностью: `#rrggbb` или `#rrggbbaa` (255 — сплошной). */
export const withAlpha = (color: string, alpha: number): string => (alpha >= 255 ? color.slice(0, 7) : `${color.slice(0, 7)}${Math.max(1, alpha).toString(16).padStart(2, "0")}`);

/** Во сколько раз увеличить холст рисования, чтобы он помещался примерно в 560 px. */
export const spriteMaxScale = (w: number, h: number): number => Math.max(2, Math.min(32, Math.floor(560 / Math.max(w, h))));

const mapSprite = (d: CaseFile, key: string, fn: (s: CustomSprite) => CustomSprite): CaseFile => ({ ...d, sprites: d.sprites?.map((s) => (s.key === key ? fn(s) : s)) });

/** Заменить операции кадра спрайта дела. */
export const setFrameOps = (d: CaseFile, key: string, frame: string, ops: Op[]): CaseFile => mapSprite(d, key, (s) => ({ ...s, frames: { ...s.frames, [frame]: ops } }));

export const patchSprite = (d: CaseFile, key: string, patch: Partial<CustomSprite>): CaseFile => mapSprite(d, key, (s) => ({ ...s, ...patch }));

/** Новый спрайт дела: пустой кадр 16×16, одна клетка опоры, ключ `sprite_N` без повторов со встроенными и прежними. */
export function newSprite(d: CaseFile, taken: (key: string) => boolean): CustomSprite {
  let n = (d.sprites?.length ?? 0) + 1;
  while (taken(`sprite_${n}`) || d.sprites?.some((s) => s.key === `sprite_${n}`)) n++;
  return { key: `sprite_${n}`, name: `Спрайт ${n}`, w: 16, h: 16, footprint: { w: 1, h: 1 }, solid: true, frames: { default: [] } };
}

/** Где спрайт стоит на картах дела (локация · предмет). */
export const spriteUses = (d: CaseFile, key: string): string[] => d.locations.flatMap((l) => l.objects.filter((o) => o.sprite === key).map((o) => `${l.id}/${o.id}`));

/** Сменить ключ спрайта дела: сам спрайт и ссылки в предметах. */
export const renameSprite = (d: CaseFile, from: string, to: string): CaseFile => ({
  ...d,
  sprites: d.sprites?.map((s) => (s.key === from ? { ...s, key: to } : s)),
  locations: d.locations.map((l) => ({ ...l, objects: l.objects.map((o) => (o.sprite === from ? { ...o, sprite: to } : o)) })),
});

/** Проходимость клетки опоры: исключение из `cells` или значение спрайта. */
export const cellSolid = (s: Pick<CustomSprite, "solid" | "cells">, dx: number, dy: number): boolean => s.cells?.find((c) => c.dx === dx && c.dy === dy)?.solid ?? s.solid;

/** Переключить проходимость клетки опоры; исключение, совпавшее со значением спрайта, не хранится. */
export function toggleCell(s: Pick<CustomSprite, "solid" | "cells">, dx: number, dy: number): NonNullable<CustomSprite["cells"]> {
  const next = !cellSolid(s, dx, dy);
  const rest = (s.cells ?? []).filter((c) => !(c.dx === dx && c.dy === dy));
  return next === s.solid ? rest : [...rest, { dx, dy, solid: next }];
}

/** Ограничение переменной спрайта в условии состояния: для флага — установлен или нет, для числа — границы, для перечисления — допустимые значения. */
export type ParamRule = { flag?: boolean; min?: number; max?: number; values?: string[] };

/** Условие состояния → правила по переменным (только плоские строки; вложенные `allOf`/`anyOf` не затрагиваются). */
export function rulesOf(c: Condition | undefined): Record<string, ParamRule> {
  const out: Record<string, ParamRule> = {};
  for (const id of c?.flags ?? []) out[id] = { flag: true };
  for (const id of c?.notFlags ?? []) out[id] = { flag: false };
  for (const r of c?.counters ?? []) out[r.counterId] = { min: r.min, max: r.max };
  for (const r of c?.enums ?? []) out[r.enumId] = { values: r.in ?? [] };
  return out;
}

/** Правила → условие (строки заменяются, `allOf`/`anyOf` сохраняются); пустое условие — `undefined`. */
export function conditionOf(old: Condition | undefined, rules: Record<string, ParamRule>, params: SpriteParam[]): Condition | undefined {
  const flags = params.filter((q) => q.kind === "flag" && rules[q.id]?.flag === true).map((q) => q.id);
  const notFlags = params.filter((q) => q.kind === "flag" && rules[q.id]?.flag === false).map((q) => q.id);
  const counters = params
    .filter((q) => q.kind === "counter" && rules[q.id] && (rules[q.id].min !== undefined || rules[q.id].max !== undefined))
    .map((q) => ({ counterId: q.id, ...(rules[q.id].min !== undefined ? { min: rules[q.id].min } : {}), ...(rules[q.id].max !== undefined ? { max: rules[q.id].max } : {}) }));
  const enums = params.filter((q) => q.kind === "enum" && rules[q.id]?.values?.length).map((q) => ({ enumId: q.id, in: rules[q.id].values }));
  const out: Condition = {
    ...(old?.allOf ? { allOf: old.allOf } : {}),
    ...(old?.anyOf ? { anyOf: old.anyOf } : {}),
    ...(flags.length ? { flags } : {}),
    ...(notFlags.length ? { notFlags } : {}),
    ...(counters.length ? { counters } : {}),
    ...(enums.length ? { enums } : {}),
  };
  return Object.keys(out).length ? out : undefined;
}

/** Подписи стандартных кадров; остальные показываются как названы автором. */
const FRAME_NAMES: Record<string, string> = { default: "Основной", open: "Открыт", closed: "Закрыт", locked: "Заперт", on: "Включён", off: "Выключен" };
export const frameLabel = (key: string): string => FRAME_NAMES[key] ?? key;

/** Свободный ключ из названия: `toKey`-подобный `base`, при занятости — с номером. */
export function uniqueKey(base: string, taken: (k: string) => boolean): string {
  const root = base || "item";
  if (!taken(root)) return root;
  let n = 2;
  while (taken(`${root}_${n}`)) n++;
  return `${root}_${n}`;
}

/** Сменить имя кадра спрайта дела: сам кадр, состояния и клипы спрайта и всех его предметов на картах. */
export function renameFrame(d: CaseFile, spriteKey: string, from: string, to: string): CaseFile {
  const fix = (v: unknown): unknown =>
    Array.isArray(v)
      ? v.map(fix)
      : v && typeof v === "object"
        ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, k === "frame" && x === from ? to : fix(x)]))
        : v;
  return {
    ...d,
    sprites: d.sprites?.map((s) => {
      if (s.key !== spriteKey) return s;
      const frames = Object.fromEntries(Object.entries(s.frames).map(([k, ops]) => [k === from ? to : k, ops])) as CustomSprite["frames"];
      return { ...(fix({ ...s, frames: undefined }) as CustomSprite), frames };
    }),
    locations: d.locations.map((l) => ({ ...l, objects: l.objects.map((o) => (o.sprite === spriteKey ? (fix(o) as typeof o) : o)) })),
  };
}

/** Убрать переменную спрайта и её ограничения из условий состояний. */
export function withoutParam(s: CustomSprite, id: string): Partial<CustomSprite> {
  const params = (s.params ?? []).filter((q) => q.id !== id);
  return {
    params: params.length ? params : undefined,
    states: s.states?.map((st) => {
      const rules = rulesOf(st.when);
      delete rules[id];
      return { ...st, when: conditionOf(st.when, rules, params) };
    }),
  };
}

/** Условие состояния словами: «Горит — да; Заряд от 2». */
export function describeRules(params: SpriteParam[], rules: Record<string, ParamRule>): string {
  const parts = params.flatMap((q) => {
    const r = rules[q.id];
    if (!r) return [];
    const n = q.name || q.id;
    if (q.kind === "flag") return r.flag === undefined ? [] : [`${n} — ${r.flag ? "да" : "нет"}`];
    if (q.kind === "counter") {
      const lim = [r.min !== undefined ? `от ${r.min}` : "", r.max !== undefined ? `до ${r.max}` : ""].filter(Boolean).join(" ");
      return lim ? [`${n} ${lim}`] : [];
    }
    const names = (r.values ?? []).map((v) => q.values?.find((x) => x.id === v)?.name || v);
    return names.length ? [`${n}: ${names.join(" или ")}`] : [];
  });
  return parts.length ? parts.join("; ") : "всегда";
}
