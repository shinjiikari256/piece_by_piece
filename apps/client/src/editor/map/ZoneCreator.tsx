import { useEffect, useRef, useState } from "react";
import type { CaseFile, Zone } from "../../../../../shared/case";
import { Dialog } from "../../ui/window";
import { Select } from "../../ui/Select";
import { toKey } from "../keys";
import { T, useSpriteCanvases } from "./canvases";
import { rectCells, zoneCells } from "./helpers";
import { renderMap } from "./render";

const ZOOM = 2;

/** Свободный ключ области: из названия, с номером при совпадении (ключи областей общие на всё дело). */
export function zoneKey(draft: CaseFile, name: string) {
  const taken = new Set(draft.locations.flatMap((l) => l.zones.map((z) => z.id)));
  const base = `zone_${toKey(name) || "area"}`;
  if (!taken.has(base)) return base;
  for (let i = 2; ; i++) if (!taken.has(`${base}_${i}`)) return `${base}_${i}`;
}

/**
 * Окно «Новая область»: название, локация и клетки на карте (мазок — добавить, Alt — стереть, Shift — прямоугольник).
 * Область можно создать и на карте инструментом «Область» — это окно нужно, чтобы не уходить из диалога.
 */
export function ZoneCreator({
  draft,
  defaultLocationId,
  onCreate,
  onClose,
}: {
  draft: CaseFile;
  defaultLocationId?: string;
  onCreate: (locationId: string, zone: Zone) => void;
  onClose: () => void;
}) {
  const art = useSpriteCanvases();
  const canvas = useRef<HTMLCanvasElement>(null);
  const [locId, setLocId] = useState(defaultLocationId && draft.locations.some((l) => l.id === defaultLocationId) ? defaultLocationId : draft.locations[0]?.id ?? "");
  const [name, setName] = useState("");
  const [cells, setCells] = useState<{ x: number; y: number }[]>([]);
  const stroke = useRef<{ add: boolean; from: { x: number; y: number }; rect: boolean } | null>(null);
  const [rect, setRect] = useState<{ from: { x: number; y: number }; to: { x: number; y: number } } | null>(null);
  const loc = draft.locations.find((l) => l.id === locId) ?? draft.locations[0];
  const w = loc.tiles[0]?.length ?? 0;
  const h = loc.tiles.length;

  useEffect(() => {
    const cv = canvas.current;
    if (!cv) return;
    const preview = { id: "__new", name: name || "Новая область", cells };
    renderMap(cv, {
      loc: { ...loc, zones: [...loc.zones, preview] },
      art,
      characters: draft.characters,
      tool: { kind: "zone", erase: stroke.current ? !stroke.current.add : false },
      npcCharacter: "",
      hover: null,
      rect: rect && stroke.current ? rect : null,
      selected: null,
      zoneSel: "__new",
    });
  }, [loc, art, draft.characters, cells, name, rect]);

  const cellAt = (e: { clientX: number; clientY: number }) => {
    const r = canvas.current!.getBoundingClientRect();
    return {
      x: Math.min(w - 1, Math.max(0, Math.floor(((e.clientX - r.left) / r.width) * w))),
      y: Math.min(h - 1, Math.max(0, Math.floor(((e.clientY - r.top) / r.height) * h))),
    };
  };
  const finish = () => {
    if (stroke.current?.rect && rect) {
      const x = Math.min(rect.from.x, rect.to.x);
      const y = Math.min(rect.from.y, rect.to.y);
      setCells((c) => zoneCells(c, rectCells({ x, y, w: Math.abs(rect.from.x - rect.to.x) + 1, h: Math.abs(rect.from.y - rect.to.y) + 1 }), stroke.current!.add));
    }
    stroke.current = null;
    setRect(null);
  };
  const ok = name.trim().length > 0 && cells.length > 0;

  return (
    <Dialog
      title="Новая область"
      className="cell-picker"
      onClose={onClose}
      actions={
        <>
          <button className="btn btn--primary" disabled={!ok} onClick={() => onCreate(loc.id, { id: zoneKey(draft, name), name: name.trim(), cells })}>
            Создать
          </button>
          <button className="btn" onClick={onClose}>
            Отмена
          </button>
        </>
      }
    >
      <div className="pair">
        <label className="ef">
          <span className="ef__label">Название</span>
          <input className="input" value={name} placeholder="Например: У входа в архив" autoFocus onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="ef">
          <span className="ef__label">Локация</span>
          <Select
            value={loc.id}
            options={draft.locations.map((l) => ({ value: l.id, label: l.name }))}
            onChange={(v) => {
              setLocId(v);
              setCells([]);
            }}
          />
        </label>
      </div>
      <p className="muted">Ведите мышью по клеткам, чтобы отметить область; Shift — прямоугольником, Alt — стереть. Клеток: {cells.length}.</p>
      <div className="cell-picker__stage">
        <canvas
          ref={canvas}
          className="cell-picker__canvas"
          style={{ width: w * T * ZOOM, height: h * T * ZOOM }}
          onMouseDown={(e) => {
            const t = cellAt(e);
            const add = !e.altKey;
            stroke.current = { add, from: t, rect: e.shiftKey };
            if (e.shiftKey) setRect({ from: t, to: t });
            else setCells((c) => zoneCells(c, [t], add));
          }}
          onMouseMove={(e) => {
            if (!stroke.current || !(e.buttons & 1)) return;
            const t = cellAt(e);
            if (stroke.current.rect) setRect({ from: stroke.current.from, to: t });
            else setCells((c) => zoneCells(c, [t], stroke.current!.add));
          }}
          onMouseUp={finish}
          onMouseLeave={finish}
        />
      </div>
    </Dialog>
  );
}
