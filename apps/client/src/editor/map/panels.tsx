import { useEffect, useRef, useState } from "react";
import { formSchema } from "../json-schema";
import {
  drawTile,
} from "../../game/art";
import { Location, LocationObject, NpcPlacement, isInteractive } from "../../../../../shared/case";
import type { CaseFile as CaseFileT, Location as LocationT, LocationObject as LocationObjectT, NpcDialogue, Zone } from "../../../../../shared/case";
import { Icon } from "../../ui/icons";
import { tell } from "../../ui/dialog";
import { editor } from "../state";
import { zoneKey } from "./ZoneCreator";
import { ObjectZones } from "./ObjectZones";
import { AnimPreview } from "./AnimPreview";
import { ObjectBindings } from "./ObjectBindings";
import { ZONE_COLORS } from "./helpers";
import { ZoneActions } from "./ZoneActions";
import { NpcDialogues } from "./NpcDialogues";
import { Field, ObjectFields, type JS } from "../SchemaForm";
import { T } from "./canvases";
import { LIST_KEY, type Selection, type Tool } from "./types";


const OBJECT_SCHEMA: JS = formSchema(LocationObject);
const NPC_SCHEMA: JS = formSchema(NpcPlacement);
export const LOCATION_SCHEMA: JS = formSchema(Location);

export function ToolButton({ on, onClick, icon, label, keyHint, hint }: { on: boolean; onClick: () => void; icon: string; label: string; keyHint?: string; hint?: string }) {
  return (
    <button className="lm__tool" aria-pressed={on} onClick={onClick} title={[keyHint ? `${label} (${keyHint})` : label, hint].filter(Boolean).join(" — ")}>
      <span className="lm__tool-icon">{icon}</span>
      <span className="ellipsis">{label}</span>
    </button>
  );
}

/** Подгруппа внутри раздела палитры: сворачивается, показывает число элементов. */
export function PaletteGroup({ title, count, open, onToggle, children }: { title: string; count: number; open: boolean; onToggle: () => void; children: React.ReactNode }) {
  return (
    <div className="lm__group">
      <button className="lm__group-head" onClick={onToggle} aria-expanded={open}>
        <span>{open ? "▾" : "▸"}</span> {title} <small>{count}</small>
      </button>
      {open && <div className="lm__group-body">{children}</div>}
    </div>
  );
}

export function PaletteSection({ title, open, onToggle, children }: { title: string; open: boolean; onToggle: () => void; children: React.ReactNode }) {
  return (
    <section className="lm__section" data-open={open || undefined}>
      <button className="lm__section-head" onClick={onToggle}>
        <span>{open ? "▾" : "▸"}</span> <span className="lm__section-title">{title}</span>
      </button>
      {open && <div className="lm__section-body">{children}</div>}
    </section>
  );
}

export function SwatchButton({ ch, label, on, onClick }: { ch: string; label: string; on: boolean; onClick: () => void }) {
  return (
    <button className="lm__swatch" aria-pressed={on} onClick={onClick} title={label}>
      <TileSwatch ch={ch} />
      <span className="ellipsis">{label}</span>
    </button>
  );
}

export function SelectedPanel({
  loc,
  sel,
  updateLoc,
  onDelete,
  draft,
  onClose,
  tool,
  setTool,
  onSelect,
}: {
  loc: LocationT;
  sel: NonNullable<Selection>;
  updateLoc: (fn: (l: LocationT) => LocationT, merge?: string) => void;
  onDelete: () => void;
  draft: CaseFileT;
  onClose: () => void;
  tool: Tool;
  setTool: (t: Tool) => void;
  onSelect: (s: Selection) => void;
}) {
  const back = (
    <button className="link-btn lm__back" onClick={onClose}>
      ← к локации
    </button>
  );
  if (sel.kind === "start") {
    return (
      <>
        {back}
        <h3>Старт игрока</h3>
        <p className="muted">
          Клетка {loc.playerStart?.x}, {loc.playerStart?.y}. Стартовая локация — та, где стоит этот маркер; он один на дело. Перетащите ▶ на карте или выберите инструмент «Старт» в другой локации, чтобы перенести.
        </p>
      </>
    );
  }
  if (sel.kind === "zone") {
    const zone = loc.zones.find((z) => z.id === sel.id);
    if (!zone) return null;
    const drawing = tool.kind === "zone";
        const erase = drawing && !!(tool as { erase?: boolean }).erase;
    return (
      <>
        {back}
        <div className="zone-head">
          <h3>Область</h3>
          <small className="muted">{zone.cells.length} кл.</small>
          <span className="seg seg--icons" role="group" aria-label="Рисование области">
            <button className="seg__btn" aria-pressed={drawing && !erase} onClick={() => setTool({ kind: "zone" })} title="Рисовать: ведите по клеткам, Shift — прямоугольником" aria-label="Рисовать">
              <Icon name="brush" size={20} />
            </button>
            <button className="seg__btn" aria-pressed={erase} onClick={() => setTool({ kind: "zone", erase: true })} title="Стирать клетки (или Alt при рисовании)" aria-label="Стирать">
              <Icon name="eraser" size={20} />
            </button>
          </span>
        </div>
        <p className="muted">Именованная область карты, к которой можно привязать действия.</p>
        <input
          className="input"
          value={zone.name}
          placeholder="Название области"
          aria-label="Название области"
          onChange={(e) => updateLoc((l) => ({ ...l, zones: l.zones.map((z) => (z.id === zone.id ? { ...z, name: e.target.value } : z)) }), `zone-name:${zone.id}`)}
        />
        <ZoneKeyField zone={zone} draft={draft} onRenamed={(key) => onSelect({ kind: "zone", id: key })} />
        <div className="zone-colors" role="group" aria-label="Цвет области на карте">
          <button
            className="zone-swatch zone-swatch--auto"
            aria-pressed={!zone.color}
            title="Цвет по ключу"
            aria-label="Цвет по ключу"
            onClick={() => updateLoc((l) => ({ ...l, zones: l.zones.map((z) => (z.id === zone.id ? { ...z, color: undefined } : z)) }))}
          />
          {ZONE_COLORS.map((c) => (
            <button
              key={c}
              className="zone-swatch"
              style={{ background: c }}
              aria-pressed={zone.color === c}
              title={c}
              aria-label={`Цвет ${c}`}
              onClick={() => updateLoc((l) => ({ ...l, zones: l.zones.map((z) => (z.id === zone.id ? { ...z, color: c } : z)) }))}
            />
          ))}
        </div>
        <ZoneActions
          zone={zone}
          draft={draft}
          onChange={(actions) => updateLoc((l) => ({ ...l, zones: l.zones.map((z) => (z.id === zone.id ? { ...z, actions } : z)) }), `zone-actions:${zone.id}`)}
          onFallback={(fallback) => updateLoc((l) => ({ ...l, zones: l.zones.map((z) => (z.id === zone.id ? { ...z, fallback } : z)) }), `zone-fallback:${zone.id}`)}
        />
        <button className="btn btn--sm btn--danger" onClick={onDelete}>
          Удалить (Delete)
        </button>
      </>
    );
  }
  const key = LIST_KEY[sel.kind];
  const schema = { object: OBJECT_SCHEMA, npc: NPC_SCHEMA }[sel.kind];
  const item = (loc[key] as { id: string }[]).find((x) => x.id === sel.id);
  if (!item) return null;
  const title = { object: "Предмет", npc: "Человек" }[sel.kind];
  return (
    <>
      {back}
      <h3>{title}</h3>
      {(() => {
        const onChange = (v: unknown) =>
          updateLoc((l) => ({ ...l, [key]: (l[key] as { id: string }[]).map((x) => (x.id === sel.id ? v : x)) }), `${key}:${sel.id}`);
        return sel.kind === "npc" ? (
          <>
            <ObjectFields schema={schema} value={item} ctx={{ draft }} skip={["dialogues"]} onChange={onChange} />
            <NpcDialogues
              dialogues={(item as unknown as { dialogues: NpcDialogue[] }).dialogues ?? []}
              draft={draft}
              onChange={(dialogues) => onChange({ ...(item as object), dialogues })}
            />
          </>
        ) : (
          <>
            <Field name={key} schema={schema} value={item} ctx={{ draft, object: sel.kind === "object" ? (item as unknown as LocationObjectT) : undefined }} bare onChange={onChange} />
            {sel.kind === "object" && <ObjectBindings draft={draft} object={item as unknown as LocationObjectT} onChange={onChange} />}
            {sel.kind === "object" && <AnimPreview object={item as unknown as LocationObjectT} />}
            {sel.kind === "object" && isInteractive(item as unknown as LocationObjectT) && <ObjectZones draft={draft} object={item as unknown as LocationObjectT} locationId={loc.id} />}
          </>
        );
      })()}
      <button className="btn btn--sm btn--danger" onClick={onDelete}>
        Удалить (Delete)
      </button>
    </>
  );
}

/** Заменить ключ области в эффектах `moveTo` (цель-область) по всему делу. */
function renameZoneRefs(node: unknown, from: string, to: string): unknown {
  if (Array.isArray(node)) return node.map((x) => renameZoneRefs(x, from, to));
  if (node && typeof node === "object") {
    const o = node as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(o)) out[k] = renameZoneRefs(v, from, to);
    if (o.type === "moveTo" && o.zoneId === from) out.zoneId = to;
    return out;
  }
  return node;
}

/** Ключ области: меняется только вручную (Enter или уход с поля). Ссылаются на него только эффекты `moveTo` — они обновляются вместе с ключом. */
function ZoneKeyField({ zone, draft, onRenamed }: { zone: Zone; draft: CaseFileT; onRenamed: (key: string) => void }) {
  const [text, setText] = useState(zone.id);
  useEffect(() => setText(zone.id), [zone.id]);
  const suggestion = zoneKey(draft, zone.name);
  const commit = async (next: string) => {
    const key = next.trim();
    if (!key || key === zone.id) return setText(zone.id);
    if (draft.locations.some((l) => l.zones.some((z) => z.id === key))) {
      setText(zone.id);
      return tell({ title: "Ключ уже занят", text: `«${key}» уже есть у другой области — выберите другой.` });
    }
    editor.update((c) => {
      const renamed = {
        ...c,
        locations: c.locations.map((l) => ({ ...l, zones: l.zones.map((z) => (z.id === zone.id ? { ...z, id: key } : z)) })),
      };
      return renameZoneRefs(renamed, zone.id, key) as CaseFileT;
    });
    onRenamed(key); // выбор области в адресе идёт по ключу
  };
  return (
    <div className="ef">
      <span className="ef__label">Ключ</span>
      <div className="key-field row">
        <input
          className="key-field__input"
          value={text}
          onChange={(e) => setText(e.target.value.replace(/[^\w-]+/g, "_"))}
          onBlur={() => void commit(text)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void commit(text);
            if (e.key === "Escape") setText(zone.id);
          }}
        />
        {suggestion !== zone.id && (
          <button className="btn btn--sm btn--icon" onClick={() => void commit(suggestion)} title="Сгенерировать из названия" aria-label="Сгенерировать из названия">
            <Icon name="sparkle" size={16} />
          </button>
        )}
      </div>
    </div>
  );
}

export function TileSwatch({ ch }: { ch: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = ref.current?.getContext("2d");
    if (ctx) drawTile(ctx, ch, 0, 0, { below: ".", left: "#", right: "#" });
  }, [ch]);
  return <canvas ref={ref} width={T} height={T} className="tile-swatch" />;
}

export function SizeInput({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="size-input">
      <span>{label}</span>
      <input type="number" min={8} max={60} value={value} onChange={(e) => onChange(Math.max(8, Math.min(60, Number(e.target.value))))} />
    </label>
  );
}

/** Новая ширина/высота: обрезаем или достраиваем стенами. */
