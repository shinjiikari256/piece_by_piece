import { LOOKS, SPRITES, footprintHas, resolveLook } from "../../game/art";
import type { CaseFile, Location as LocationT } from "../../../../../shared/case";
import { pickTopmost } from "./helpers";
import { lookCanvas, type useSpriteCanvases } from "./canvases";
import { LIST_KEY, type Selection } from "./types";

type Art = ReturnType<typeof useSpriteCanvases>;

/** Выбранный объект из адреса (`object:obj_desk`, `start`); если такого на локации нет — ничего не выбрано. */
export function parseSelection(loc: LocationT | undefined, key: string): Selection {
  if (!loc || !key) return null;
  if (key === "start") return { kind: "start" };
  const [kind, ...rest] = key.split(":");
  const id = rest.join(":");
  const list = { object: loc.objects, npc: loc.npcs, zone: loc.zones }[kind as "object" | "npc" | "zone"];
  return list?.some((x) => x.id === id) ? ({ kind, id } as Selection) : null;
}

/** Есть ли пиксель картинки в точке (прозрачные углы спрайта не выделяются). */
export function opaqueAt(loc: LocationT, art: Art, characters: CaseFile["characters"], s: NonNullable<Selection>, lx: number, ly: number) {
  let c: HTMLCanvasElement | undefined;
  if (s.kind === "object") c = art.sprites.get(loc.objects.find((o) => o.id === s.id)?.sprite ?? "");
  if (s.kind === "npc") {
    const n = loc.npcs.find((x) => x.id === s.id);
    const ch = n && characters.find((x) => x.id === n.characterId);
    c = lookCanvas(ch ? resolveLook(ch) : LOOKS.casual_m);
  }
  const data = c?.getContext("2d")?.getImageData(Math.floor(lx), Math.floor(ly), 1, 1).data;
  return !data || data[3] > 16;
}

/** Что лежит под курсором: старт, верхний предмет или человек, затем клетка предмета, в самом низу — область. */
export function hitTest(loc: LocationT, t: { x: number; y: number; px?: number; py?: number }, opaque: (s: NonNullable<Selection>, lx: number, ly: number) => boolean): Selection {
  if (loc.playerStart?.x === t.x && loc.playerStart.y === t.y) return { kind: "start" };
  // верхний из нарисованных предметов, людей и дверей под курсором — целиком, а не по клетке под ногами
  const top = t.px === undefined || t.py === undefined ? null : pickTopmost(loc, t.px, t.py, opaque);
  if (top) return top;
  // запасной путь: клетка, которую занимает предмет или дверь
  const npc = loc.npcs.find((n) => n.x === t.x && n.y === t.y);
  if (npc) return { kind: "npc", id: npc.id };
  const obj = [...loc.objects].reverse().find((o) => footprintHas(o.x, o.y, SPRITES[o.sprite].footprint, t.x, t.y));
  if (obj) return { kind: "object", id: obj.id };
  // область — самый нижний слой: выбирается, если в клетке больше ничего нет
  const zone = loc.zones.find((z) => z.cells.some((c) => c.x === t.x && c.y === t.y));
  return zone ? { kind: "zone", id: zone.id } : null;
}

/** Клетка выбранного предмета/человека/старта (у области клетки нет). */
export function posOf(loc: LocationT, s: Selection) {
  if (!s) return null;
  if (s.kind === "start") return loc.playerStart ?? null;
  if (s.kind === "zone") return null;
  const list = loc[LIST_KEY[s.kind]] as { id: string; x: number; y: number }[];
  return list.find((x) => x.id === s.id) ?? null;
}
