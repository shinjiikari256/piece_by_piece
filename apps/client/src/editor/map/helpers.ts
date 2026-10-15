import { CHAR_H, CHAR_W, DOOR_SIZE, FLOOR_TILES, SPRITES } from "../../game/art";
import { T } from "./canvases";
import type { CaseFile as CaseFileT, Location as LocationT } from "../../../../../shared/case";
import { editor } from "../state";


import type { Selection } from "./types";

export function normRect(r: { from: { x: number; y: number }; to: { x: number; y: number } }) {
  const x = Math.min(r.from.x, r.to.x);
  const y = Math.min(r.from.y, r.to.y);
  return { x, y, w: Math.abs(r.from.x - r.to.x) + 1, h: Math.abs(r.from.y - r.to.y) + 1 };
}

export function resize(l: LocationT, w: number, h: number): LocationT {
  const rows = l.tiles.slice(0, h).map((r) => (r.length >= w ? r.slice(0, w) : r + "#".repeat(w - r.length)));
  while (rows.length < h) rows.push("#".repeat(w));
  return { ...l, tiles: rows };
}

export function addLocation(draft: CaseFileT, select: (i: number) => void) {
  const id = `loc_${draft.locations.length + 1}`;
  const tiles = ["#".repeat(20), ...Array.from({ length: 10 }, () => "#" + ".".repeat(18) + "#"), "#".repeat(20)];
  editor.update((d) => ({
    ...d,
    locations: [...d.locations, { id, name: "Новая локация", tiles, areas: [], objects: [], npcs: [], exits: [], doors: [], zones: [] }],
  }));
  select(draft.locations.length);
}


/** Прямоугольник в базовых пикселях карты (клетка — `T` пикселей). */
export interface PxRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

type Obj = LocationT["objects"][number];
type Npc = LocationT["npcs"][number];
type Door = LocationT["doors"][number];

/** Где предмет нарисован: картинка стоит низом по центру занимаемых клеток, настенные приподняты. */
export const objectRect = (o: Obj): PxRect => {
  const spec = SPRITES[o.sprite];
  return { x: (o.x + spec.footprint / 2) * T - spec.w / 2, y: (o.y + 1) * T - spec.h - (spec.mount ?? 0), w: spec.w, h: spec.h };
};
export const npcRect = (n: Npc): PxRect => ({ x: n.x * T, y: (n.y + 1) * T - CHAR_H - 1, w: CHAR_W, h: CHAR_H });
export const doorRect = (d: Door): PxRect => {
  const h = d.orientation === "h";
  const size = DOOR_SIZE[d.orientation];
  const cx = h ? (d.x + 1) * T : (d.x + 0.5) * T;
  const bottom = h ? (d.y + 1) * T : (d.y + 2) * T;
  return { x: cx - size.w / 2, y: bottom - size.h, w: size.w, h: size.h };
};
const tileRect = (x: number, y: number): PxRect => ({ x: x * T, y: y * T, w: T, h: T });

/**
 * Что выделить на холсте: предмет, человек и дверь — целиком, по нарисованной картинке
 * (а не по клетке, на которой стоят); старт и выход — клетка.
 */
export function selectionBox(loc: LocationT | undefined, s: Selection): PxRect | null {
  if (!s || !loc) return null;
  if (s.kind === "start") return loc.playerStart ? tileRect(loc.playerStart.x, loc.playerStart.y) : null;
  if (s.kind === "zone") {
    const z = loc.zones.find((x) => x.id === s.id);
    if (!z?.cells.length) return null;
    const xs = z.cells.map((c) => c.x);
    const ys = z.cells.map((c) => c.y);
    const x0 = Math.min(...xs);
    const y0 = Math.min(...ys);
    return { x: x0 * T, y: y0 * T, w: (Math.max(...xs) - x0 + 1) * T, h: (Math.max(...ys) - y0 + 1) * T };
  }
  if (s.kind === "object") {
    const o = loc.objects.find((x) => x.id === s.id);
    return o ? objectRect(o) : null;
  }
  if (s.kind === "npc") {
    const n = loc.npcs.find((x) => x.id === s.id);
    return n ? npcRect(n) : null;
  }
  const d = loc.doors.find((x) => x.id === s.id);
  return d ? doorRect(d) : null;
}

const inside = (r: PxRect, px: number, py: number) => px >= r.x && px < r.x + r.w && py >= r.y && py < r.y + r.h;

/**
 * Самый верхний (нарисованный последним) предмет, человек или дверь под точкой карты (px, py).
 * Порядок рисования тот же, что в `renderMap`: по линии пола, настенные и ковры — под остальными.
 * `opaque` — необязательная проверка, что в этой точке картинки есть пиксель (прозрачные углы не в счёт).
 */
export function pickTopmost(
  loc: LocationT,
  px: number,
  py: number,
  opaque?: (s: Exclude<Selection, null>, localX: number, localY: number) => boolean,
): Selection {
  const items: { order: number; sel: Exclude<Selection, null>; rect: PxRect }[] = [
    ...loc.objects.map((o) => ({ order: SPRITES[o.sprite].flat ? -1 : o.y, sel: { kind: "object", id: o.id } as const, rect: objectRect(o) })),
    ...loc.npcs.map((n) => ({ order: n.y, sel: { kind: "npc", id: n.id } as const, rect: npcRect(n) })),
    ...loc.doors.map((d) => ({ order: d.orientation === "v" ? d.y + 1 : d.y, sel: { kind: "door", id: d.id } as const, rect: doorRect(d) })),
  ];
  // стабильная сортировка по возрастанию — как при рисовании; ищем с конца
  const drawn = items.map((it, i) => ({ ...it, i })).sort((a, b) => a.order - b.order || a.i - b.i);
  for (let k = drawn.length - 1; k >= 0; k--) {
    const { rect, sel } = drawn[k];
    if (inside(rect, px, py) && (!opaque || opaque(sel, px - rect.x, py - rect.y))) return sel;
  }
  return null;
}

/**
 * Можно ли поставить персонажа на клетку (для эффекта «идёт на клетку»): пол, без твёрдых предметов и чужих людей.
 * Клетка, на которой стоит сам персонаж, считается свободной (`characterId`).
 */
export function cellFree(loc: LocationT, x: number, y: number, characterId?: string): boolean {
  if (!FLOOR_TILES.has(loc.tiles[y]?.[x] ?? "")) return false;
  const solid = loc.objects.some((o) => SPRITES[o.sprite].solid && y === o.y && x >= o.x && x < o.x + SPRITES[o.sprite].footprint);
  const person = loc.npcs.some((n) => n.x === x && n.y === y && n.characterId !== characterId);
  return !solid && !person;
}

/** Клетки области после добавления или стирания клеток `cells` (без повторов). */
export function zoneCells(current: { x: number; y: number }[], cells: { x: number; y: number }[], add: boolean) {
  const key = (c: { x: number; y: number }) => `${c.x},${c.y}`;
  const touched = new Set(cells.map(key));
  if (!add) return current.filter((c) => !touched.has(key(c)));
  const have = new Set(current.map(key));
  return [...current, ...cells.filter((c) => !have.has(key(c)))];
}

/** Все клетки прямоугольника. */
export function rectCells(r: { x: number; y: number; w: number; h: number }) {
  return Array.from({ length: r.w * r.h }, (_, i) => ({ x: r.x + (i % r.w), y: r.y + Math.floor(i / r.w) }));
}

/** Цвета для выбора в свойствах области. */
export const ZONE_COLORS = ["#d94f4f", "#e08a2e", "#d4b21f", "#3f9e5a", "#2fa3a3", "#3f7fd9", "#7a5fd1", "#c4529e"];

/** Цвет области на карте: заданный (#rrggbb) или оттенок по ключу, чтобы соседние области различались. */
export function zoneColor(id: string, alpha: number, color?: string) {
  if (color && /^#[0-9a-f]{6}$/i.test(color)) {
    const n = parseInt(color.slice(1), 16);
    return `rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
  }
  let hash = 0;
  for (const ch of id) hash = (hash * 31 + ch.charCodeAt(0)) % 360;
  return `hsla(${hash}, 70%, 50%, ${alpha})`;
}
