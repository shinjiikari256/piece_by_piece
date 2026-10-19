import { useState, type ReactNode } from "react";
import { editor, useEditor, type Focus } from "../state";
import { countRefs, renameKey, toKey } from "../keys";
import { Dialog } from "../../ui/window";
import { Select } from "../../ui/Select";
import type { CaseFile, Effect } from "../../../../../shared/case";
import { flagOfEffect } from "../../../../../shared/conditions";
import { effectSites, mapEffectSites, type EffectOwner } from "../../../../../shared/effect-sites";
import { ask } from "../../ui/dialog";
import { Icon } from "../../ui/icons";
import { FormCtx, Option, charOption } from "../SchemaForm";
import { RefMulti } from "./RefChips";

// ---------- условия показа и флаги ----------

export type Condition = {
  evidence?: string[];
  deductions?: string[];
  flags?: string[];
  notFlags?: string[];
  following?: string[];
  notFollowing?: string[];
  inLocation?: string[];
  /** Значения счётчиков в границах (пустая граница — без ограничения). */
  counters?: { counterId: string; min?: number; max?: number }[];
  /** «Или»: хотя бы один из вариантов (каждый — набор строк «и»). */
  anyOf?: Omit<Condition, "anyOf">[];
};

const FLAG_VERB = { on: "ставит", off: "снимает", toggle: "переключает" } as const;

/** Подпись и адрес перехода для места с эффектами (реплика, вариант, сопоставление, осмотр, область). */
function siteInfo(o: EffectOwner, who: (id: string) => string): { where: string; focus: Focus } {
  switch (o.kind) {
    case "node":
      return { where: `Разговор: ${who(o.characterId)} — реплика «${o.text.slice(0, 50)}»`, focus: { section: "dialogues", id: o.dialogueId, sub: o.nodeId } };
    case "choice":
      return { where: `Разговор: ${who(o.characterId)} — вариант «${o.text.slice(0, 50)}» (эффекты выбора)`, focus: { section: "dialogues", id: o.dialogueId, sub: o.nodeId } };
    case "deduction":
      return { where: `Сопоставление «${o.title}»`, focus: { section: "deductions", id: o.deductionId } };
    case "object":
      return { where: `Осмотр «${o.label}» — ${o.locationName}`, focus: { section: "locations", sub: o.locationId, kind: "object", id: o.objectId } };
    case "zone":
      return { where: `Область «${o.zoneName}» — ${o.locationName}`, focus: { section: "locations", sub: o.locationId, kind: "zone", id: o.zoneId } };
  }
}

/** Все флаги, которые встречаются в деле: описанные, поставленные эффектами или проверяемые условиями. */
export function flagsOf(d: FormCtx["draft"]): string[] {
  const out = new Set<string>(d.flags?.map((f) => f.id) ?? []);
  const cond = (c?: Condition): void => {
    c?.flags?.forEach((f) => out.add(f));
    c?.notFlags?.forEach((f) => out.add(f));
    c?.anyOf?.forEach(cond);
  };
  for (const dl of d.dialogues)
    for (const n of dl.nodes) {
      n.choices.forEach((ch) => cond(ch.requires));
    }
  effectSites(d).forEach((site) => site.effects.forEach((e) => flagOfEffect(e) && out.add(flagOfEffect(e)!.flag)));
  d.locations.forEach((l) => {
    l.doors.forEach((door) => cond(door.requires));
    l.npcs.forEach((n) => n.dialogues.forEach((nd) => cond(nd.requires)));
    l.zones.forEach((z) => z.actions.forEach((a) => cond(a.requires)));
  });
  return [...out].sort();
}

export interface FlagUse {
  kind: "ставит" | "снимает" | "переключает" | "проверяет" | "проверяет отсутствие";
  where: string;
  focus: Focus;
}

/** Где используется каждый флаг — с адресом для перехода. */
export function flagUsage(d: FormCtx["draft"]): Map<string, FlagUse[]> {
  const out = new Map<string, FlagUse[]>();
  const add = (f: string, use: FlagUse) => out.set(f, [...(out.get(f) ?? []), use]);
  const useOf = (e: Effect, where: string, focus: Focus) => {
    const f = flagOfEffect(e);
    if (f) add(f.flag, { kind: FLAG_VERB[f.action], where, focus });
  };
  const who = (id: string) => d.characters.find((c) => c.id === id)?.name ?? id;
  const dialogueFocus = (dialogueId: string, sub: string): Focus => ({ section: "dialogues", id: dialogueId, sub });
  const cond = (c: Condition | undefined, where: string, focus: Focus): void => {
    c?.flags?.forEach((f) => add(f, { kind: "проверяет", where, focus }));
    c?.notFlags?.forEach((f) => add(f, { kind: "проверяет отсутствие", where, focus }));
    c?.anyOf?.forEach((alt) => cond(alt, where, focus));
  };
  for (const dl of d.dialogues)
    for (const n of dl.nodes) {
      n.choices.forEach((ch) => cond(ch.requires, `Разговор: ${who(dl.characterId)} — вариант «${ch.text.slice(0, 50)}»`, dialogueFocus(dl.id, n.id)));
    }
  effectSites(d).forEach((site) => {
    const { where, focus } = siteInfo(site.owner, who);
    site.effects.forEach((e) => useOf(e, where, focus));
  });
  d.locations.forEach((l) => {
    l.doors.forEach((door) => cond(door.requires, `Дверь ${door.id} — ${l.name}`, { section: "locations", sub: l.id, kind: "door", id: door.id }));
    l.npcs.forEach((n) => n.dialogues.forEach((nd) => cond(nd.requires, `Диалог по условию: ${who(n.characterId)} — ${l.name}`, { section: "locations", sub: l.id, kind: "npc", id: n.id })));
    l.zones.forEach((z) => z.actions.forEach((a) => cond(a.requires, `Область «${z.name}» — ${l.name}`, { section: "locations", sub: l.id, kind: "zone", id: z.id })));
  });
  return out;
}

/** Удалить флаг полностью: эффекты «поставить флаг», проверки в условиях (пустые условия исчезают), запись в списке. */
export function deleteFlag(d: CaseFile, flag: string): CaseFile {
  const cleanCond = (c: Condition): Condition => {
    const r: Condition = { ...c };
    for (const k of ["flags", "notFlags"] as const) {
      if (!r[k]) continue;
      r[k] = r[k]!.filter((f) => f !== flag);
      if (!r[k]!.length) delete r[k];
    }
    if (r.anyOf) {
      const alts = r.anyOf.map(cleanCond).filter((a) => Object.keys(a).length);
      if (alts.length) r.anyOf = alts;
      else delete r.anyOf;
    }
    return r;
  };
  const clean = <T extends { requires?: Condition }>(x: T): T => {
    if (!x.requires) return x;
    const r = cleanCond(x.requires);
    const { requires: _old, ...rest } = x;
    return (Object.keys(r).length ? { ...rest, requires: r } : rest) as T;
  };
  const noSet = (effects: Effect[]) => effects.filter((e) => flagOfEffect(e)?.flag !== flag);
  const cleaned: CaseFile = {
    ...d,
    flags: (d.flags ?? []).filter((f) => f.id !== flag),
    dialogues: d.dialogues.map((dl) => ({ ...dl, nodes: dl.nodes.map((n) => ({ ...n, choices: n.choices.map(clean) })) })),
    locations: d.locations.map((l) => ({
      ...l,
      doors: l.doors.map(clean),
      npcs: l.npcs.map((n) => ({ ...n, dialogues: n.dialogues.map(clean) })),
      zones: l.zones.map((z) => ({ ...z, actions: z.actions.map(clean) })),
    })),
  };
  return mapEffectSites(cleaned, noSet);
}

const flagName = (d: FormCtx["draft"], id: string) => d.flags?.find((f) => f.id === id)?.name ?? "";
/** «Разрешён вход в архив (key_412)» — название и ключ в скобках. */
export const flagLabel = (d: FormCtx["draft"], id: string) => (flagName(d, id) ? `${flagName(d, id)} (${id})` : id);

/** Варианты флагов для списка: «+ Добавить флаг…» первым. */
function flagOptions(d: FormCtx["draft"], exclude: string[] = []): Option[] {
  return [
    { value: NEW_FLAG, label: "+ Добавить флаг…" },
    ...flagsOf(d)
      .filter((f) => !exclude.includes(f))
      .map((f) => ({ value: f, label: flagLabel(d, f) })),
  ];
}
const NEW_FLAG = "__new_flag__";

/** Окно создания или правки флага: русское название и ключ (собирается из названия). */
export function FlagDialog({ initial, onDone }: { initial?: { id: string; name: string }; onDone: (flag: string | null) => void }) {
  const draft = useEditor((s) => s.draft);
  const [name, setName] = useState(initial?.name ?? "");
  const [id, setId] = useState(initial?.id ?? "");
  const [manualKey, setManualKey] = useState(!!initial);
  const taken = id !== initial?.id && flagsOf(draft).includes(id);
  const save = async () => {
    const flag = id.trim();
    if (!flag || !name.trim() || taken) return;
    const old = initial?.id;
    if (old && old !== flag) {
      const refs = countRefs(draft as unknown as Record<string, unknown>, old);
      if (refs > 0) {
        const ok = await ask({
          title: "Переименовать ключ флага?",
          text: `Флаг «${old}» используется в ${refs} мест(ах). Ключ заменится на «${flag}» во всех ссылках.`,
          confirmLabel: "Переименовать",
        });
        if (!ok) return;
      }
    }
    editor.update((d0) => {
      const d = old && old !== flag ? (renameKey(d0 as unknown as Record<string, unknown>, old, flag) as unknown as CaseFile) : d0;
      const rest = (d.flags ?? []).filter((f) => f.id !== flag && f.id !== old);
      return { ...d, flags: [...rest, { id: flag, name: name.trim() }].sort((a, b) => a.name.localeCompare(b.name, "ru")) };
    });
    onDone(flag);
  };
  return (
    <Dialog
      title={initial ? "Флаг" : "Новый флаг"}
      className="dialog--flag"
      onClose={() => onDone(null)}
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
      actions={
        <>
          <button type="button" className="btn btn--sm" onClick={() => onDone(null)}>
            Отмена
          </button>
          <button type="submit" className="btn btn--sm btn--primary" disabled={!id.trim() || !name.trim() || taken}>
            {initial ? "Сохранить" : "Добавить"}
          </button>
        </>
      }
    >
      <p className="muted">Флаг — пометка «это уже произошло». Её ставят эффекты реплик и сопоставлений, а условия проверяют.</p>
      <label className="ef">
        <span className="ef__label">Название — что означает флаг</span>
        <input
          autoFocus
          value={name}
          placeholder="Название флага"
          onChange={(e) => {
            setName(e.target.value);
            if (!manualKey) setId(toKey(e.target.value));
          }}
        />
      </label>
      <label className="ef">
        <span className="ef__label">{initial ? "Ключ (смена ключа обновит все ссылки)" : "Ключ (латиницей, собирается из названия)"}</span>
        <input
          className="flag-input"
          value={id}
          placeholder="ключ латиницей"
          onChange={(e) => {
            setManualKey(true);
            setId(e.target.value.replace(/[^\w-]+/g, "_").toLowerCase());
          }}
        />
        {taken && <span className="ef__hint is-bad">Такой ключ уже есть</span>}
      </label>
    </Dialog>
  );
}

type ListKey = Exclude<keyof Condition, "anyOf" | "counters">;

/** Условие показа: только заполненные строки + «+ условие». Строки — «и»; варианты «или» — отдельные вложенные условия. */
export function ConditionEditor({ value, onChange, ctx, label, nested }: { value: Condition; onChange: (v: unknown) => void; ctx: FormCtx; label: ReactNode; nested?: boolean }) {
  const set = (key: ListKey, list: string[]) => {
    const next = { ...value };
    if (list.length) next[key] = list;
    else delete next[key];
    onChange(next);
  };
  const [added, setAdded] = useState<ListKey[]>([]);
  const d = ctx.draft;
  const chars = d.characters.map(charOption);
  const rows: { key: ListKey; title: string; options: Option[] | "flags" }[] = [
    { key: "evidence", title: "Есть улики (все)", options: d.evidence.map((e) => ({ value: e.id, label: e.title })) },
    { key: "deductions", title: "Установлены выводы (все)", options: d.deductions.map((x) => ({ value: x.id, label: x.title })) },
    { key: "flags", title: "Флаги поставлены", options: "flags" },
    { key: "notFlags", title: "Флагов нет", options: "flags" },
    { key: "following", title: "Идут за игроком", options: chars },
    { key: "notFollowing", title: "Не идут за игроком", options: chars },
    { key: "inLocation", title: "Игрок в локации (любой из)", options: d.locations.map((l) => ({ value: l.id, label: l.name })) },
  ];
  const shown = rows.filter((r) => value[r.key]?.length || added.includes(r.key));
  const addCounters = "__counters__";
  const free = rows.filter((r) => !shown.includes(r));
  const removeRow = (key: ListKey) => {
    setAdded((a) => a.filter((k) => k !== key));
    set(key, []);
  };
  const counterRows = value.counters ?? [];
  const [countersOpen, setCountersOpen] = useState(false);
  const showCounters = counterRows.length > 0 || countersOpen;
  const setCounters = (list: NonNullable<Condition["counters"]>) => {
    const next = { ...value };
    if (list.length) next.counters = list;
    else delete next.counters;
    onChange(next);
  };
  const bound = (v: string) => (v === "" ? undefined : Math.trunc(Number(v)));
  const alts = value.anyOf ?? [];
  const setAlts = (list: Omit<Condition, "anyOf">[]) => {
    const next = { ...value };
    if (list.length) next.anyOf = list;
    else delete next.anyOf;
    onChange(next);
  };
  return (
    <fieldset className="ef ef--object cond">
      <legend>{label ?? "Условие показа"}</legend>
      {shown.length === 0 && <p className="cond__hint">Без условия — доступно всегда.</p>}
      {shown.map((r) => {
        const remove = (
          <button className="cond__remove" onClick={() => removeRow(r.key)} title="Убрать строку условия">
            ✕
          </button>
        );
        const title = <span className="cond__title">{r.title}</span>;
        return (
          <div key={r.key} className="cond__row">
            {r.options === "flags" ? (
              <FlagMulti label={title} value={value[r.key] ?? []} onChange={(v) => set(r.key, v)} ctx={ctx} extra={remove} />
            ) : (
              <RefMulti label={title} options={r.options} value={value[r.key] ?? []} onChange={(v) => set(r.key, v as string[])} extra={remove} />
            )}
          </div>
        );
      })}
      {showCounters && (
        <div className="cond__row">
          <span className="cond__title">Счётчики в границах</span>
          {counterRows.map((r, i) => (
            <div key={i} className="cond__counter">
              <Select
                value={r.counterId}
                placeholder="какой счётчик"
                options={(d.counters ?? []).map((x) => ({ value: x.id, label: x.name || x.id }))}
                onChange={(v) => setCounters(counterRows.map((x, k) => (k === i ? { ...x, counterId: v } : x)))}
              />
              <input type="number" value={r.min ?? ""} placeholder="от" onChange={(e) => setCounters(counterRows.map((x, k) => (k === i ? { ...x, min: bound(e.target.value) } : x)))} />
              <input type="number" value={r.max ?? ""} placeholder="до" onChange={(e) => setCounters(counterRows.map((x, k) => (k === i ? { ...x, max: bound(e.target.value) } : x)))} />
              <button className="cond__remove" onClick={() => setCounters(counterRows.filter((_, k) => k !== i))} title="Убрать строку">
                ✕
              </button>
            </div>
          ))}
          <button className="btn btn--sm cond__or" onClick={() => setCounters([...counterRows, { counterId: d.counters?.[0]?.id ?? "" }])}>
            + счётчик
          </button>
        </div>
      )}
      {(free.length > 0 || !showCounters) && (
        <Select
          className="sel--add"
          value=""
          placeholder={shown.length || showCounters ? "+ ещё условие" : "+ условие"}
          options={[...free.map((r) => ({ value: r.key as string, label: r.title })), ...(showCounters ? [] : [{ value: addCounters, label: "Значение счётчика" }])]}
          onChange={(k) => (k === addCounters ? (setCountersOpen(true), setCounters([...counterRows, { counterId: d.counters?.[0]?.id ?? "" }])) : setAdded((a) => [...a, k as ListKey]))}
        />
      )}
      {!nested && (
        <>
          {alts.map((alt, i) => (
            <div key={i} className="cond__alt">
              <ConditionEditor
                nested
                value={alt}
                ctx={ctx}
                onChange={(v) => setAlts(alts.map((x, j) => (j === i ? (v as Omit<Condition, "anyOf">) : x)))}
                label={
                  <span className="cond__alt-head">
                    {i === 0 ? "Одно из: вариант 1" : `или вариант ${i + 1}`}
                    <button className="cond__remove" onClick={() => setAlts(alts.filter((_, j) => j !== i))} title="Убрать вариант">
                      ✕
                    </button>
                  </span>
                }
              />
            </div>
          ))}
          <button className="btn btn--sm cond__or" onClick={() => setAlts([...alts, {}])} title="Условие выполнится, если подойдёт хотя бы один вариант">
            + вариант «или»
          </button>
        </>
      )}
      {shown.length + alts.length > 1 && <p className="cond__hint">Строки вне вариантов должны выполняться все{alts.length ? "; из вариантов — хотя бы один" : ""}.</p>}
    </fieldset>
  );
}

function FlagMulti({
  label,
  value,
  onChange,
  ctx,
  extra,
}: {
  label: ReactNode;
  value: string[];
  onChange: (v: string[]) => void;
  ctx: FormCtx;
  extra?: ReactNode;
}) {
  const [dialog, setDialog] = useState<{ edit?: string } | null>(null);
  const d = ctx.draft;
  return (
    <div className="ef ef--refs">
      <div className="ef__refhead row row--wrap">
        {label}
        <Select
          className="sel--add"
          value=""
          placeholder="+ флаг"
          options={flagOptions(d, value)}
          onChange={(f) => (f === NEW_FLAG ? setDialog({}) : onChange([...value, f]))}
        />
        {extra}
      </div>
      {value.length > 0 && (
        <div className="ef__chips row row--wrap">
          {value.map((f) => (
            <span
              key={f}
              className="ef__chip ef__chip--flag"
              title="Двойной клик — изменить название"
              onDoubleClick={() => setDialog({ edit: f })}
            >
              <span className="ef__chip-label">
                {flagName(d, f) || <span className="is-warn">без названия</span>}
                <code>({f})</code>
              </span>
              <button className="ef__chip-x" onClick={() => onChange(value.filter((x) => x !== f))} aria-label="Убрать">
                ✕
              </button>
            </span>
          ))}
        </div>
      )}
      {dialog && (
        <FlagDialog
          initial={dialog.edit ? { id: dialog.edit, name: flagName(d, dialog.edit) } : undefined}
          onDone={(flag) => {
            if (flag && !dialog.edit && !value.includes(flag)) onChange([...value, flag]);
            setDialog(null);
          }}
        />
      )}
    </div>
  );
}

/** Одиночный флаг (эффект «поставить флаг»). */
export function FlagPicker({ value, onChange, ctx }: { value: string; onChange: (v: unknown) => void; ctx: FormCtx }) {
  const [dialog, setDialog] = useState<"new" | "edit" | null>(null);
  const d = ctx.draft;
  return (
    <div className="flag-picker row row--wrap">
      <Select
        value={value}
        placeholder="выберите флаг"
        options={flagOptions(d)}
        onChange={(f) => (f === NEW_FLAG ? setDialog("new") : onChange(f))}
      />
      {value && (
        <button
          className={`btn btn--sm btn--icon ${flagName(d, value) ? "" : "is-warn"}`}
          onClick={() => setDialog("edit")}
          title={flagName(d, value) ? "Изменить название флага" : "У флага нет названия — задать"}
          aria-label="Название флага"
        >
          <Icon name="pen" size={15} />
        </button>
      )}
      {dialog && (
        <FlagDialog
          initial={dialog === "edit" ? { id: value, name: flagName(d, value) } : undefined}
          onDone={(flag) => {
            if (flag && dialog === "new") onChange(flag);
            setDialog(null);
          }}
        />
      )}
    </div>
  );
}
