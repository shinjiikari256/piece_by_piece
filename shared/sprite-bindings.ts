import type { CaseFile, Condition, CustomSprite, LocationObject } from "./case";

/** Строки условия, которые можно использовать в состояниях спрайта (только над его переменными). */
const SPRITE_ROWS = new Set(["flags", "notFlags", "counters", "enums", "allOf", "anyOf"]);

/** Какие переменные спрайта (по виду) использует условие и какие строки в нём недопустимы. */
export function conditionParams(c: Condition | undefined): { flags: string[]; counters: string[]; enums: { id: string; values: string[] }[]; foreign: string[] } {
  const out = { flags: [] as string[], counters: [] as string[], enums: [] as { id: string; values: string[] }[], foreign: [] as string[] };
  const walk = (x: Condition | undefined) => {
    if (!x) return;
    for (const [k, v] of Object.entries(x)) {
      if (v === undefined || (Array.isArray(v) && !v.length)) continue;
      if (!SPRITE_ROWS.has(k)) out.foreign.push(k);
    }
    out.flags.push(...(x.flags ?? []), ...(x.notFlags ?? []));
    out.counters.push(...(x.counters ?? []).map((r) => r.counterId));
    out.enums.push(...(x.enums ?? []).map((r) => ({ id: r.enumId, values: [...(r.in ?? []), ...(r.notIn ?? [])] })));
    [...(x.allOf ?? []), ...(x.anyOf ?? [])].forEach(walk);
  };
  walk(c);
  return out;
}

/** Условие состояния спрайта, переписанное на переменные дела: id переменных спрайта заменяются привязанными. */
export function bindCondition(c: Condition, map: Record<string, string>): Condition {
  const m = (id: string) => map[id] ?? id;
  const out: Condition = { ...c };
  if (c.flags) out.flags = c.flags.map(m);
  if (c.notFlags) out.notFlags = c.notFlags.map(m);
  if (c.counters) out.counters = c.counters.map((r) => ({ ...r, counterId: m(r.counterId) }));
  if (c.enums) out.enums = c.enums.map((r) => ({ ...r, enumId: m(r.enumId) }));
  if (c.allOf) out.allOf = c.allOf.map((x) => bindCondition(x, map));
  if (c.anyOf) out.anyOf = c.anyOf.map((x) => bindCondition(x, map));
  return out;
}

/** Предмет с состояниями и анимациями спрайта дела, если своих состояний у предмета нет. Остальное — как есть. */
export function bindObject(o: LocationObject, sprite: CustomSprite | undefined): LocationObject {
  if (!sprite || o.states?.length || !sprite.states?.length) return o;
  const map = o.bindings ?? {};
  return {
    ...o,
    states: sprite.states.map((st) => ({ ...st, ...(st.when ? { when: bindCondition(st.when, map) } : {}) })),
    transitions: o.transitions ?? sprite.transitions,
    actions: o.actions ?? sprite.actions,
    timers: o.timers ?? sprite.timers,
  };
}

/** Дело, каким его видит игра: предметы со спрайтами дела получают состояния спрайта по привязкам. */
export function bindSprites(c: CaseFile): CaseFile {
  if (!c.sprites?.some((s) => s.states?.length)) return c;
  const byKey = new Map(c.sprites.map((s) => [s.key, s]));
  return { ...c, locations: c.locations.map((l) => ({ ...l, objects: l.objects.map((o) => bindObject(o, byKey.get(o.sprite))) })) };
}
