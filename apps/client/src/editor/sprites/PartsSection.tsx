import { useEffect, useMemo, useRef, useState } from "react";
import type { CustomPart, PartSlot } from "../../../../../shared/case";
import { CHAR_FRAMES, CHAR_H, CHAR_W, LOOKS, PART_NAMES, PART_ROLES, PART_SLOTS, PART_SLOT_LABELS, ROLE_NAMES, drawCharacter, lookRoles, type Look } from "../../game/art";
import { ask, tell } from "../../ui/kit/dialog";
import { Icon } from "../../ui/kit/icons";
import { PaletteGroup } from "../map/panels";
import { ColorPicker } from "../fields/ColorPicker";
import { Tabs } from "../Tabs";
import { editor, editorStore, useEditor } from "../state";
import { useUrlParam } from "../url";
import { copyPart, isBuiltinPart, newPart, partId, partUses, partView, patchPart, setPartOps, slotKeys, splitPartId, withoutPose, type PartOp } from "./part-helpers";
import { frameLabel, withAlpha } from "./helpers";
import { TOOLS, type Tool } from "./SpriteCanvas";
import { cellAt as cellAtCanvas } from "../../util/geometry";

const SCALE = 20;
const POSES = ["default", ...CHAR_FRAMES];
/** Манекен под рисунок: стандартный дознаватель без причёски и детали. */
const BASE: Look = { ...LOOKS.player, hairStyle: "-", accentStyle: "-", glasses: false, mustache: false, beard: false, bottom: "pants" };
const SAMPLES: Look[] = [
  BASE,
  { ...BASE, skin: "#7d4a2f", hair: "#1b1410", top: "#a43d3d", accent: "#f0d27a", legs: "#3c3c50" },
  { ...BASE, skin: "#f3cfae", hair: "#e0b25a", top: "#4d7a52", accent: "#fff", legs: "#6a5a46", shoes: "#2a2320" },
];
const POSE_NAMES: Record<string, string> = { default: "Любая поза", idle: "Стоит", idle2: "Вдох", walk1: "Шаг 1", walk2: "Шаг 2", talk: "Говорит" };
const poseLabel = (p: string) => POSE_NAMES[p] ?? frameLabel(p);

const rectOf = (d: { x0: number; y0: number; x1: number; y1: number }): [number, number, number, number] => [
  Math.min(d.x0, d.x1),
  Math.min(d.y0, d.y1),
  Math.abs(d.x1 - d.x0) + 1,
  Math.abs(d.y1 - d.y0) + 1,
];

/** Манекен с частью: часть подключена через реестр (дело регистрирует свои части при каждой правке), поэтому рисуется так же, как в игре. */
function drawOn(ctx: CanvasRenderingContext2D, part: CustomPart, look: Look, pose: string, ox: number) {
  const on: Look = { ...look };
  if (part.slot === "hair") on.hairStyle = part.key;
  else if (part.slot === "accent") on.accentStyle = part.key;
  else if (part.slot === "bottom") on.bottom = part.key;
  else on.faceParts = [part.key];
  drawCharacter(ctx, on, pose === "default" ? "idle" : (pose as never), ox);
}

function PartCanvas({
  part,
  pose,
  tool,
  color,
  alpha,
  readOnly,
  onPick,
}: {
  part: CustomPart;
  pose: string;
  tool: Tool;
  color: string;
  alpha: number;
  readOnly: boolean;
  onPick: (c: string, a: number) => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const stroke = useRef({ id: 0, last: "" });
  const [drag, setDrag] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const shown = part.frames[pose] ? pose : "default";
  const ops = part.frames[shown] ?? [];
  const paintColor = color.startsWith("$") ? color : withAlpha(color, alpha);

  useEffect(() => {
    const ctx = canvas.current?.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, CHAR_W, CHAR_H);
    drawOn(ctx, part, BASE, shown === "default" ? "idle" : shown, 0);
    if (drag && tool === "rect") {
      const [x, y, w, h] = rectOf(drag);
      ctx.fillStyle = color.startsWith("$") ? (lookRoles(BASE)[color] ?? color) : withAlpha(color, alpha);
      ctx.fillRect(x, y, w, h);
    }
  }, [part, shown, drag, tool, color, alpha]);

  const cellAt = (e: React.PointerEvent) => cellAtCanvas(canvas.current!, e, CHAR_W, CHAR_H);
  const write = (next: PartOp[], merge: string) => editor.update((d) => setPartOps(d, part.slot, part.key, shown, next), merge);
  const current = () => editorStore.get().draft.parts?.find((p) => p.slot === part.slot && p.key === part.key)?.frames[shown] ?? [];
  const merge = () => `part:${part.slot}/${part.key}:${shown}:${stroke.current.id}`;
  const paint = (x: number, y: number) => {
    const id = `${x},${y}`;
    if (stroke.current.last === id) return;
    stroke.current.last = id;
    write([...current(), (tool === "eraser" ? [x, y, 1, 1] : [x, y, 1, 1, paintColor]) as PartOp], merge());
  };
  const pick = (x: number, y: number) => {
    const hit = [...ops].reverse().find(([ox, oy, w, h, c]) => c && x >= ox && x < ox + w && y >= oy && y < oy + h);
    if (hit?.[4]) onPick(hit[4].startsWith("$") ? hit[4] : hit[4].slice(0, 7), hit[4].length > 7 && !hit[4].startsWith("$") ? parseInt(hit[4].slice(7, 9), 16) : 255);
  };
  const draw = !readOnly;

  return (
    <div className="sprite-stage" style={{ width: CHAR_W * SCALE, height: CHAR_H * SCALE }}>
      <canvas
        ref={canvas}
        className="sprite-stage__canvas"
        data-draw={draw || undefined}
        width={CHAR_W}
        height={CHAR_H}
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
            write([...current(), [...rectOf(drag), paintColor] as PartOp], merge());
            setDrag(null);
          }
        }}
      />
      <span className="sprite-stage__grid" style={{ backgroundSize: `${SCALE}px ${SCALE}px` }} />
    </div>
  );
}

/** Предпросмотр: три набора цветов × все позы. */
function PartPreview({ part }: { part: CustomPart }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = canvas.current?.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.current!.width, canvas.current!.height);
    SAMPLES.forEach((look, row) => {
      ctx.save();
      ctx.translate(0, row * CHAR_H);
      CHAR_FRAMES.forEach((pose, i) => drawOn(ctx, part, look, pose, i * CHAR_W));
      ctx.restore();
    });
  }, [part]);
  return (
    <canvas
      ref={canvas}
      className="sprite-stage__canvas"
      width={CHAR_W * CHAR_FRAMES.length}
      height={CHAR_H * SAMPLES.length}
      style={{ width: CHAR_W * CHAR_FRAMES.length * 3, height: CHAR_H * SAMPLES.length * 3 }}
    />
  );
}

/** Раздел «Части персонажей»: причёски, детали одежды, лицо и низ — рисунок 16×24 с ролями цвета, предпросмотр на манекенах. */
export function PartsSection() {
  const draft = useEditor((s) => s.draft);
  const focus = useEditor((s) => s.focus);
  const [selected, setSelected] = useUrlParam("item", focus?.sub === "parts" ? (focus.id ?? "") : "");
  const [pose, setPose] = useState("default");
  const [tool, setTool] = useState<Tool>("pencil");
  const [color, setColor] = useState("$hair");
  const [alpha, setAlpha] = useState(255);
  const [open, setOpen] = useState<Record<string, boolean>>({});

  const pair = splitPartId(selected);
  const view = pair ? partView(draft, pair[0], pair[1]) : null;
  const first = PART_SLOTS.map((s) => slotKeys(draft, s).map((k) => [s, k] as const)).flat()[0];
  const part = view ?? (first ? partView(draft, first[0], first[1]) : null);
  const builtin = part ? isBuiltinPart(part.slot, part.key) : true;
  const shown = part && part.frames[pose] ? pose : "default";
  const palette = useMemo(() => [...new Set((part ? Object.values(part.frames).flat() : []).map((o) => o[4]).filter((c): c is string => !!c && !c.startsWith("$")))].slice(0, 28), [part]);

  const choose = (slot: PartSlot, key: string) => (setSelected(partId(slot, key)), setPose("default"));
  const add = (slot: PartSlot) => {
    const p = newPart(editorStore.get().draft, slot);
    editor.update((d) => ({ ...d, parts: [...(d.parts ?? []), p] }));
    choose(slot, p.key);
  };
  const copy = (src: CustomPart) => {
    const c = copyPart(editorStore.get().draft, src);
    editor.update((d) => ({ ...d, parts: [...(d.parts ?? []), c] }));
    choose(c.slot, c.key);
  };
  const remove = async (p: CustomPart) => {
    const uses = partUses(draft, p.slot, p.key);
    if (uses.length) return tell({ title: "Часть используется", text: `«${p.name}» выбрана у персонажей: ${uses.join(", ")}. Сначала замените её у них.` });
    if (!(await ask({ title: `Удалить часть «${p.name}»?`, text: "Рисунок пропадёт.", confirmLabel: "Удалить", danger: true }))) return;
    editor.update((d) => ({ ...d, parts: d.parts?.filter((x) => !(x.slot === p.slot && x.key === p.key)) }));
  };
  const patch = (p: Partial<CustomPart>) => part && editor.update((d) => patchPart(d, part.slot, part.key, p));
  const sample = lookRoles(BASE);

  return (
    <section className="lm" style={{ ["--col-right" as string]: "26rem" }}>
      <aside className="lm__palette">
        {PART_SLOTS.map((slot) => {
          const keys = slotKeys(draft, slot);
          const isOpen = open[slot] ?? (part?.slot === slot || keys.length < 10);
          return (
            <PaletteGroup key={slot} title={PART_SLOT_LABELS[slot]} count={keys.length} open={isOpen} onToggle={() => setOpen((o) => ({ ...o, [slot]: !isOpen }))}>
              <div className="sprite-list">
                <button className="btn btn--sm" onClick={() => add(slot)}>
                  <Icon name="plus" size={14} /> Новая часть
                </button>
                {keys.map((k) => {
                  const v = partView(draft, slot, k)!;
                  const own = !isBuiltinPart(slot, k);
                  return (
                    <div key={k} className="sprite-row" aria-current={part?.slot === slot && part.key === k ? true : undefined}>
                      <button className="sprite-row__main" title={PART_NAMES[slot][k] ?? v.name} onClick={() => choose(slot, k)}>
                        <span className="sprite-row__name ellipsis">{v.name}</span>
                      </button>
                      <button className="btn btn--icon btn--sm" title="Копировать: своя копия, которую можно править" aria-label="Копировать" onClick={() => copy(v)}>
                        <Icon name="copy" size={14} />
                      </button>
                      {own ? (
                        <button className="btn btn--icon btn--sm btn--danger" title="Удалить часть" aria-label="Удалить" onClick={() => remove(v)}>
                          <Icon name="trash" size={14} />
                        </button>
                      ) : (
                        <span className="sprite-row__lock" title="Встроенная часть: менять и удалять нельзя, можно копировать">
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
        {part ? (
          <>
            <Tabs variant="bar" className="lm__tabs" tabs={POSES.filter((p) => p === "default" || part.frames[p]).map((p) => ({ id: p, label: poseLabel(p) }))} active={shown} onChange={setPose} />
            <div className="lm__center">
              <div className="lm__stage">
                <PartCanvas part={part} pose={pose} tool={tool} color={color} alpha={alpha} readOnly={builtin} onPick={(c, a) => (setColor(c), setAlpha(a))} />
              </div>
              <div className="lm__status">
                <span className="lm__hint">
                  {builtin ? "Встроенная часть нельзя изменить — сделайте копию и правьте её" : (TOOLS.find((t) => t.id === tool)?.hint ?? "")}
                  <span className="sprite-status__size">
                    {CHAR_W}×{CHAR_H} пикс. · манекен показывает, как часть сядет на персонажа
                  </span>
                </span>
              </div>
            </div>
          </>
        ) : (
          <p className="muted">Выберите часть слева.</p>
        )}
      </div>

      <aside className="lm__inspector">
        {part && (
          <div className="lm__inspector-body">
            <div className="sprite-head">
              <span className="sprite-head__title ellipsis">
                {builtin && <Icon name="lock" size={14} />} {part.name || "Без названия"}
              </span>
            </div>
            <h3>Предпросмотр</h3>
            <PartPreview part={part} />
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
                disabled={builtin || !part.frames[shown]?.length}
                title="Отменить последний мазок"
                aria-label="Отменить последнее"
                onClick={() => editor.update((d) => setPartOps(d, part.slot, part.key, shown, (part.frames[shown] ?? []).slice(0, -1)))}
              >
                <Icon name="undo" size={16} />
              </button>
              <button
                className="btn btn--icon btn--sm"
                disabled={builtin || !part.frames[shown]?.length}
                title="Очистить кадр"
                aria-label="Очистить кадр"
                onClick={() => editor.update((d) => setPartOps(d, part.slot, part.key, shown, []))}
              >
                <Icon name="trash" size={16} />
              </button>
            </div>
            <fieldset className="sprite-ro stack" disabled={builtin}>
              <h3>Цвет</h3>
              <p className="muted">Роль берёт цвет у персонажа (волосы, верх…), обычный цвет остаётся одним у всех.</p>
              <div className="look-ed__chips">
                {PART_ROLES.map((r) => (
                  <button key={r} className="look-ed__chip" aria-pressed={color === r} onClick={() => setColor(r)}>
                    <span className="colorpick__sample" style={{ display: "inline-block", width: "0.9em", height: "0.9em", background: sample[r] }} /> {ROLE_NAMES[r]}
                  </button>
                ))}
              </div>
              <ColorPicker color={color.startsWith("$") ? "#808080" : color} alpha={alpha} swatches={palette} onChange={(c, a) => (setColor(c), setAlpha(a))} />
              <h3>Свойства</h3>
              <label className="ef">
                <span className="ef__label">Название</span>
                <input value={part.name} onChange={(e) => patch({ name: e.target.value })} />
              </label>
              <label className="ef">
                <span className="ef__label">Ключ</span>
                <input value={part.key} readOnly />
              </label>
              <label className="row">
                <input type="checkbox" checked={!!part.bob} onChange={(e) => patch({ bob: e.target.checked })} /> Двигается вместе с телом на вдохе
              </label>
              {part.slot === "bottom" && (
                <label className="ef">
                  <span className="ef__label">Цвет ног под частью (роль или #цвет)</span>
                  <input value={part.legs ?? ""} placeholder="$legs" onChange={(e) => patch({ legs: e.target.value || undefined })} />
                </label>
              )}
              <h3>Позы</h3>
              <p className="muted">Кадр «Любая поза» рисуется во всех позах, у которых нет своего кадра.</p>
              <div className="row">
                {POSES.filter((p) => !part.frames[p]).map((p) => (
                  <button
                    key={p}
                    className="btn btn--sm"
                    title="Добавить отдельный кадр — копию основного"
                    onClick={() => (editor.update((d) => setPartOps(d, part.slot, part.key, p, [...(part.frames.default ?? [])])), setPose(p))}
                  >
                    + {poseLabel(p)}
                  </button>
                ))}
              </div>
              {shown !== "default" && (
                <button className="btn btn--sm btn--danger" onClick={() => (patch({ frames: withoutPose(part.frames, shown) }), setPose("default"))}>
                  <Icon name="trash" size={15} /> Удалить кадр «{poseLabel(shown)}»
                </button>
              )}
            </fieldset>
          </div>
        )}
      </aside>
    </section>
  );
}
