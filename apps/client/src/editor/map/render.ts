import {
  CHAR_H,
  DOOR_SIZE,
  doorMirrored,
  LOOKS,
  SPRITES,
  drawTile,
  resolveLook,
} from "../../game/art";
import { LocationObject, NpcPlacement } from "../../../../../shared/case";
import type { CaseFile as CaseFileT, Location as LocationT } from "../../../../../shared/case";
import { doorCanvas, lookCanvas, T, useSpriteCanvases } from "./canvases";
import { normRect } from "./helpers";
import type { PxRect } from "./helpers";
import type { Tool, DoorT } from "./types";

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
}

/** Перерисовать холст: клетки, предметы, люди, двери, наведение, выделение. */
export function renderMap(cv: HTMLCanvasElement, s: MapRenderState) {
  const { loc, art, characters, tool, npcCharacter, hover, rect, selected } = s;
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
    ...loc.doors.map((d) => ({ y: d.orientation === "v" ? d.y + 1 : d.y, draw: () => drawDoorAt(ctx, d) })),
  ].sort((a, b) => a.y - b.y);
  items.forEach((i) => i.draw());

  // старт, выходы, подписи зон
  ctx.strokeStyle = "#2e9e5b";
  ctx.lineWidth = 1;
  ctx.strokeRect(loc.playerStart.x * T + 2.5, loc.playerStart.y * T + 2.5, T - 5, T - 5);
  ctx.fillStyle = "#2e9e5b";
  ctx.font = "bold 9px sans-serif";
  ctx.fillText("▶", loc.playerStart.x * T + 4, loc.playerStart.y * T + 11);
  for (const e of loc.exits) {
    ctx.fillStyle = "rgba(43,76,126,0.55)";
    ctx.fillRect(e.x * T, e.y * T, T, T);
    ctx.fillStyle = "#fff";
    ctx.fillText("⇄", e.x * T + 4, e.y * T + 11);
  }
  ctx.fillStyle = "rgba(43,35,28,0.5)";
  ctx.font = "bold 7px sans-serif";
  for (const a of loc.areas) ctx.fillText(a.name, a.x * T, a.y * T + 10);

  // наведение и предпросмотр того, что поставим
  if (hover && !rect) {
    ctx.save();
    ctx.globalAlpha = 0.55;
    if (tool.kind === "object") drawObject(ctx, { id: "", sprite: tool.sprite, x: hover.x, y: hover.y, label: "", interaction: null });
    if (tool.kind === "npc") drawNpc(ctx, { id: "", characterId: npcCharacter, dialogueId: "", x: hover.x, y: hover.y });
    if (tool.kind === "tile") drawTile(ctx, tool.ch, hover.x * T, hover.y * T, {});
    if (tool.kind === "door") drawDoorAt(ctx, { id: "", x: hover.x, y: hover.y, orientation: tool.orientation });
    ctx.restore();
    const fw = tool.kind === "object" ? SPRITES[tool.sprite].footprint : tool.kind === "door" && tool.orientation === "h" ? 2 : 1;
    const fh = tool.kind === "door" && tool.orientation === "v" ? 2 : 1;
    ctx.strokeStyle = "rgba(255,255,255,0.9)";
    ctx.lineWidth = 1;
    ctx.strokeRect(hover.x * T + 0.5, hover.y * T + 0.5, fw * T - 1, fh * T - 1);
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
    const cx = (o.x + spec.footprint / 2) * T;
    c.drawImage(img, cx - spec.w / 2, (o.y + 1) * T - spec.h - (spec.mount ?? 0));
  }
  function drawDoorAt(c: CanvasRenderingContext2D, d: DoorT) {
    const h = d.orientation === "h";
    const cx = h ? (d.x + 1) * T : (d.x + 0.5) * T;
    const bottom = h ? (d.y + 1) * T : (d.y + 2) * T;
    const size = DOOR_SIZE[d.orientation];
    const img = doorCanvas(d.orientation, !!d.requires);
    if (!h && doorMirrored(d.x, loc.tiles[0].length)) {
      c.save();
      c.translate(cx, 0);
      c.scale(-1, 1);
      c.drawImage(img, -size.w / 2, bottom - size.h);
      c.restore();
    } else c.drawImage(img, cx - size.w / 2, bottom - size.h);
  }
  function drawNpc(c: CanvasRenderingContext2D, n: NpcPlacement) {
    const ch = characters.find((x) => x.id === n.characterId);
    c.drawImage(lookCanvas(ch ? resolveLook(ch) : LOOKS.casual_m), n.x * T, (n.y + 1) * T - CHAR_H - 1);
  }
}
