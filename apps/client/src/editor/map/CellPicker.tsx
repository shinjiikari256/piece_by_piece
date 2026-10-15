import { useEffect, useRef, useState } from "react";
import type { CaseFile, Location } from "../../../../../shared/case";
import { Dialog } from "../../ui/window";
import { T, useSpriteCanvases } from "./canvases";
import { cellFree } from "./helpers";
import { firstFloorCell } from "../../content/case-utils";
import { renderMap } from "./render";

const ZOOM = 2;

/**
 * Окно выбора клетки на карте локации: клик (или стрелки и Enter) выбирает клетку, куда придёт персонаж.
 * Клетки, куда встать нельзя (стена, твёрдый предмет, другой человек), не выбираются.
 */
export function CellPicker({
  draft,
  loc,
  characterId,
  value,
  onPick,
  onClose,
}: {
  draft: CaseFile;
  loc: Location;
  characterId: string;
  value?: { x: number; y: number };
  onPick: (cell: { x: number; y: number }) => void;
  onClose: () => void;
}) {
  const art = useSpriteCanvases();
  const canvas = useRef<HTMLCanvasElement>(null);
  const w = loc.tiles[0]?.length ?? 0;
  const h = loc.tiles.length;
  const [cursor, setCursor] = useState<{ x: number; y: number }>(value ?? loc.playerStart ?? firstFloorCell(loc));
  const [chosen, setChosen] = useState<{ x: number; y: number } | null>(value && cellFree(loc, value.x, value.y, characterId) ? value : null);
  const free = (x: number, y: number) => cellFree(loc, x, y, characterId);

  useEffect(() => {
    const cv = canvas.current;
    if (!cv) return;
    renderMap(cv, { loc, art, characters: draft.characters, tool: { kind: "select" }, npcCharacter: "", hover: null, rect: null, selected: null });
    const ctx = cv.getContext("2d")!;
    // недоступные клетки затемняем, чтобы сразу было видно, куда можно
    ctx.fillStyle = "rgba(20,12,4,0.45)";
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (!free(x, y)) ctx.fillRect(x * T, y * T, T, T);
    const mark = (cell: { x: number; y: number }, color: string, width: number) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.strokeRect(cell.x * T + width / 2, cell.y * T + width / 2, T - width, T - width);
    };
    mark(cursor, free(cursor.x, cursor.y) ? "#ffffff" : "#e0584a", 1);
    if (chosen) mark(chosen, "#f6d55c", 2);
  }, [loc, art, draft.characters, cursor, chosen]); // eslint-disable-line react-hooks/exhaustive-deps

  const cellAt = (e: { clientX: number; clientY: number }) => {
    const r = canvas.current!.getBoundingClientRect();
    return {
      x: Math.min(w - 1, Math.max(0, Math.floor(((e.clientX - r.left) / r.width) * w))),
      y: Math.min(h - 1, Math.max(0, Math.floor(((e.clientY - r.top) / r.height) * h))),
    };
  };
  const choose = (cell: { x: number; y: number }) => free(cell.x, cell.y) && setChosen(cell);

  return (
    <Dialog
      title={`Клетка в локации «${loc.name}»`}
      className="cell-picker"
      onClose={onClose}
      actions={
        <>
          <button className="btn btn--primary" disabled={!chosen} onClick={() => chosen && onPick(chosen)}>
            Выбрать
          </button>
          <button className="btn" onClick={onClose}>
            Отмена
          </button>
        </>
      }
    >
      <p className="muted">Кликните по клетке, куда придёт персонаж. Затемнены клетки, где встать нельзя. Стрелки двигают курсор, Enter — выбирает.</p>
      <div className="cell-picker__stage">
        <canvas
          ref={canvas}
          className="cell-picker__canvas"
          style={{ width: w * T * ZOOM, height: h * T * ZOOM }}
          tabIndex={0}
          aria-label="Карта локации: выберите клетку"
          onMouseMove={(e) => setCursor(cellAt(e))}
          onClick={(e) => choose(cellAt(e))}
          onKeyDown={(e) => {
            const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
            if (d) {
              e.preventDefault();
              setCursor((c) => ({ x: Math.min(w - 1, Math.max(0, c.x + d[0])), y: Math.min(h - 1, Math.max(0, c.y + d[1])) }));
            } else if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              if (chosen && e.key === "Enter" && chosen.x === cursor.x && chosen.y === cursor.y) onPick(chosen);
              else choose(cursor);
            }
          }}
        />
      </div>
      <p className="cell-picker__status">
        Курсор: {cursor.x}, {cursor.y}
        {chosen && <b> · выбрана клетка {chosen.x}, {chosen.y}</b>}
      </p>
    </Dialog>
  );
}
