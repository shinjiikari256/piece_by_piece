import { useRef, type MouseEvent, type RefObject, type Dispatch, type SetStateAction } from "react";
import type { CaseFile, Location as LocationT } from "../../../../../shared/case";
import { editor } from "../state";
import { normRect, rectCells, zoneCells } from "./helpers";
import { freeId } from "../../util/ids";
import { T } from "./canvases";
import { posOf as posOfSel } from "./hit-test";
import { LIST_KEY, type Selection, type Tool } from "./types";

export type Cell = { x: number; y: number };
export type HoverPoint = Cell & { px: number; py: number };
export type DragRect = { from: Cell; to: Cell };

interface Options {
  canvas: RefObject<HTMLCanvasElement | null>;
  draft: CaseFile;
  loc: LocationT;
  /** Индекс текущей локации в деле. */
  li: number;
  tool: Tool;
  setTool: (t: Tool) => void;
  sel: Selection;
  setSel: (s: Selection) => void;
  npcCharacter: string;
  hover: HoverPoint | null;
  setHover: (h: HoverPoint | null) => void;
  rect: DragRect | null;
  setRect: Dispatch<SetStateAction<DragRect | null>>;
  hitAt: (t: { x: number; y: number; px?: number; py?: number }) => Selection;
}

/** Мышь на карте: рисование клеток и областей, расстановка предметов и людей, перетаскивание выбранного. Один мазок — один шаг отмены. */
export function useMapPointer({ canvas, draft, loc, li, tool, setTool, sel, setSel, npcCharacter, hover, setHover, rect, setRect, hitAt }: Options) {
  const stroke = useRef<{ id: number; drag?: { dx: number; dy: number }; zone?: string; add?: boolean } | null>(null);
  const updateLoc = (fn: (l: LocationT) => LocationT, merge?: string) => editor.update((d) => ({ ...d, locations: d.locations.map((l, i) => (i === li ? fn(l) : l)) }), merge);

  const tileAt = (e: MouseEvent) => {
    const r = canvas.current!.getBoundingClientRect();
    const w = loc.tiles[0].length;
    const h = loc.tiles.length;
    const px = Math.max(0, Math.min(w * T - 1, ((e.clientX - r.left) / r.width) * w * T));
    const py = Math.max(0, Math.min(h * T - 1, ((e.clientY - r.top) / r.height) * h * T));
    // клетка и точка внутри карты (в базовых пикселях) — по точке находим верхний предмет
    return { x: Math.floor(px / T), y: Math.floor(py / T), px, py };
  };

  const posOf = (s: Selection) => posOfSel(loc, s);

  /** Добавить (`add`) или стереть клетки области; один мазок мыши — один шаг отмены. */
  const paintZone = (zoneId: string, cells: { x: number; y: number }[], add: boolean, strokeId: number) =>
    updateLoc((l) => ({ ...l, zones: l.zones.map((z) => (z.id === zoneId ? { ...z, cells: zoneCells(z.cells, cells, add) } : z)) }), `zone:${strokeId}`);

  const paint = (t: { x: number; y: number }, ch: string, id: number) =>
    updateLoc(
      (l) => ({
        ...l,
        tiles: l.tiles.map((row, y) => (y === t.y && row[t.x] !== ch ? row.slice(0, t.x) + ch + row.slice(t.x + 1) : row)),
      }),
      `paint:${id}`,
    );

  const allIds = () => draft.locations.flatMap((l) => [...l.objects.map((o) => o.id), ...l.npcs.map((n) => n.id)]);

  const onDown = (e: MouseEvent) => {
    const t = tileAt(e);
    const id = Date.now();
    stroke.current = { id };
    switch (tool.kind) {
      case "tile":
        if (e.shiftKey) setRect({ from: t, to: t });
        else paint(t, tool.ch, id);
        break;
      case "object": {
        const oid = freeId(`obj_${tool.sprite}_`, allIds());
        updateLoc((l) => ({ ...l, objects: [...l.objects, { id: oid, sprite: tool.sprite, x: t.x, y: t.y, label: "", interaction: null, onInteract: [] }] }));
        setSel({ kind: "object", id: oid });
        setTool({ kind: "select" });
        break;
      }
      case "npc": {
        const ch = draft.characters.find((c) => c.id === npcCharacter);
        if (!ch) return;
        const nid = freeId(`npc_${ch.id}_`, allIds());
        const dialogueId = draft.dialogues.find((d) => d.characterId === ch.id)?.id ?? "";
        updateLoc((l) => ({ ...l, npcs: [...l.npcs, { id: nid, characterId: ch.id, dialogueId, dialogues: [], x: t.x, y: t.y }] }));
        setSel({ kind: "npc", id: nid });
        setTool({ kind: "select" });
        break;
      }
      case "start":
        // старт один на дело: переносим его сюда из другой локации
        editor.update((d) => ({
          ...d,
          locations: d.locations.map((l, i) => {
            if (i === li) return { ...l, playerStart: t };
            const { playerStart: _gone, ...rest } = l;
            return rest;
          }),
        }));
        setTool({ kind: "select" });
        break;
      case "zone": {
        const add = !(tool.erase || e.altKey);
        let zid = sel?.kind === "zone" ? sel.id : null;
        stroke.current.add = add;
        if (!zid) {
          if (!add) break;
          // область не выбрана — первый мазок создаёт новую
          const taken = draft.locations.flatMap((l) => l.zones.map((z) => z.id));
          zid = freeId("zone_", taken);
          const zone = { id: zid, name: `Область ${taken.length + 1}`, cells: e.shiftKey ? [] : [{ x: t.x, y: t.y }], actions: [] };
          updateLoc((l) => ({ ...l, zones: [...l.zones, zone] }), `zone:${id}`);
          setSel({ kind: "zone", id: zid });
        } else if (!e.shiftKey) paintZone(zid, [t], add, id);
        if (e.shiftKey) setRect({ from: t, to: t });
        stroke.current.zone = zid;
        break;
      }
      case "select": {
        const h = hitAt(t);
        setSel(h);
        if (h) {
          const pos = posOf(h);
          if (pos) stroke.current.drag = { dx: t.x - pos.x, dy: t.y - pos.y };
        }
        break;
      }
    }
  };

  const onMove = (e: MouseEvent) => {
    const t = tileAt(e);
    if (!hover || hover.px !== t.px || hover.py !== t.py) setHover(t);
    if (!stroke.current || !(e.buttons & 1)) return;
    if (tool.kind === "tile") {
      if (rect) return setRect({ ...rect, to: t });
      return paint(t, tool.ch, stroke.current.id);
    }
    if (tool.kind === "zone") {
      const zid = stroke.current.zone;
      if (!zid) return;
      if (rect) return setRect({ ...rect, to: t });
      return paintZone(zid, [t], stroke.current.add ?? true, stroke.current.id);
    }
    const drag = stroke.current.drag;
    if (tool.kind !== "select" || !sel || sel.kind === "zone" || !drag) return;
    const x = t.x - drag.dx;
    const y = t.y - drag.dy;
    const pos = posOf(sel);
    if (!pos || (pos.x === x && pos.y === y)) return;
    const merge = `move:${stroke.current.id}`;
    if (sel.kind === "start") return updateLoc((l) => ({ ...l, playerStart: { x, y } }), merge);
    const key = LIST_KEY[sel.kind];
    updateLoc((l) => ({ ...l, [key]: (l[key] as { id: string }[]).map((it) => (it.id === sel.id ? { ...it, x, y } : it)) }), merge);
  };

  const onUp = () => {
    if (rect && tool.kind === "zone" && stroke.current?.zone) paintZone(stroke.current.zone, rectCells(normRect(rect)), stroke.current.add ?? true, stroke.current.id);
    if (rect && tool.kind === "tile") {
      const r = normRect(rect);
      const ch = tool.ch;
      updateLoc((l) => ({
        ...l,
        tiles: l.tiles.map((row, y) => (y < r.y || y >= r.y + r.h ? row : row.slice(0, r.x) + ch.repeat(Math.min(r.w, row.length - r.x)) + row.slice(r.x + r.w))),
      }));
    }
    setRect(null);
    stroke.current = null;
  };

  return { onDown, onMove, onUp };
}
