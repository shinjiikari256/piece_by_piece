import { useEffect, useMemo, useState, type ReactNode } from "react";
import { editor, useEditor, type Focus } from "../state";
import { countRefs, renameKey, toKey } from "../keys";
import { Dialog } from "../../ui/window";
import { Select } from "../../ui/Select";
import type { CaseFile, Condition, Effect } from "../../../../../shared/case";
import { ARRAY_KEYS, LIST_KEYS, addAtom, conditionToModel, describeFormula, formulaOf, modelToCondition, parseFormula, removeAtom, replaceAtom, type ConditionModel, type ListKey } from "../../../../../shared/condition-formula";
import { flagOfEffect } from "../../../../../shared/conditions";
import { effectSites, mapEffectSites, type EffectOwner } from "../../../../../shared/effect-sites";
import { ask } from "../../ui/dialog";
import { Icon } from "../../ui/icons";
import { FormCtx, Option, charOption } from "../SchemaForm";
import { RefMulti } from "./RefChips";

// ---------- условия показа и флаги ----------

export type { Condition };

/** Подпись и адрес перехода для места с эффектами (реплика, вариант, сопоставление, осмотр, область). */
function siteInfo(o: EffectOwner, who: (id: string) => string): { where: string; focus: Focus } {
  switch (o.kind) {
    case "node":
      return { where: `Разговор: ${who(o.characterId)} — реплика «${o.text.slice(0, 50)}»`, focus: { section: "dialogues", id: o.dialogueId, sub: o.nodeId } };
    case "choice":
      return { where: `Разговор: ${who(o.characterId)} — вариант «${o.text.slice(0, 50)}» (эффекты выбора)`, focus: { section: "dialogues", id: o.dialogueId, sub: o.nodeId } };
    case "deduction":
      return { where: `Сопоставление «${o.title}»`, focus: { section: "deductions", id: o.deductionId } };
    case "deductionFail":
      return { where: `Сопоставление «${o.title}» (ошибка)`, focus: { section: "deductions", id: o.deductionId } };
    case "evidence":
      return { where: `Улика «${o.title}» (при получении)`, focus: { section: "evidence", id: o.evidenceId } };
    case "enter":
      return { where: `Вход в локацию «${o.locationName}»`, focus: { section: "locations", sub: o.locationId } };
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
    c?.allOf?.forEach(cond);
  };
  for (const dl of d.dialogues)
    for (const n of dl.nodes) {
      n.choices.forEach((ch) => cond(ch.requires));
    }
  effectSites(d).forEach((site) =>
    site.effects.forEach((e) => {
      const f = flagOfEffect(e);
      if (f) out.add(f.flag);
      cond(e.requires);
    }),
  );
  d.locations.forEach((l) => {
    l.doors.forEach((door) => cond(door.requires));
    l.npcs.forEach((n) => n.dialogues.forEach((nd) => cond(nd.requires)));
    l.zones.forEach((z) => z.actions.forEach((a) => cond(a.requires)));
  });
  return [...out].sort();
}

export interface FlagUse {
  /** Что делает это место с переменной или уликой: «ставит», «прибавляет», «проверяет», «в сопоставлении»… */
  kind: string;
  where: string;
  focus: Focus;
}

const ACTION_VERB: Record<string, string> = { on: "ставит", off: "снимает", toggle: "переключает", add: "прибавляет", subtract: "отнимает", set: "задаёт", assign: "выбирает значение" };

/** Где используются переменные (флаги, счётчики, перечисления) и улики — с адресом для перехода. */
function collectUsage(d: FormCtx["draft"]): { vars: Map<string, FlagUse[]>; evidence: Map<string, FlagUse[]> } {
  const vars = new Map<string, FlagUse[]>();
  const evidence = new Map<string, FlagUse[]>();
  const push = (m: Map<string, FlagUse[]>, id: string, use: FlagUse) => m.set(id, [...(m.get(id) ?? []), use]);
  const add = (f: string, use: FlagUse) => push(vars, f, use);
  const useOf = (e: Effect, where: string, focus: Focus) => {
    if (e.type === "changeVariable") add(e.variableId, { kind: ACTION_VERB[e.action] ?? e.action, where, focus });
    if (e.type === "removeEvidence") push(evidence, e.evidenceId, { kind: "убирает из дела", where, focus });
    if (e.type === "addEvidence") push(evidence, e.evidenceId, { kind: "выдаёт", where, focus });
  };
  const who = (id: string) => d.characters.find((c) => c.id === id)?.name ?? id;
  const dialogueFocus = (dialogueId: string, sub: string): Focus => ({ section: "dialogues", id: dialogueId, sub });
  const cond = (c: Condition | undefined, where: string, focus: Focus): void => {
    c?.flags?.forEach((f) => add(f, { kind: "проверяет", where, focus }));
    c?.notFlags?.forEach((f) => add(f, { kind: "проверяет отсутствие", where, focus }));
    c?.counters?.forEach((r) => add(r.counterId, { kind: "проверяет значение", where, focus }));
    c?.enums?.forEach((r) => add(r.enumId, { kind: "проверяет значение", where, focus }));
    c?.evidence?.forEach((id) => push(evidence, id, { kind: "проверяет", where, focus }));
    c?.notEvidence?.forEach((id) => push(evidence, id, { kind: "проверяет отсутствие", where, focus }));
    c?.anyOf?.forEach((alt) => cond(alt, where, focus));
    c?.allOf?.forEach((part) => cond(part, where, focus));
  };
  for (const dl of d.dialogues)
    for (const n of dl.nodes) {
      n.choices.forEach((ch) => cond(ch.requires, `Разговор: ${who(dl.characterId)} — вариант «${ch.text.slice(0, 50)}»`, dialogueFocus(dl.id, n.id)));
    }
  effectSites(d).forEach((site) => {
    const { where, focus } = siteInfo(site.owner, who);
    site.effects.forEach((e) => {
      useOf(e, where, focus);
      cond(e.requires, `${where} (условие эффекта)`, focus);
    });
  });
  d.deductions.forEach((x) => x.evidenceIds.forEach((id) => push(evidence, id, { kind: "в сопоставлении", where: `Сопоставление «${x.title}»`, focus: { section: "deductions", id: x.id } })));
  d.locations.forEach((l) => {
    l.doors.forEach((door) => cond(door.requires, `Дверь ${door.id} — ${l.name}`, { section: "locations", sub: l.id, kind: "door", id: door.id }));
    l.npcs.forEach((n) => n.dialogues.forEach((nd) => cond(nd.requires, `Диалог по условию: ${who(n.characterId)} — ${l.name}`, { section: "locations", sub: l.id, kind: "npc", id: n.id })));
    l.zones.forEach((z) => z.actions.forEach((a) => cond(a.requires, `Область «${z.name}» — ${l.name}`, { section: "locations", sub: l.id, kind: "zone", id: z.id })));
  });
  return { vars, evidence };
}

/** Где используется каждая переменная (флаг, счётчик, перечисление). */
export const flagUsage = (d: FormCtx["draft"]): Map<string, FlagUse[]> => collectUsage(d).vars;
/** Где используется каждая улика: условия, сопоставления, эффекты. */
export const evidenceUsage = (d: FormCtx["draft"]): Map<string, FlagUse[]> => collectUsage(d).evidence;

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
    if (r.allOf) {
      const parts = r.allOf.map(cleanCond).filter((a) => Object.keys(a).length);
      if (parts.length) r.allOf = parts;
      else delete r.allOf;
    }
    return r;
  };
  const clean = <T extends { requires?: Condition }>(x: T): T => {
    if (!x.requires) return x;
    const r = cleanCond(x.requires);
    const { requires: _old, ...rest } = x;
    return (Object.keys(r).length ? { ...rest, requires: r } : rest) as T;
  };
  const noSet = (effects: Effect[]) => effects.filter((e) => flagOfEffect(e)?.flag !== flag).map(clean);
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

/** Ключ уже занят флагом, счётчиком или перечислением (их ключи общие). */
export function isVariableKeyTaken(d: FormCtx["draft"], id: string): boolean {
  return flagsOf(d).includes(id) || !!d.counters?.some((x) => x.id === id) || !!d.enums?.some((x) => x.id === id);
}

/** Окно создания или правки флага: русское название и ключ (собирается из названия). */
export function FlagDialog({ initial, onDone }: { initial?: { id: string; name: string }; onDone: (flag: string | null) => void }) {
  const draft = useEditor((s) => s.draft);
  const [name, setName] = useState(initial?.name ?? "");
  const [id, setId] = useState(initial?.id ?? "");
  const [manualKey, setManualKey] = useState(!!initial);
  const taken = id !== initial?.id && isVariableKeyTaken(draft, id);
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

/** Названия и варианты выбора для строк-списков условия. */
function listRows(d: FormCtx["draft"]): Record<ListKey, { title: string; options: Option[] | "flags" }> {
  const chars = d.characters.map(charOption);
  const locations = d.locations.map((l) => ({ value: l.id, label: l.name }));
  const evidence = d.evidence.map((e) => ({ value: e.id, label: e.title }));
  const deductions = d.deductions.map((x) => ({ value: x.id, label: x.title }));
  return {
    evidence: { title: "Есть улики (все)", options: evidence },
    notEvidence: { title: "Улик нет (ни одной из)", options: evidence },
    deductions: { title: "Установлены выводы (все)", options: deductions },
    notDeductions: { title: "Выводы не установлены (ни одного из)", options: deductions },
    flags: { title: "Флаги поставлены", options: "flags" },
    notFlags: { title: "Флагов нет", options: "flags" },
    following: { title: "Идут за игроком", options: chars },
    notFollowing: { title: "Не идут за игроком", options: chars },
    inLocation: { title: "Игрок в локации (любой из)", options: locations },
    notInLocation: { title: "Игрок не в локациях", options: locations },
  };
}

const ADD_COUNTER = "__counters__";
const ADD_ENUM = "__enums__";
const ADD_CHOSEN = "__chosen__";

/**
 * Условие: пронумерованные строки и, когда их больше одной, формула связки (`1 && (2 || 3)`; можно писать и / или).
 * Без формулы выполняются все строки сразу. Номера — только здесь, в деле их нет (см. `shared/condition-formula.ts`).
 */
export function ConditionEditor({ value, onChange, ctx, label }: { value: Condition; onChange: (v: unknown) => void; ctx: FormCtx; label: ReactNode; nested?: boolean }) {
  const d = ctx.draft;
  const model = useMemo(() => conditionToModel(value), [value]);
  const apply = (m: ConditionModel) => onChange(modelToCondition(m));
  const rows = listRows(d);
  const formula = formulaOf(model.ast);
  const [text, setText] = useState<string | null>(null); // что набирает автор; null — показываем формулу из условия
  useEffect(() => setText(null), [formula]);
  const parsed = text !== null ? parseFormula(text, model.atoms.length) : null;
  const commit = () => {
    if (text === null) return;
    if (parsed?.ok) apply({ atoms: model.atoms, ast: parsed.ast });
    else setText(null);
  };
  const choiceOptions = d.dialogues.flatMap((dl) =>
    dl.nodes.flatMap((n) =>
      n.choices.map((ch) => ({
        value: `${dl.id}/${n.id}/${ch.id}`,
        label: `${d.characters.find((x) => x.id === dl.characterId)?.name ?? dl.characterId}: «${ch.text.slice(0, 45)}» (${n.id})`,
      })),
    ),
  );
  const bound = (v: string) => (v === "" ? undefined : Math.trunc(Number(v)));

  /** Одна строка условия под номером n. */
  const atomRow = (atom: Condition, n: number) => {
    const remove = (
      <button className="cond__remove" onClick={() => apply(removeAtom(model, n))} title="Убрать строку условия">
        ✕
      </button>
    );
    const num = <span className="cond__num">{n}.</span>;
    const listKey = LIST_KEYS.find((k) => atom[k] !== undefined);
    if (listKey) {
      const row = rows[listKey];
      const title = (
        <span className="cond__title">
          {num} {row.title}
        </span>
      );
      const set = (list: unknown) => apply(replaceAtom(model, n, { [listKey]: list as string[] }));
      return row.options === "flags" ? (
        <FlagMulti label={title} value={atom[listKey] ?? []} onChange={set} ctx={ctx} extra={remove} />
      ) : (
        <RefMulti label={title} options={row.options} value={atom[listKey] ?? []} onChange={set} extra={remove} />
      );
    }
    const arrayKey = ARRAY_KEYS.find((k) => atom[k]?.length);
    if (arrayKey === "counters") {
      const r = atom.counters![0];
      const set = (p: Partial<typeof r>) => apply(replaceAtom(model, n, { counters: [{ ...r, ...p }] }));
      return (
        <>
          <span className="cond__title">{num} Значение счётчика</span>
          <div className="cond__counter">
            <Select value={r.counterId} placeholder="какой счётчик" options={(d.counters ?? []).map((x) => ({ value: x.id, label: x.name || x.id }))} onChange={(v) => set({ counterId: v })} />
            <input type="number" value={r.min ?? ""} placeholder="от" onChange={(e) => set({ min: bound(e.target.value) })} />
            <input type="number" value={r.max ?? ""} placeholder="до" onChange={(e) => set({ max: bound(e.target.value) })} />
            {remove}
          </div>
        </>
      );
    }
    if (arrayKey === "enums") {
      const r = atom.enums![0];
      const mode = r.notIn !== undefined ? "notIn" : "in";
      const list = (mode === "in" ? r.in : r.notIn) ?? [];
      const values = (d.enums ?? []).find((x) => x.id === r.enumId)?.values ?? [];
      const set = (next: NonNullable<Condition["enums"]>[number]) => apply(replaceAtom(model, n, { enums: [next] }));
      return (
        <div className="stack">
          <span className="cond__title">{num} Значение перечисления</span>
          <div className="cond__counter">
            <Select value={r.enumId} placeholder="какое перечисление" options={(d.enums ?? []).map((x) => ({ value: x.id, label: x.name || x.id }))} onChange={(v) => set({ enumId: v })} />
            <Select
              value={mode}
              options={[
                { value: "in", label: "одно из" },
                { value: "notIn", label: "не одно из" },
              ]}
              onChange={(m) => set({ enumId: r.enumId, [m]: list })}
            />
            {remove}
          </div>
          <RefMulti label="" options={values.map((v) => ({ value: v.id, label: v.name || v.id }))} value={list} onChange={(v) => set({ enumId: r.enumId, [mode]: v as string[] })} />
        </div>
      );
    }
    if (arrayKey === "chosen") {
      const r = atom.chosen![0];
      const set = (next: NonNullable<Condition["chosen"]>[number]) => apply(replaceAtom(model, n, { chosen: [next] }));
      return (
        <>
          <span className="cond__title">{num} Вариант ответа в разговоре</span>
          <div className="cond__counter">
            <Select
              value={`${r.dialogueId}/${r.nodeId}/${r.choiceId}`}
              placeholder="какой вариант"
              options={choiceOptions}
              onChange={(v) => {
                const [dialogueId, nodeId, choiceId] = v.split("/");
                set({ ...r, dialogueId, nodeId, choiceId });
              }}
            />
            <Select
              value={r.not ? "not" : "yes"}
              options={[
                { value: "yes", label: "уже выбирался" },
                { value: "not", label: "ещё не выбирался" },
              ]}
              onChange={(m) => set({ dialogueId: r.dialogueId, nodeId: r.nodeId, choiceId: r.choiceId, ...(m === "not" ? { not: true } : {}) })}
            />
            {remove}
          </div>
        </>
      );
    }
    return null;
  };

  const addOptions = [
    ...LIST_KEYS.map((k) => ({ value: k as string, label: rows[k].title })),
    { value: ADD_COUNTER, label: "Значение счётчика" },
    ...(d.enums?.length ? [{ value: ADD_ENUM, label: "Значение перечисления" }] : []),
    ...(choiceOptions.length ? [{ value: ADD_CHOSEN, label: "Вариант ответа в разговоре" }] : []),
  ];
  const addRow = (k: string) => {
    const row: Condition =
      k === ADD_COUNTER
        ? { counters: [{ counterId: d.counters?.[0]?.id ?? "" }] }
        : k === ADD_ENUM
          ? { enums: [{ enumId: d.enums?.[0]?.id ?? "", in: [] }] }
          : k === ADD_CHOSEN
            ? { chosen: [{ dialogueId: "", nodeId: "", choiceId: "" }] }
            : { [k]: [] };
    apply(addAtom(model, row));
  };

  return (
    <fieldset className="ef ef--object cond">
      <legend>{label ?? "Условие показа"}</legend>
      {model.atoms.length === 0 && <p className="cond__hint">Без условия — доступно всегда.</p>}
      {model.atoms.map((atom, i) => (
        <div key={i} className="cond__row">
          {atomRow(atom, i + 1)}
        </div>
      ))}
      <Select className="sel--add" value="" placeholder={model.atoms.length ? "+ ещё условие" : "+ условие"} options={addOptions} onChange={addRow} />
      {model.atoms.length > 1 && (
        <label className="cond__formula ef">
          <span className="cond__title">Связка условий</span>
          <input
            className="flag-input"
            value={text ?? formula}
            spellCheck={false}
            placeholder="1 && 2"
            aria-invalid={parsed && !parsed.ok ? true : undefined}
            onChange={(e) => setText(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") commit();
              if (e.key === "Escape") setText(null);
            }}
          />
          {parsed && !parsed.ok ? (
            <span className="ef__hint is-bad">{parsed.error}</span>
          ) : (
            <span className="cond__hint">
              {describeFormula(parsed?.ok ? parsed.ast : model.ast)}. «&&» или «и» — все сразу, «||» или «или» — хотя бы одно; скобки группируют. Каждое условие — один раз.
            </span>
          )}
        </label>
      )}
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
