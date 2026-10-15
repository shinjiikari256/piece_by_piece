import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import {
  drawTile,
} from "../../game/art";
import { Door, Exit, Location, LocationObject, NpcPlacement } from "../../../../../shared/case";
import type { CaseFile as CaseFileT, Location as LocationT, Zone } from "../../../../../shared/case";
import { Icon } from "../../ui/icons";
import { ask, tell } from "../../ui/dialog";
import { editor } from "../state";
import { zoneKey } from "./ZoneCreator";
import { Field, ObjectFields, type JS } from "../SchemaForm";
import { ConditionEditor } from "../fields/Conditions";
import type { Condition } from "../../../../../shared/case";
import { T } from "./canvases";
import { LIST_KEY, type Selection, type Tool } from "./types";


const OBJECT_SCHEMA: JS = z.toJSONSchema(LocationObject);
const NPC_SCHEMA: JS = z.toJSONSchema(NpcPlacement);
const EXIT_SCHEMA: JS = z.toJSONSchema(Exit);
const DOOR_SCHEMA: JS = z.toJSONSchema(Door);
export const LOCATION_SCHEMA: JS = z.toJSONSchema(Location);

export function ToolButton({ on, onClick, icon, label, keyHint }: { on: boolean; onClick: () => void; icon: string; label: string; keyHint?: string }) {
  return (
    <button className="lm__tool" aria-pressed={on} onClick={onClick} title={keyHint ? `${label} (${keyHint})` : label}>
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
          Клетка {loc.playerStart.x}, {loc.playerStart.y}. Перетащите маркер ▶ на карте.
        </p>
      </>
    );
  }
  if (sel.kind === "zone") {
    const zone = loc.zones.find((z) => z.id === sel.id);
    if (!zone) return null;
    const drawing = tool.kind === "zone";
    const users = draft.dialogues.filter((d) => d.trigger?.zoneId === zone.id);
    return (
      <>
        {back}
        <h3>Область</h3>
        <p className="muted">Именованная область карты. Её выбирают как триггер диалога: он запускается по клавише взаимодействия или сам, когда игрок входит.</p>
        <label className="ef">
          <span className="ef__label">Название</span>
          <input value={zone.name} onChange={(e) => updateLoc((l) => ({ ...l, zones: l.zones.map((z) => (z.id === zone.id ? { ...z, name: e.target.value } : z)) }), `zone-name:${zone.id}`)} />
        </label>
        <ZoneKeyField zone={zone} draft={draft} onRenamed={(key) => onSelect({ kind: "zone", id: key })} />
        <p className="muted">Клеток: {zone.cells.length}</p>
        <div className="seg" role="group" aria-label="Рисование области">
          <button className="seg__btn" aria-pressed={drawing && !(tool as { erase?: boolean }).erase} onClick={() => setTool({ kind: "zone" })}>
            Дорисовать
          </button>
          <button className="seg__btn" aria-pressed={drawing && !!(tool as { erase?: boolean }).erase} onClick={() => setTool({ kind: "zone", erase: true })}>
            Стереть
          </button>
        </div>
        <p className="muted">На карте: ведите мышью по клеткам, Shift — прямоугольником, Alt — стереть.</p>
        <div className="lm__stats">
          {users.length ? users.map((d) => <span key={d.id}>диалог «{d.id}»</span>) : <span>на область пока нет диалогов</span>}
        </div>
        <button className="btn btn--sm btn--danger" onClick={onDelete}>
          Удалить (Delete)
        </button>
      </>
    );
  }
  const key = LIST_KEY[sel.kind];
  const schema = { object: OBJECT_SCHEMA, npc: NPC_SCHEMA, exit: EXIT_SCHEMA, door: DOOR_SCHEMA }[sel.kind];
  const item = (loc[key] as { id: string }[]).find((x) => x.id === sel.id);
  if (!item) return null;
  const title = { object: "Предмет", npc: "Человек", exit: "Выход", door: "Дверь" }[sel.kind];
  return (
    <>
      {back}
      <h3>{title}</h3>
      {sel.kind === "door" && <p className="muted">Дверь ставится в проём стены. Пока не закрыта, открывается сама, когда игрок подходит.</p>}
      {(() => {
        const onChange = (v: unknown) =>
          updateLoc((l) => ({ ...l, [key]: (l[key] as { id: string }[]).map((x) => (x.id === sel.id ? v : x)) }), `${key}:${sel.id}`);
        return sel.kind === "door" ? (
          <DoorFields schema={schema} door={item as DoorValue} draft={draft} onChange={onChange} />
        ) : (
          <Field name={key} schema={schema} value={item} ctx={{ draft }} bare onChange={onChange} />
        );
      })()}
      <button className="btn btn--sm btn--danger" onClick={onDelete}>
        Удалить (Delete)
      </button>
    </>
  );
}

/** Ключ области: меняется только вручную (Enter или уход с поля); ссылки в триггерах диалогов заменяются вместе с ним. */
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
    const used = draft.dialogues.filter((d) => d.trigger?.zoneId === zone.id).length;
    if (used > 0 && !(await ask({ title: "Переименовать ключ?", text: `Ключ «${zone.id}» используется в ${used} диалог(ах). Он заменится на «${key}» во всех триггерах.`, confirmLabel: "Переименовать" }))) return setText(zone.id);
    editor.update((c) => ({
      ...c,
      locations: c.locations.map((l) => ({ ...l, zones: l.zones.map((z) => (z.id === zone.id ? { ...z, id: key } : z)) })),
      dialogues: c.dialogues.map((d) => (d.trigger?.zoneId === zone.id ? { ...d, trigger: { ...d.trigger, zoneId: key } } : d)),
    }));
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


type DoorValue = { id: string; x: number; y: number; orientation: "h" | "v"; requires?: Condition; lockedText?: string };

/** Дверь: положение — обычными полями, а «Закрыта» включает текст у двери и условия, при которых она откроется. */
function DoorFields({ schema, door, draft, onChange }: { schema: JS; door: DoorValue; draft: CaseFileT; onChange: (v: unknown) => void }) {
  const locked = door.requires !== undefined;
  const lock = (on: boolean) => {
    const { requires: _r, lockedText: _t, ...rest } = door;
    onChange(on ? { ...rest, requires: {} } : rest);
  };
  return (
    <>
      <ObjectFields schema={schema} value={door} ctx={{ draft }} skip={["requires", "lockedText"]} onChange={onChange} />
      <label className="ef__toggle">
        <input type="checkbox" checked={locked} onChange={(e) => lock(e.target.checked)} />
        Закрыта
      </label>
      {locked && (
        <>
          <label className="ef">
            <span className="ef__label">Что увидит игрок у закрытой двери</span>
            <input
              value={door.lockedText ?? ""}
              placeholder="Например: Нужен ключ от комнаты"
              onChange={(e) => {
                const { lockedText: _t, ...rest } = door;
                onChange(e.target.value ? { ...rest, lockedText: e.target.value } : rest);
              }}
            />
          </label>
          <ConditionEditor
            value={door.requires ?? {}}
            ctx={{ draft }}
            label={<span className="ef__label">Условия, при которых дверь откроется</span>}
            onChange={(v) => onChange({ ...door, requires: v })}
          />
        </>
      )}
    </>
  );
}
