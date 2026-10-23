import { useEffect, useMemo, useRef, useState } from "react";
import type { CustomTile } from "../../../../../shared/case";
import { BASE_TILE, TILES, TILE_NAMES, drawTileKey } from "../../game/art";
import { ask, tell } from "../../ui/kit/dialog";
import { Icon } from "../../ui/kit/icons";
import { Select } from "../../ui/kit/Select";
import { PaletteGroup } from "../map/panels";
import { ColorPicker } from "../fields/ColorPicker";
import { Tabs } from "../Tabs";
import { editor, editorStore, useEditor } from "../state";
import { useUrlParam } from "../url";
import { withAlpha } from "./helpers";
import { TOOLS, type Tool } from "./SpriteCanvas";
import {
  charsOf,
  copyTile,
  describeWhen,
  isBuiltinTile,
  newTile,
  patchLayer,
  patchTile,
  removeTile,
  setLayerOps,
  setTileChar,
  tileGroups,
  tileUses,
  tileView,
  topRectAt,
  type TileLayer,
  type TileOp,
} from "./tile-helpers";
import { cellAt as cellAtCanvas } from "../../util/geometry";
import { blurOnEnter } from "../../util/keys";

const SCALE = 24;
const T = BASE_TILE;
type Side = "above" | "below" | "left" | "right";
const SIDES: { id: Side; label: string }[] = [
  { id: "above", label: "Сверху" },
  { id: "below", label: "Снизу" },
  { id: "left", label: "Слева" },
  { id: "right", label: "Справа" },
];
/** Соседи для предпросмотра: класс → ключ тайла, который его изображает (край карты — нет соседа). */
type Ctx = Record<Side, "solid" | "floor" | "edge">;
const FLAT: Ctx = { above: "floor", below: "floor", left: "floor", right: "floor" };
const PROXY: Record<string, string | undefined> = { solid: "wall", floor: "tile", edge: undefined };
const neighbors = (c: Ctx) => ({ above: PROXY[c.above], below: PROXY[c.below], left: PROXY[c.left], right: PROXY[c.right] });
const CLASS_OPTIONS = [
  { value: "", label: "не важно" },
  { value: "solid", label: "стена" },
  { value: "floor", label: "пол" },
  { value: "edge", label: "край карты" },
];
const PREVIEWS: { label: string; ctx: Ctx }[] = [
  { label: "Среди пола", ctx: FLAT },
  { label: "Стена сверху", ctx: { ...FLAT, above: "solid" } },
  { label: "Стена снизу", ctx: { ...FLAT, below: "solid" } },
  { label: "Стена слева", ctx: { ...FLAT, left: "solid" } },
  { label: "Стена справа", ctx: { ...FLAT, right: "solid" } },
  { label: "Угол", ctx: { ...FLAT, above: "solid", left: "solid" } },
  { label: "У края карты", ctx: { ...FLAT, below: "edge" } },
];

const rectOf = (d: { x0: number; y0: number; x1: number; y1: number }): [number, number, number, number] => [
  Math.min(d.x0, d.x1),
  Math.min(d.y0, d.y1),
  Math.abs(d.x1 - d.x0) + 1,
  Math.abs(d.y1 - d.y0) + 1,
];

/** Холст тайла: показан целиком (с выбранными соседями), рисование идёт в выбранный слой. */
function TileCanvas({
  tile,
  layer,
  ctx,
  tool,
  color,
  alpha,
  readOnly,
  onPick,
}: {
  tile: CustomTile;
  layer: number;
  ctx: Ctx;
  tool: Tool;
  color: string;
  alpha: number;
  readOnly: boolean;
  onPick: (c: string, a: number) => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const stroke = useRef({ id: 0, last: "" });
  const [drag, setDrag] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const paintColor = withAlpha(color, alpha);
  const ops = tile.layers[layer]?.ops ?? [];

  useEffect(() => {
    const c = canvas.current?.getContext("2d");
    if (!c) return;
    c.clearRect(0, 0, T, T);
    drawTileKey(c, tile.key, 0, 0, neighbors(ctx));
    if (drag && tool === "rect") {
      const [x, y, w, h] = rectOf(drag);
      c.fillStyle = paintColor;
      c.fillRect(x, y, w, h);
    }
  }, [tile, ctx, drag, tool, paintColor]);

  const cellAt = (e: React.PointerEvent) => cellAtCanvas(canvas.current!, e, T, T);
  const current = () => editorStore.get().draft.tiles?.find((t) => t.key === tile.key)?.layers[layer]?.ops ?? [];
  const write = (next: TileOp[]) => editor.update((d) => setLayerOps(d, tile.key, layer, next), `tile:${tile.key}:${layer}:${stroke.current.id}`);
  const paint = (x: number, y: number) => {
    const id = `${x},${y}`;
    if (stroke.current.last === id) return;
    stroke.current.last = id;
    if (tool === "eraser") {
      const i = topRectAt(current(), x, y);
      if (i >= 0) write(current().filter((_, k) => k !== i));
    } else write([...current(), [x, y, 1, 1, paintColor] as TileOp]);
  };
  const pick = (x: number, y: number) => {
    const o = ops[topRectAt(ops, x, y)];
    if (Array.isArray(o)) onPick(o[4].slice(0, 7), o[4].length > 7 ? parseInt(o[4].slice(7, 9), 16) : 255);
  };
  const draw = !readOnly;

  return (
    <div className="sprite-stage" style={{ width: T * SCALE, height: T * SCALE }}>
      <canvas
        ref={canvas}
        className="sprite-stage__canvas"
        data-draw={draw || undefined}
        width={T}
        height={T}
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
            write([...current(), [...rectOf(drag), paintColor] as TileOp]);
            setDrag(null);
          }
        }}
      />
      <span className="sprite-stage__grid" style={{ backgroundSize: `${SCALE}px ${SCALE}px` }} />
    </div>
  );
}

/** Тайл в нескольких окружениях — как он выглядит у стены, в углу, у края карты. */
function TilePreview({ tile }: { tile: CustomTile }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = canvas.current?.getContext("2d");
    if (!c) return;
    c.clearRect(0, 0, canvas.current!.width, canvas.current!.height);
    PREVIEWS.forEach((p, i) => drawTileKey(c, tile.key, i * T, 0, neighbors(p.ctx)));
  }, [tile]);
  return (
    <canvas
      ref={canvas}
      className="sprite-stage__canvas"
      width={T * PREVIEWS.length}
      height={T}
      style={{ width: T * PREVIEWS.length * 3, height: T * 3 }}
      title={PREVIEWS.map((p) => p.label).join(" · ")}
    />
  );
}

const neighborValue = (v: string | string[] | undefined): string => (typeof v === "string" ? v : v ? "__many" : "");

function LayerRules({ layer, readOnly, onChange }: { layer: TileLayer; readOnly: boolean; onChange: (when: TileLayer["when"]) => void }) {
  const set = (side: Side, v: string) => {
    const next = { ...layer.when };
    if (v) next[side] = v;
    else delete next[side];
    onChange(Object.keys(next).length ? next : undefined);
  };
  return (
    <fieldset className="sprite-ro stack" disabled={readOnly}>
      {SIDES.map((s) => {
        const raw = layer.when?.[s.id];
        const value = neighborValue(raw);
        const options =
          value === "__many"
            ? [...CLASS_OPTIONS, { value: "__many", label: `несколько (${[raw].flat().join(", ")})` }]
            : value && !CLASS_OPTIONS.some((o) => o.value === value)
              ? [...CLASS_OPTIONS, { value, label: TILE_NAMES[value] ?? TILES[value]?.name ?? value }]
              : CLASS_OPTIONS;
        return (
          <label key={s.id} className="ef">
            <span className="ef__label">{s.label}</span>
            <Select value={value} options={options} onChange={(v) => v !== "__many" && set(s.id, v)} />
          </label>
        );
      })}
    </fieldset>
  );
}

/** Раздел «Тайлы»: клетки карты — пол и стены. Рисунок 16×16 слоями; слой может зависеть от соседних клеток. Символ тайла на карте — по легенде дела. */
export function TilesSection() {
  const draft = useEditor((s) => s.draft);
  const [selected, setSelected] = useUrlParam("item", "");
  const [layerIdx, setLayerIdx] = useState(0);
  const [ctx, setCtx] = useState<Ctx>(FLAT);
  const [tool, setTool] = useState<Tool>("pencil");
  const [color, setColor] = useState("#8a8a8a");
  const [alpha, setAlpha] = useState(255);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [charDraft, setCharDraft] = useState<string | null>(null);

  const groups = tileGroups(draft);
  const first = draft.tiles?.[0]?.key ?? groups[0]?.keys[0] ?? "";
  const tile = tileView(draft, selected) ?? tileView(draft, first);
  const builtin = tile ? isBuiltinTile(tile.key) : true;
  const layer = tile ? Math.min(layerIdx, tile.layers.length - 1) : 0;
  const palette = useMemo(() => [...new Set((tile?.layers ?? []).flatMap((l) => l.ops).flatMap((o) => (Array.isArray(o) ? [o[4].slice(0, 7)] : [])))].slice(0, 28), [tile]);
  // окружение на холсте подстраивается под условие слоя, чтобы выбранный слой был виден
  const whenKey = JSON.stringify(tile?.layers[layer]?.when ?? null);
  useEffect(() => {
    const when = (JSON.parse(whenKey) ?? {}) as Partial<Record<Side, unknown>>;
    const next = { ...FLAT };
    for (const side of SIDES) {
      const v = when[side.id];
      const c = typeof v === "string" ? v : Array.isArray(v) ? v[0] : undefined;
      if (c === "solid" || c === "floor" || c === "edge") next[side.id] = c;
      else if (c) next[side.id] = TILES[c]?.solid ? "solid" : "floor";
    }
    setCtx(next);
  }, [tile?.key, layer, whenKey]);
  const chars = tile ? charsOf(draft, tile.key) : [];
  const baseOptions = [
    { value: "", label: "нет" },
    ...groups
      .flatMap((g) => g.keys)
      .filter((k) => k !== tile?.key)
      .map((k) => ({ value: k, label: tileView(draft, k)?.name ?? k })),
  ];

  const choose = (k: string) => (setSelected(k), setLayerIdx(0), setCharDraft(null));
  const created = (r: { tile: CustomTile; draft: typeof draft } | null) => {
    if (!r) return void tell({ title: "Нет свободных символов", text: "В легенде карты закончились символы." });
    editor.update(() => r.draft);
    choose(r.tile.key);
  };
  const remove = async (t: CustomTile) => {
    const uses = tileUses(editorStore.get().draft, t.key);
    if (uses.length) return tell({ title: "Тайл используется", text: `«${t.name}»: ${uses.join(", ")}. Сначала замените его на картах.` });
    if (!(await ask({ title: `Удалить тайл «${t.name}»?`, text: "Рисунок пропадёт.", confirmLabel: "Удалить", danger: true }))) return;
    editor.update((d) => removeTile(d, t.key));
  };
  const patch = (p: Partial<CustomTile>) => tile && editor.update((d) => patchTile(d, tile.key, p));
  const applyChar = (value: string) => {
    if (!tile) return;
    const ch = [...value][0];
    setCharDraft(null);
    if (!ch) return;
    const next = setTileChar(editorStore.get().draft, tile.key, ch);
    if (!next) return void tell({ title: "Символ занят", text: `«${ch}» уже стоит в легенде у другого тайла.` });
    editor.update(() => next);
  };

  return (
    <section className="lm" style={{ ["--col-right" as string]: "26rem" }}>
      <aside className="lm__palette">
        <button className="btn btn--sm" onClick={() => created(newTile(editorStore.get().draft))}>
          <Icon name="plus" size={14} /> Новый тайл
        </button>
        {groups.map((g) => {
          const isOpen = open[g.id] ?? (g.id === "own" || tile ? g.keys.includes(tile?.key ?? "") || g.id === "own" : true);
          return (
            <PaletteGroup key={g.id} title={g.label} count={g.keys.length} open={isOpen} onToggle={() => setOpen((o) => ({ ...o, [g.id]: !isOpen }))}>
              <div className="sprite-list">
                {g.keys.map((k) => {
                  const v = tileView(draft, k)!;
                  const own = !isBuiltinTile(k);
                  return (
                    <div key={k} className="sprite-row" aria-current={tile?.key === k ? true : undefined}>
                      <button className="sprite-row__main" title={v.name} onClick={() => choose(k)}>
                        <span className="sprite-row__name ellipsis">{v.name}</span>
                      </button>
                      <button
                        className="btn btn--icon btn--sm"
                        title="Копировать: свой тайл, который можно править"
                        aria-label="Копировать"
                        onClick={() => created(copyTile(editorStore.get().draft, v))}
                      >
                        <Icon name="copy" size={14} />
                      </button>
                      {own ? (
                        <button className="btn btn--icon btn--sm btn--danger" title="Удалить тайл" aria-label="Удалить" onClick={() => remove(v)}>
                          <Icon name="trash" size={14} />
                        </button>
                      ) : (
                        <span className="sprite-row__lock" title="Встроенный тайл: менять и удалять нельзя, можно копировать">
                          <Icon name="lock" size={14} />
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </PaletteGroup>
          );
        })}
      </aside>

      <div className="lm__main">
        {tile ? (
          <>
            <Tabs
              variant="bar"
              className="lm__tabs"
              tabs={tile.layers.map((l, i) => ({ id: String(i), label: `Слой ${i + 1}: ${describeWhen(l.when)}` }))}
              active={String(layer)}
              onChange={(id) => setLayerIdx(Number(id))}
            />
            <div className="lm__center">
              <div className="lm__stage">
                <TileCanvas tile={tile} layer={layer} ctx={ctx} tool={tool} color={color} alpha={alpha} readOnly={builtin} onPick={(c, a) => (setColor(c), setAlpha(a))} />
              </div>
              <div className="lm__status">
                <span className="lm__hint">
                  {builtin ? "Встроенный тайл нельзя изменить — сделайте копию и правьте её" : (TOOLS.find((t) => t.id === tool)?.hint ?? "")}
                  <span className="sprite-status__size">
                    {T}×{T} пикс. · рисунок идёт в выбранный слой, окружение для показа задаётся справа
                  </span>
                </span>
              </div>
            </div>
          </>
        ) : (
          <p className="muted">Выберите тайл слева.</p>
        )}
      </div>

      <aside className="lm__inspector">
        {tile && (
          <div className="lm__inspector-body">
            <div className="sprite-head">
              <span className="sprite-head__title ellipsis">
                {builtin && <Icon name="lock" size={14} />} {tile.name || "Без названия"}
              </span>
            </div>
            <h3>Предпросмотр</h3>
            <TilePreview tile={tile} />
            <h3>Окружение на холсте</h3>
            <div className="stack">
              {SIDES.map((s) => (
                <label key={s.id} className="ef">
                  <span className="ef__label">{s.label}</span>
                  <Select value={ctx[s.id]} options={CLASS_OPTIONS.filter((o) => o.value)} onChange={(v) => setCtx({ ...ctx, [s.id]: v as Ctx[Side] })} />
                </label>
              ))}
            </div>
            <h3>Инструмент</h3>
            <div className="sprite-toolbar" role="toolbar" aria-label="Инструменты">
              {TOOLS.filter((t) => t.id !== "foot").map((t) => (
                <button key={t.id} className="btn btn--icon btn--sm" aria-pressed={tool === t.id} disabled={builtin} title={`${t.label}. ${t.hint}`} aria-label={t.label} onClick={() => setTool(t.id)}>
                  <Icon name={t.icon} size={16} />
                </button>
              ))}
              <span className="sprite-toolbar__gap" />
              <button
                className="btn btn--icon btn--sm"
                disabled={builtin || !tile.layers[layer]?.ops.length}
                title="Отменить последний мазок слоя"
                aria-label="Отменить последнее"
                onClick={() => editor.update((d) => setLayerOps(d, tile.key, layer, tile.layers[layer].ops.slice(0, -1)))}
              >
                <Icon name="undo" size={16} />
              </button>
              <button
                className="btn btn--icon btn--sm"
                disabled={builtin || !tile.layers[layer]?.ops.length}
                title="Очистить слой"
                aria-label="Очистить слой"
                onClick={() => editor.update((d) => setLayerOps(d, tile.key, layer, []))}
              >
                <Icon name="trash" size={16} />
              </button>
            </div>
            <fieldset className="sprite-ro stack" disabled={builtin}>
              <h3>Цвет</h3>
              <ColorPicker color={color} alpha={alpha} swatches={palette} onChange={(c, a) => (setColor(c), setAlpha(a))} />
              <h3>Свойства</h3>
              <label className="ef">
                <span className="ef__label">Название</span>
                <input value={tile.name} onChange={(e) => patch({ name: e.target.value })} />
              </label>
              <label className="ef">
                <span className="ef__label">Ключ</span>
                <input value={tile.key} readOnly />
              </label>
              <label className="row">
                <input type="checkbox" checked={tile.solid} onChange={(e) => patch({ solid: e.target.checked })} /> Непроходимая клетка (стена, забор)
              </label>
              <label className="ef">
                <span className="ef__label">Основа — рисуется под тайлом</span>
                <Select value={tile.base ?? ""} options={baseOptions} onChange={(v) => patch({ base: v || undefined, baseFrom: v ? tile.baseFrom : undefined })} />
              </label>
              {tile.base && (
                <label className="row">
                  <input type="checkbox" checked={tile.baseFrom === "below"} onChange={(e) => patch({ baseFrom: e.target.checked ? "below" : undefined })} /> Вместо основы — пол клетки снизу (проём
                  берёт пол коридора)
                </label>
              )}
            </fieldset>
            <label className="ef">
              <span className="ef__label">Символ на карте (легенда)</span>
              <input
                value={charDraft ?? chars.join(" ")}
                maxLength={2}
                placeholder="—"
                onFocus={(e) => (setCharDraft(chars[0] ?? ""), e.currentTarget.select())}
                onChange={(e) => setCharDraft(e.target.value)}
                onBlur={(e) => applyChar(e.target.value)}
                onKeyDown={blurOnEnter}
              />
            </label>
            <fieldset className="sprite-ro stack" disabled={builtin}>
              <h3>Слой {layer + 1}: условие по соседям</h3>
              <p className="muted">Слой рисуется, только если все заданные соседи подходят; все подходящие слои рисуются по порядку.</p>
              <LayerRules layer={tile.layers[layer]} readOnly={builtin} onChange={(when) => editor.update((d) => patchLayer(d, tile.key, layer, { when }))} />
              <div className="row">
                <button className="btn btn--sm" onClick={() => (patch({ layers: [...tile.layers, { ops: [] }] }), setLayerIdx(tile.layers.length))}>
                  <Icon name="plus" size={14} /> Слой
                </button>
                {tile.layers.length > 1 && (
                  <button className="btn btn--sm btn--danger" onClick={() => (patch({ layers: tile.layers.filter((_, i) => i !== layer) }), setLayerIdx(0))}>
                    <Icon name="trash" size={14} /> Удалить слой
                  </button>
                )}
              </div>
              {tile.layers[layer].ops.some((o) => !Array.isArray(o)) && <p className="muted">В слое есть узоры (шум, доски…): они остаются при копировании, но здесь не рисуются.</p>}
            </fieldset>
          </div>
        )}
      </aside>
    </section>
  );
}
