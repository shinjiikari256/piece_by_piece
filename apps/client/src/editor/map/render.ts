import {
  CHAR_H,
  LOOKS,
  SPRITES,
  drawTile,
  resolveLook,
} from "../../game/art";
import { LocationObject, NpcPlacement } from "../../../../../shared/case";
import type { CaseFile as CaseFileT, Location as LocationT } from "../../../../../shared/case";
import { lookCanvas, T, useSpriteCanvases } from "./canvases";
import { normRect, zoneColor } from "./helpers";
import type { PxRect } from "./helpers";
import type { Tool } from "./types";

/** Всё, что нужно, чтобы нарисовать карту локации в редакторе. */
export interface MapRenderState {
  loc: LocationT;
  art: ReturnType<typeof useSpriteCanvases>;
  characters: CaseFileT["characters"];
  tool: Tool;
  npcCharacter: string;
  hover: { x: number; y: number } | null;
  rect: { from: { x: number; y: number }; to: { x: number; y: number } } | null;
  selected: PxRect | null;
  /** Выбранная область — рисуется ярче. */
  zoneSel?: string | null;
}

/** Перерисовать холст: клетки, предметы, люди, двери, наведение, выделение. */
export function renderMap(cv: HTMLCanvasElement, s: MapRenderState) {
  const { loc, art, characters, tool, npcCharacter, hover, rect, selected, zoneSel } = s;
  const w = loc.tiles[0]?.length ?? 0;
  const h = loc.tiles.length;
  cv.width = w * T;
  cv.height = h * T;
  const ctx = cv.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  loc.tiles.forEach((row, y) =>
    [...row].forEach((ch, x) =>
      drawTile(ctx, ch, x * T, y * T, { below: loc.tiles[y + 1]?.[x], above: loc.tiles[y - 1]?.[x], left: row[x - 1], right: row[x + 1] }),
    ),
  );
  const items = [
    ...loc.objects.map((o) => ({ y: SPRITES[o.sprite].flat ? -1 : o.y, draw: () => drawObject(ctx, o) })),
    ...loc.npcs.map((n) => ({ y: n.y, draw: () => drawNpc(ctx, n) })),
  ].sort((a, b) => a.y - b.y);
  items.forEach((i) => i.draw());

  // области-триггеры: цветная заливка клеток, подпись у верхней левой клетки
  for (const z of loc.zones) {
    const on = z.id === zoneSel || (tool.kind === "zone" && !zoneSel);
    ctx.fillStyle = zoneColor(z.id, on ? 0.38 : 0.24, z.color);
    for (const c of z.cells) ctx.fillRect(c.x * T, c.y * T, T, T);
    if (z.id === zoneSel) {
      ctx.strokeStyle = zoneColor(z.id, 0.95, z.color);
      ctx.lineWidth = 1;
      for (const c of z.cells) ctx.strokeRect(c.x * T + 0.5, c.y * T + 0.5, T - 1, T - 1);
    }
    const first = [...z.cells].sort((a, b) => a.y - b.y || a.x - b.x)[0];
    if (first) {
      ctx.fillStyle = "rgba(20,12,4,0.85)";
      ctx.font = "bold 7px sans-serif";
      ctx.fillText(z.name, first.x * T + 1, first.y * T + 7);
    }
  }

  // старт и подписи
  if (loc.playerStart) {
    ctx.strokeStyle = "#2e9e5b";
    ctx.lineWidth = 1;
    ctx.strokeRect(loc.playerStart.x * T + 2.5, loc.playerStart.y * T + 2.5, T - 5, T - 5);
    ctx.fillStyle = "#2e9e5b";
    ctx.font = "bold 9px sans-serif";
    ctx.fillText("▶", loc.playerStart.x * T + 4, loc.playerStart.y * T + 11);
  }
  ctx.fillStyle = "rgba(43,35,28,0.5)";
  ctx.font = "bold 7px sans-serif";
  for (const a of loc.areas) ctx.fillText(a.name, a.x * T, a.y * T + 10);

  // наведение и предпросмотр того, что поставим
  if (hover && !rect) {
    ctx.save();
    ctx.globalAlpha = 0.55;
    if (tool.kind === "object") drawObject(ctx, { id: "", sprite: tool.sprite, x: hover.x, y: hover.y, label: "", interaction: null, onInteract: [] });
    if (tool.kind === "npc") drawNpc(ctx, { id: "", characterId: npcCharacter, dialogueId: "", dialogues: [], x: hover.x, y: hover.y });
    if (tool.kind === "tile") drawTile(ctx, tool.ch, hover.x * T, hover.y * T, {});
    if (tool.kind === "zone") {
      ctx.fillStyle = tool.erase ? "rgba(224,88,74,0.7)" : "rgba(46,158,91,0.7)";
      ctx.fillRect(hover.x * T, hover.y * T, T, T);
    }
    ctx.restore();
    const objFp = tool.kind === "object" ? SPRITES[tool.sprite].footprint : null;
    const fw = objFp ? objFp.w : 1;
    const fh = objFp ? objFp.h : 1;
    ctx.strokeStyle = "rgba(255,255,255,0.9)";
    ctx.lineWidth = 1;
    ctx.strokeRect(hover.x * T + 0.5, (hover.y - (objFp ? objFp.h - 1 : 0)) * T + 0.5, fw * T - 1, fh * T - 1);
  }
  if (rect && tool.kind === "zone") {
    const r = normRect(rect);
    ctx.strokeStyle = tool.erase ? "#e0584a" : "#2e9e5b";
    ctx.lineWidth = 1;
    ctx.strokeRect(r.x * T + 0.5, r.y * T + 0.5, r.w * T - 1, r.h * T - 1);
  }
  if (rect && tool.kind === "tile") {
    const r = normRect(rect);
    ctx.save();
    ctx.globalAlpha = 0.6;
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) drawTile(ctx, tool.ch, x * T, y * T, {});
    ctx.restore();
    ctx.strokeStyle = "#f6d55c";
    ctx.lineWidth = 1;
    ctx.strokeRect(r.x * T + 0.5, r.y * T + 0.5, r.w * T - 1, r.h * T - 1);
  }

  // выделение
  const box = selected;
  if (box) {
    ctx.strokeStyle = "#f6d55c";
    ctx.lineWidth = 2;
    ctx.strokeRect(box.x + 1, box.y + 1, box.w - 2, box.h - 2);
  }

  function drawObject(c: CanvasRenderingContext2D, o: LocationObject) {
    const spec = SPRITES[o.sprite];
    const img = art.sprites.get(o.sprite)!;
    const cx = (o.x + spec.footprint.w / 2) * T;
    const top = (o.y + 1) * T - spec.h - (spec.mount ?? 0);
    if (spec.mirrorRight && o.x >= loc.tiles[0].length / 2) {
      c.save();
      c.translate(cx, 0);
      c.scale(-1, 1);
      c.drawImage(img, -spec.w / 2, top);
      c.restore();
    } else c.drawImage(img, cx - spec.w / 2, top);
  }
  function drawNpc(c: CanvasRenderingContext2D, n: NpcPlacement) {
    const ch = characters.find((x) => x.id === n.characterId);
    c.drawImage(lookCanvas(ch ? resolveLook(ch) : LOOKS.casual_m), n.x * T, (n.y + 1) * T - CHAR_H - 1);
  }
}
