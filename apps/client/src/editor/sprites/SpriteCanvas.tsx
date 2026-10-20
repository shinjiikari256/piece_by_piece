import { useEffect, useRef, useState } from "react";
import type { CustomSprite } from "../../../../../shared/case";
import { drawSprite, specOf } from "../../game/art";
import { editor } from "../state";
import { cellSolid, setFrameOps, spriteMaxScale, toggleCell, withAlpha, type Op, patchSprite } from "./helpers";

export type Tool = "pencil" | "eraser" | "rect" | "pick";
export const TOOLS: { id: Tool; label: string; hint: string; icon: "pen" | "eraser" | "rect" | "pipette" }[] = [
  { id: "pencil", label: "Карандаш", hint: "Нажмите на пиксель или ведите с зажатой кнопкой", icon: "pen" },
  { id: "eraser", label: "Ластик", hint: "Делает пиксели прозрачными", icon: "eraser" },
  { id: "rect", label: "Прямоугольник", hint: "Протяните, чтобы залить прямоугольник выбранным цветом", icon: "rect" },
  { id: "pick", label: "Пипетка", hint: "Нажмите на рисунок, чтобы взять цвет", icon: "pipette" },
];

/** Размер клетки карты в пикселях рисунка. */
export const CELL = 16;

/** Холст спрайта: рисование кадра или (при `foot`) выбор проходимых клеток опоры поверх рисунка. */
export function SpriteCanvas({
  sprite,
  frame,
  tool,
  color,
  alpha,
  readOnly,
  foot,
  onPickColor,
}: {
  sprite: CustomSprite;
  frame: string;
  tool: Tool;
  color: string;
  alpha: number;
  readOnly: boolean;
  foot: boolean;
  onPickColor: (color: string, alpha: number) => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const stroke = useRef({ id: 0, last: "" });
  const [drag, setDrag] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const scale = spriteMaxScale(sprite.w, sprite.h);
  const current = sprite.frames[frame] ? frame : "default";

  useEffect(() => {
    const ctx = canvas.current?.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, sprite.w, sprite.h);
    drawSprite(ctx, specOf(sprite), current);
    if (drag && tool === "rect") {
      const [x, y, w, h] = rectOf(drag);
      ctx.fillStyle = withAlpha(color, alpha);
      ctx.fillRect(x, y, w, h);
    }
  }, [sprite, current, drag, tool, color, alpha]);

  const cellAt = (e: React.PointerEvent) => {
    const r = canvas.current!.getBoundingClientRect();
    return {
      x: Math.min(sprite.w - 1, Math.max(0, Math.floor(((e.clientX - r.left) / r.width) * sprite.w))),
      y: Math.min(sprite.h - 1, Math.max(0, Math.floor(((e.clientY - r.top) / r.height) * sprite.h))),
    };
  };
  const addOp = (op: Op, merge: string) =>
    editor.update((d) => setFrameOps(d, sprite.key, current, [...(d.sprites?.find((s) => s.key === sprite.key)?.frames[current] ?? []), op]), merge);
  const paint = (x: number, y: number) => {
    const id = `${x},${y}`;
    if (stroke.current.last === id) return;
    stroke.current.last = id;
    addOp(tool === "eraser" ? [x, y, 1, 1] : [x, y, 1, 1, withAlpha(color, alpha)], `draw:${sprite.key}:${current}:${stroke.current.id}`);
  };
  const pick = (x: number, y: number) => {
    const px = canvas.current!.getContext("2d")!.getImageData(x, y, 1, 1).data;
    if (px[3]) onPickColor(`#${[px[0], px[1], px[2]].map((v) => v.toString(16).padStart(2, "0")).join("")}`, px[3]);
  };
  const draw = !readOnly && !foot;

  // опора: рисунок стоит нижним краем на нижней клетке опоры, по центру её ширины
  const fw = sprite.footprint.w;
  const fh = sprite.footprint.h;
  const x0 = (sprite.w - fw * CELL) / 2;
  const y0 = sprite.h - fh * CELL + (sprite.mount ?? 0);

  return (
    <div className="sprite-stage" style={{ width: sprite.w * scale, height: sprite.h * scale }}>
      <canvas
        ref={canvas}
        className="sprite-stage__canvas"
        data-draw={draw || undefined}
        width={sprite.w}
        height={sprite.h}
        onPointerDown={(e) => {
          if (!draw) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          const p = cellAt(e);
          stroke.current = { id: stroke.current.id + 1, last: "" };
          if (tool === "pick") return pick(p.x, p.y);
          if (tool === "rect") return setDrag({ x0: p.x, y0: p.y, x1: p.x, y1: p.y });
          paint(p.x, p.y);
        }}
        onPointerMove={(e) => {
          if (!draw || !(e.buttons & 1)) return;
          const p = cellAt(e);
          if (tool === "rect") setDrag((d) => d && { ...d, x1: p.x, y1: p.y });
          else if (tool !== "pick") paint(p.x, p.y);
        }}
        onPointerUp={() => {
          if (tool === "rect" && drag) {
            addOp([...rectOf(drag), withAlpha(color, alpha)] as Op, `draw:${sprite.key}:${current}:${stroke.current.id}`);
            setDrag(null);
          }
        }}
      />
      {foot &&
        Array.from({ length: fh }, (_, r) =>
          Array.from({ length: fw }, (_, c) => {
            const dx = c;
            const dy = fh - 1 - r;
            const solid = cellSolid(sprite, dx, dy);
            return (
              <button
                key={`${dx},${dy}`}
                className="sprite-stage__cell"
                data-tone={solid ? "bad" : "good"}
                disabled={readOnly}
                style={{ left: (x0 + dx * CELL) * scale, top: (y0 + r * CELL) * scale, width: CELL * scale, height: CELL * scale }}
                title={solid ? "Не пропускает игрока — нажмите, чтобы разрешить проход" : "Игрок проходит — нажмите, чтобы закрыть проход"}
                onClick={() => editor.update((d) => patchSprite(d, sprite.key, { cells: toggleCell(sprite, dx, dy) }))}
              >
                {solid ? "×" : "✓"}
              </button>
            );
          }),
        )}
    </div>
  );
}

const rectOf = (d: { x0: number; y0: number; x1: number; y1: number }): [number, number, number, number] => [
  Math.min(d.x0, d.x1),
  Math.min(d.y0, d.y1),
  Math.abs(d.x1 - d.x0) + 1,
  Math.abs(d.y1 - d.y0) + 1,
];
