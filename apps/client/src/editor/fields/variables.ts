import type { CaseFile, Condition, Effect } from "../../../../../shared/case";
import { flagOfEffect } from "../../../../../shared/conditions";
import { effectSites, mapEffectSites, type EffectOwner } from "../../../../../shared/effect-sites";
import type { Focus } from "../state";
import type { FormCtx } from "../SchemaForm";

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
    case "objectState":
      return {
        where: `Предмет «${o.label}», состояние «${o.stateId}» (${{ enter: "вход", exit: "выход", interact: "осмотр" }[o.phase]}) — ${o.locationName}`,
        focus: { section: "locations", sub: o.locationId, kind: "object", id: o.objectId },
      };
    case "zone":
      return { where: `Область «${o.zoneName}» — ${o.locationName}`, focus: { section: "locations", sub: o.locationId, kind: "zone", id: o.zoneId } };
    case "zoneFallback":
      return { where: `Область «${o.zoneName}» (запасной ответ) — ${o.locationName}`, focus: { section: "locations", sub: o.locationId, kind: "zone", id: o.zoneId } };
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
      n.textVariants?.forEach((v) => cond(v.requires));
    }
  effectSites(d).forEach((site) =>
    site.effects.forEach((e) => {
      const f = flagOfEffect(e);
      if (f) out.add(f.flag);
      cond(e.requires);
    }),
  );
  d.locations.forEach((l) => {
    l.objects.forEach((o) => o.states?.forEach((st) => cond(st.when)));
    l.npcs.forEach((n) => {
      cond(n.requires);
      n.dialogues.forEach((nd) => cond(nd.requires));
    });
    l.zones.forEach((z) => z.actions.forEach((a) => cond(a.requires)));
  });
  d.hints.forEach((h) => cond(h.requires));
  d.events.forEach((ev) => cond(ev.requires));
  d.deductions.forEach((x) => cond(x.requires));
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
      n.textVariants?.forEach((v) => cond(v.requires, `Разговор: ${who(dl.characterId)} — текст реплики по условию`, dialogueFocus(dl.id, n.id)));
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
    l.objects.forEach((o) => o.states?.forEach((st) => cond(st.when, `Состояние «${st.id}» предмета «${o.label}» — ${l.name}`, { section: "locations", sub: l.id, kind: "object", id: o.id })));
    l.npcs.forEach((n) => cond(n.requires, `Человек на карте: ${who(n.characterId)} — ${l.name}`, { section: "locations", sub: l.id, kind: "npc", id: n.id }));
    l.npcs.forEach((n) => n.dialogues.forEach((nd) => cond(nd.requires, `Диалог по условию: ${who(n.characterId)} — ${l.name}`, { section: "locations", sub: l.id, kind: "npc", id: n.id })));
    l.zones.forEach((z) => z.actions.forEach((a) => cond(a.requires, `Область «${z.name}» — ${l.name}`, { section: "locations", sub: l.id, kind: "zone", id: z.id })));
  });
  d.deductions.forEach((x) => cond(x.requires, `Сопоставление «${x.title}» (доступность)`, { section: "deductions", id: x.id }));
  d.hints.forEach((h) => cond(h.requires, `Подсказка ${h.level}`, { section: "hints" }));
  d.events.forEach((ev) => cond(ev.requires, `Хронология: «${ev.title.slice(0, 50)}»`, { section: "events", id: ev.id }));
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
    hints: d.hints.map(clean),
    deductions: d.deductions.map(clean),
    dialogues: d.dialogues.map((dl) => ({ ...dl, nodes: dl.nodes.map((n) => ({ ...n, choices: n.choices.map(clean) })) })),
    locations: d.locations.map((l) => ({
      ...l,
      objects: l.objects.map((o) => (o.states ? { ...o, states: o.states.map((st) => (st.when ? { ...st, when: cleanCond(st.when) } : st)) } : o)),
      npcs: l.npcs.map((n) => ({ ...clean(n), dialogues: n.dialogues.map(clean) })),
      zones: l.zones.map((z) => ({ ...z, actions: z.actions.map(clean) })),
    })),
  };
  return mapEffectSites(cleaned, noSet);
}

export const flagName = (d: FormCtx["draft"], id: string) => d.flags?.find((f) => f.id === id)?.name ?? "";
/** «Разрешён вход в архив (key_412)» — название и ключ в скобках. */
export const flagLabel = (d: FormCtx["draft"], id: string) => (flagName(d, id) ? `${flagName(d, id)} (${id})` : id);

/** Ключ уже занят флагом, счётчиком или перечислением (их ключи общие). */
export function isVariableKeyTaken(d: FormCtx["draft"], id: string): boolean {
  return flagsOf(d).includes(id) || !!d.counters?.some((x) => x.id === id) || !!d.enums?.some((x) => x.id === id);
}
