import { useEffect, useMemo, useRef, useState } from "react";
import type { CustomSprite } from "../../../../../shared/case";
import { drawSprite, specOf } from "../../game/art";
import { editor } from "../state";
import { Tabs } from "../Tabs";
import { setFrameOps, spriteMaxScale, withAlpha, type Op } from "./helpers";

type Tool = "pencil" | "eraser" | "rect" | "pick";
const TOOLS: { id: Tool; label: string; hint: string }[] = [
  { id: "pencil", label: "Карандаш", hint: "Пиксель; тяните, чтобы рисовать линию" },
  { id: "eraser", label: "Ластик", hint: "Делает пиксель прозрачным" },
  { id: "rect", label: "Прямоугольник", hint: "Тяните, чтобы залить прямоугольник цветом" },
  { id: "pick", label: "Пипетка", hint: "Взять цвет с рисунка" },
];

/** Рисование кадров спрайта: операции `[x, y, w, h, цвет]` и ластик, кадры, цвет с прозрачностью. */
export function SpriteDraw({ sprite }: { sprite: CustomSprite }) {
  const [frame, setFrame] = useState("default");
  const [tool, setTool] = useState<Tool>("pencil");
  const [color, setColor] = useState("#7a5230");
  const [alpha, setAlpha] = useState(255);
  const [drag, setDrag] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const [newFrame, setNewFrame] = useState("");
  const canvas = useRef<HTMLCanvasElement>(null);
  const stroke = useRef({ id: 0, last: "" });
  const current = sprite.frames[frame] ? frame : "default";
  const ops = sprite.frames[current];
  const scale = spriteMaxScale(sprite.w, sprite.h);

  // кадр в натуральном размере; увеличение — стилем (пиксельное)
  useEffect(() => {
    const c = canvas.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    ctx.clearRect(0, 0, c.width, c.height);
    drawSprite(ctx, specOf(sprite), current);
    if (drag && tool === "rect") {
      const [x, y, w, h] = rectOf(drag);
      ctx.fillStyle = withAlpha(color, alpha);
      ctx.fillRect(x, y, w, h);
    }
  }, [sprite, current, drag, tool, color, alpha]);

  const palette = useMemo(() => {
    const seen = new Set<string>();
    for (const list of Object.values(sprite.frames)) for (const o of list) if (o[4]) seen.add(o[4].toLowerCase());
    return [...seen].slice(0, 24);
  }, [sprite.frames]);

  const cellAt = (e: React.PointerEvent) => {
    const r = canvas.current!.getBoundingClientRect();
    return {
      x: Math.min(sprite.w - 1, Math.max(0, Math.floor(((e.clientX - r.left) / r.width) * sprite.w))),
      y: Math.min(sprite.h - 1, Math.max(0, Math.floor(((e.clientY - r.top) / r.height) * sprite.h))),
    };
  };
  const addOp = (op: Op, merge: string) => editor.update((d) => setFrameOps(d, sprite.key, current, [...(d.sprites?.find((s) => s.key === sprite.key)?.frames[current] ?? []), op]), merge);
  const paint = (x: number, y: number) => {
    const id = `${x},${y}`;
    if (stroke.current.last === id) return;
    stroke.current.last = id;
    addOp(tool === "eraser" ? [x, y, 1, 1] : [x, y, 1, 1, withAlpha(color, alpha)], `draw:${sprite.key}:${current}:${stroke.current.id}`);
  };
  const pick = (x: number, y: number) => {
    const d = canvas.current!.getContext("2d")!.getImageData(x, y, 1, 1).data;
    if (!d[3]) return;
    setColor(`#${[d[0], d[1], d[2]].map((v) => v.toString(16).padStart(2, "0")).join("")}`);
    setAlpha(d[3]);
  };

  return (
    <div className="stack sprite-draw">
      <div className="row sprite-draw__tools">
        {TOOLS.map((t) => (
          <button key={t.id} className="btn btn--sm" aria-pressed={tool === t.id} title={t.hint} onClick={() => setTool(t.id)}>
            {t.label}
          </button>
        ))}
        <label className="row" title="Цвет">
          <input type="color" value={color.slice(0, 7)} onChange={(e) => setColor(e.target.value)} />
        </label>
        <label className="row" title="Непрозрачность: 255 — сплошной цвет">
          Прозрачность
          <input type="range" min={1} max={255} value={alpha} onChange={(e) => setAlpha(Number(e.target.value))} />
          <span>{alpha}</span>
        </label>
      </div>
      {palette.length > 0 && (
        <div className="row sprite-draw__palette" aria-label="Цвета спрайта">
          {palette.map((c) => (
            <button
              key={c}
              className="sprite-draw__swatch"
              style={{ background: c }}
              title={c}
              onClick={() => {
                setColor(c.slice(0, 7));
                setAlpha(c.length > 7 ? parseInt(c.slice(7, 9), 16) : 255);
              }}
            />
          ))}
        </div>
      )}
      <canvas
        ref={canvas}
        className="sprite-draw__canvas"
        width={sprite.w}
        height={sprite.h}
        style={{ width: sprite.w * scale, height: sprite.h * scale, ["--cell" as string]: `${scale}px` }}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          const p = cellAt(e);
          stroke.current = { id: stroke.current.id + 1, last: "" };
          if (tool === "pick") return pick(p.x, p.y);
          if (tool === "rect") return setDrag({ x0: p.x, y0: p.y, x1: p.x, y1: p.y });
          paint(p.x, p.y);
        }}
        onPointerMove={(e) => {
          if (!(e.buttons & 1)) return;
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
      <p className="muted">
        Кадр «{current}»: {ops.length} опер. {sprite.w}×{sprite.h} пикс. (16 пикс. — клетка)
      </p>
      <Tabs
        tabs={Object.keys(sprite.frames).map((f) => ({ id: f, label: f }))}
        active={current}
        onChange={setFrame}
        trailing={
          <span className="row">
            <input placeholder="имя нового кадра" value={newFrame} onChange={(e) => setNewFrame(e.target.value.replace(/[^a-zA-Z0-9_]/g, ""))} />
            <button
              className="btn btn--sm"
              disabled={!newFrame || newFrame in sprite.frames}
              title="Новый кадр — копия текущего"
              onClick={() => {
                editor.update((d) => ({ ...d, sprites: d.sprites?.map((s) => (s.key === sprite.key ? { ...s, frames: { ...s.frames, [newFrame]: [...ops] } } : s)) }));
                setFrame(newFrame);
                setNewFrame("");
              }}
            >
              + Кадр
            </button>
          </span>
        }
      />
      <div className="row">
        <button className="btn btn--sm" disabled={!ops.length} onClick={() => editor.update((d) => setFrameOps(d, sprite.key, current, []))}>
          Очистить кадр
        </button>
        <button className="btn btn--sm" disabled={!ops.length} onClick={() => editor.update((d) => setFrameOps(d, sprite.key, current, ops.slice(0, -1)))}>
          Убрать последнюю операцию
        </button>
        {current !== "default" && (
          <button
            className="btn btn--sm btn--danger"
            onClick={() => {
              editor.update((d) => ({ ...d, sprites: d.sprites?.map((s) => (s.key === sprite.key ? { ...s, frames: Object.fromEntries(Object.entries(s.frames).filter(([k]) => k !== current)) as CustomSprite["frames"] } : s)) }));
              setFrame("default");
            }}
          >
            Удалить кадр
          </button>
        )}
      </div>
    </div>
  );
}

const rectOf = (d: { x0: number; y0: number; x1: number; y1: number }): [number, number, number, number] => [
  Math.min(d.x0, d.x1),
  Math.min(d.y0, d.y1),
  Math.abs(d.x1 - d.x0) + 1,
  Math.abs(d.y1 - d.y0) + 1,
];
