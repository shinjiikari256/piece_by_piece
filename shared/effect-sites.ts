import type { CaseFile, Effect } from "./case";

/** Откуда взят список эффектов: нужен, чтобы подписать место в сообщении или перейти к нему в конструкторе. */
export type EffectOwner =
  | { kind: "node"; dialogueId: string; characterId: string; nodeId: string; text: string }
  | { kind: "choice"; dialogueId: string; characterId: string; nodeId: string; choiceId: string; text: string }
  | { kind: "deduction"; deductionId: string; title: string }
  | { kind: "deductionFail"; deductionId: string; title: string }
  | { kind: "evidence"; evidenceId: string; title: string }
  | { kind: "enter"; locationId: string; locationName: string }
  | { kind: "object"; locationId: string; locationName: string; objectId: string; label: string }
  | { kind: "zone"; locationId: string; locationName: string; zoneId: string; zoneName: string; actionIndex: number };

export interface EffectSite {
  owner: EffectOwner;
  /** Подпись места в сообщениях валидатора (`dialogue d/n`, `location l/zone z: действие №1`…). */
  where: string;
  effects: Effect[];
}

type EffectCase = Pick<CaseFile, "dialogues" | "deductions" | "locations" | "evidence">;

/**
 * Все места дела, где есть список эффектов: реплики и варианты ответа, сопоставления, осмотр предметов, действия областей.
 * Новое место с эффектами добавляется только здесь — валидатор, предупреждения, «где используется» и удаление флагов подхватят его сами.
 */
export function effectSites(c: EffectCase): EffectSite[] {
  const sites: EffectSite[] = [];
  walkEffects(c, (effects, owner, where) => {
    sites.push({ owner, where, effects });
    return effects;
  });
  return sites;
}

/** Заменить списки эффектов во всех местах дела (например, убрать эффекты удалённой переменной). */
export function mapEffectSites<C extends EffectCase>(c: C, fn: (effects: Effect[], owner: EffectOwner) => Effect[]): C {
  return walkEffects(c, (effects, owner) => fn(effects, owner));
}

function walkEffects<C extends EffectCase>(c: C, visit: (effects: Effect[], owner: EffectOwner, where: string) => Effect[]): C {
  return {
    ...c,
    dialogues: c.dialogues.map((d) => ({
      ...d,
      nodes: d.nodes.map((n) => {
        const base = { dialogueId: d.id, characterId: d.characterId, nodeId: n.id };
        return {
          ...n,
          effects: visit(n.effects, { kind: "node", ...base, text: n.text }, `dialogue ${d.id}/${n.id}`),
          choices: n.choices.map((ch) => ({
            ...ch,
            effects: visit(ch.effects ?? [], { kind: "choice", ...base, choiceId: ch.id, text: ch.text }, `dialogue ${d.id}/${n.id}/${ch.id}`),
          })),
        };
      }),
    })),
    evidence: c.evidence.map((e) => ({ ...e, onCollect: visit(e.onCollect ?? [], { kind: "evidence", evidenceId: e.id, title: e.title }, `evidence ${e.id}: эффекты получения`) })),
    deductions: c.deductions.map((x) => ({
      ...x,
      effects: visit(x.effects, { kind: "deduction", deductionId: x.id, title: x.title }, `deduction ${x.id}`),
      failEffects: visit(x.failEffects ?? [], { kind: "deductionFail", deductionId: x.id, title: x.title }, `deduction ${x.id}: эффекты ошибки`),
    })),
    locations: c.locations.map((l) => ({
      ...l,
      onEnter: visit(l.onEnter ?? [], { kind: "enter", locationId: l.id, locationName: l.name }, `location ${l.id}: эффекты входа`),
      objects: l.objects.map((o) => ({
        ...o,
        onInteract: visit(o.onInteract ?? [], { kind: "object", locationId: l.id, locationName: l.name, objectId: o.id, label: o.label || o.id }, `location ${l.id}/object ${o.id}: эффекты осмотра`),
      })),
      zones: l.zones.map((z) => ({
        ...z,
        actions: z.actions.map((a, i) =>
          a.kind === "effects"
            ? { ...a, effects: visit(a.effects, { kind: "zone", locationId: l.id, locationName: l.name, zoneId: z.id, zoneName: z.name, actionIndex: i }, `location ${l.id}/zone ${z.id}: действие №${i + 1}`) }
            : a,
        ),
      })),
    })),
  };
}
