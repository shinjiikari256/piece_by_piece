import type { Condition, Effect } from "./case";

/** Часть состояния, от которой зависят условия и эффекты сценария. */
export interface Place {
  locationId: string;
  x: number;
  y: number;
  /** Реплика персонажа, если он не сможет дойти (из эффекта `moveTo`); нужна только сцене. */
  failText?: string;
}

export interface Progress {
  collected: string[];
  flags: string[];
  deductions: string[];
  characterNotes: Record<string, string[]>;
  /** Персонажи, которые сейчас идут за игроком. */
  followers: string[];
  /** Персонажи, оставшиеся не на своём исходном месте. */
  npcPlaces: Record<string, Place>;
  /** Значения счётчиков дела (нет записи — 0 или начальное значение, см. `startProgress`). */
  counters: Record<string, number>;
  /** Текущие значения перечислений дела (id значения); заполняются при старте — `startProgress`. */
  enums: Record<string, string>;
  /** Варианты ответа, которые игрок уже выбирал: `диалог/узел/вариант` (отметка ✓ и условие `chosen`). */
  chosen: string[];
  /** Диалоги с автозапуском по входу в область, которые уже сработали (один раз за прохождение). */
  fired: string[];
}

export const emptyProgress = (): Progress => ({
  collected: [],
  flags: [],
  deductions: [],
  characterNotes: {},
  followers: [],
  counters: {},
  enums: {},
  chosen: [],
  npcPlaces: {},
  fired: [],
});

/** Ключ выбранного варианта ответа в `Progress.chosen`. */
export const choiceKey = (dialogueId: string, nodeId: string, choiceId: string) => `${dialogueId}/${nodeId}/${choiceId}`;

/** Строки условия (без вложенных условий). */
function meetsRows(cond: Condition, p: Progress, locationId?: string): boolean {
  return (
    (cond.evidence ?? []).every((id) => p.collected.includes(id)) &&
    (cond.flags ?? []).every((f) => p.flags.includes(f)) &&
    (cond.notFlags ?? []).every((f) => !p.flags.includes(f)) &&
    (cond.notEvidence ?? []).every((id) => !p.collected.includes(id)) &&
    (cond.deductions ?? []).every((id) => p.deductions.includes(id)) &&
    (cond.notDeductions ?? []).every((id) => !p.deductions.includes(id)) &&
    (cond.following ?? []).every((id) => p.followers.includes(id)) &&
    (cond.notFollowing ?? []).every((id) => !p.followers.includes(id)) &&
    (cond.counters ?? []).every((r) => {
      const v = p.counters?.[r.counterId] ?? 0;
      return (r.min === undefined || v >= r.min) && (r.max === undefined || v <= r.max);
    }) &&
    (cond.enums ?? []).every((r) => {
      const v = p.enums?.[r.enumId];
      return (!r.in?.length || (v !== undefined && r.in.includes(v))) && (!r.notIn?.length || v === undefined || !r.notIn.includes(v));
    }) &&
    (cond.chosen ?? []).every((r) => (p.chosen ?? []).includes(choiceKey(r.dialogueId, r.nodeId, r.choiceId)) !== !!r.not) &&
    (!cond.notInLocation?.length || locationId === undefined || !cond.notInLocation.includes(locationId)) &&
    (!cond.inLocation?.length || (locationId !== undefined && cond.inLocation.includes(locationId)))
  );
}

/** @param locationId — где сейчас игрок (для `inLocation`; не передан — такое условие не выполняется). */
/** Начало расследования: флаги и счётчики с начальными значениями из дела. */
export function startProgress(c: { flags?: { id: string; initial?: boolean }[]; counters?: CounterDef[]; enums?: EnumDef[] } | null | undefined): Progress {
  return {
    ...emptyProgress(),
    flags: (c?.flags ?? []).filter((f) => f.initial).map((f) => f.id),
    counters: Object.fromEntries((c?.counters ?? []).filter((x) => x.initial).map((x) => [x.id, clampCounter(x.initial!, x)])),
    enums: initialEnums(c?.enums),
  };
}

/** Перечисление с значениями (нужны `id` и `values`). */
export type EnumDef = { id: string; values: { id: string }[]; initial?: string };

/** Начальные значения перечислений: заданное `initial`, иначе первое значение. */
export function initialEnums(defs: readonly EnumDef[] | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const d of defs ?? []) {
    const v = d.initial && d.values.some((x) => x.id === d.initial) ? d.initial : d.values[0]?.id;
    if (v !== undefined) out[d.id] = v;
  }
  return out;
}

/** Действия над флагом (остальные — над счётчиком). */
export const isFlagAction = (a: Extract<Effect, { type: "changeVariable" }>["action"]): boolean => a === "on" || a === "off" || a === "toggle";

/** Флаг, который меняет эффект, — или `undefined`, если это эффект не про флаг. */
export const flagOfEffect = (e: Effect): { flag: string; action: "on" | "off" | "toggle" } | undefined =>
  e.type === "changeVariable" && isFlagAction(e.action) ? { flag: e.variableId, action: e.action as "on" | "off" | "toggle" } : undefined;

/** Счётчик с границами (нужны только `min`/`max`). */
export type CounterDef = { id: string; initial?: number; min?: number; max?: number };

/** Значение счётчика в его границах. */
export const clampCounter = (v: number, def?: { min?: number; max?: number }): number => Math.min(def?.max ?? Infinity, Math.max(def?.min ?? -Infinity, v));

export function meets(cond: Condition | undefined, p: Progress, locationId?: string): boolean {
  if (!cond) return true;
  return (
    meetsRows(cond, p, locationId) &&
    (cond.allOf ?? []).every((part) => meets(part, p, locationId)) &&
    (!cond.anyOf?.length || cond.anyOf.some((alt) => meets(alt, p, locationId)))
  );
}

/** Текст реплики: первый вариант `textVariants` с выполненным условием, иначе основной. */
export function nodeText(node: { text: string; textVariants?: { requires: Condition; text: string }[] }, p: Progress, locationId?: string): string {
  return node.textVariants?.find((v) => meets(v.requires, p, locationId))?.text ?? node.text;
}

export interface EffectOutcome {
  progress: Progress;
  newEvidence: string[];
  /** Тексты эффектов `message` по порядку — показывает вызывающий. */
  messages: string[];
  /** Улики, убранные эффектами `removeEvidence` (были в деле). */
  removedEvidence: string[];
  /** Что вызывающий должен сделать после применения: перенести игрока, запустить диалог (побеждает последний такой эффект). */
  followUp: { dialogueId?: string; travel?: { to: string; spawn: { x: number; y: number } }; failCase?: { text?: string } };
}

/**
 * Окружение применения эффектов.
 * - `whereIs` — где сейчас стоит персонаж (нужно для «stay»: остаётся там, куда дошёл).
 * - `counters` — границы счётчиков дела.
 * - `locationId` — где игрок (для условия `inLocation` у эффекта).
 */
export interface EffectContext {
  whereIs?: (characterId: string) => Place | undefined;
  counters?: readonly CounterDef[];
  locationId?: string;
  /** Эффекты улики в момент попадания в дело (`Evidence.onCollect`); срабатывают сразу после выдавшего эффекта. */
  onCollect?: (evidenceId: string) => Effect[];
  /**
   * Где лежит список (например, `node:dlg/start`): по нему и номеру эффекта строится ключ «один раз» (`once:<site>#<номер>`) в `Progress.fired`.
   * Без `site` эффекты с `once` срабатывают каждый раз.
   */
  site?: string;
}

/**
 * Эффект с условием `requires` применяется, только если оно выполнено на момент его очереди — по состоянию после предыдущих эффектов списка.
 * Эффект `moveTo` пишет итоговое место сразу; идёт персонаж к нему уже в сцене.
 */
export function applyEffects(effects: Effect[], p: Progress, ctx: EffectContext = {}): EffectOutcome {
  const whereIs = ctx.whereIs ?? (() => undefined);
  const counterDefs = ctx.counters ?? [];
  const next: Progress = {
    ...p,
    collected: [...p.collected],
    flags: [...p.flags],
    characterNotes: { ...p.characterNotes },
    followers: [...p.followers],
    counters: { ...(p.counters ?? {}) },
    enums: { ...(p.enums ?? {}) },
    chosen: [...(p.chosen ?? [])],
    npcPlaces: { ...p.npcPlaces },
    fired: [...(p.fired ?? [])],
  };
  const newEvidence: string[] = [];
  const messages: string[] = [];
  const removedEvidence: string[] = [];
  const followUp: EffectOutcome["followUp"] = {};
  // очередь: эффекты улики встают сразу за выдавшим её эффектом; предел страхует от зацикливания
  const queue = [...effects];
  // ключи «один раз»: у исходных эффектов — по месту и номеру, у эффектов улики — по улике и номеру
  const keys: (string | undefined)[] = effects.map((_, i) => (ctx.site ? `once:${ctx.site}#${i}` : undefined));
  for (let i = 0; i < queue.length && i < 1000; i++) {
    const e = queue[i];
    if (e.requires && !meets(e.requires, next, ctx.locationId)) continue;
    const onceKey = e.once ? keys[i] : undefined;
    if (onceKey) {
      if (next.fired.includes(onceKey)) continue;
      next.fired.push(onceKey);
    }
    switch (e.type) {
      case "addEvidence":
        if (!next.collected.includes(e.evidenceId)) {
          next.collected.push(e.evidenceId);
          newEvidence.push(e.evidenceId);
          const extra = ctx.onCollect?.(e.evidenceId) ?? [];
          if (extra.length) {
            queue.splice(i + 1, 0, ...extra);
            keys.splice(i + 1, 0, ...extra.map((_, j) => `once:collect:${e.evidenceId}#${j}`));
          }
        }
        break;
      case "changeVariable": {
        const id = e.variableId;
        if (e.action === "assign") {
          if (e.valueId !== undefined) next.enums[id] = e.valueId;
        } else if (e.action === "on" || e.action === "off" || e.action === "toggle") {
          const has = next.flags.includes(id);
          const want = e.action === "toggle" ? !has : e.action === "on";
          if (want && !has) next.flags.push(id);
          if (!want) next.flags = next.flags.filter((f) => f !== id);
        } else {
          const cur = next.counters[id] ?? 0;
          const n = e.value ?? 0;
          const v = e.action === "add" ? cur + n : e.action === "subtract" ? cur - n : n;
          next.counters[id] = clampCounter(v, counterDefs.find((c) => c.id === id));
        }
        break;
      }
      case "removeEvidence":
        if (next.collected.includes(e.evidenceId)) {
          next.collected = next.collected.filter((id) => id !== e.evidenceId);
          removedEvidence.push(e.evidenceId);
        }
        break;
      case "failCase":
        followUp.failCase = { text: e.text };
        break;
      case "startDialogue":
        followUp.dialogueId = e.dialogueId;
        break;
      case "travel":
        followUp.travel = { to: e.locationId, spawn: { x: e.x, y: e.y } };
        break;
      case "message":
        if (e.text.trim()) messages.push(e.text);
        break;
      case "addCharacterNote": {
        const notes = next.characterNotes[e.characterId] ?? [];
        if (!notes.includes(e.text)) next.characterNotes[e.characterId] = [...notes, e.text];
        break;
      }
      case "follow":
        if (!next.followers.includes(e.characterId)) next.followers.push(e.characterId);
        break;
      case "stay": {
        next.followers = next.followers.filter((id) => id !== e.characterId);
        const place = whereIs(e.characterId);
        if (place) next.npcPlaces[e.characterId] = place;
        break;
      }
      case "returnHome":
        next.followers = next.followers.filter((id) => id !== e.characterId);
        delete next.npcPlaces[e.characterId];
        break;
      case "moveTo":
        // идёт на своё место: итог записываем сразу, ход — дело сцены (если дойти нельзя, она вернёт фактическое место)
        next.followers = next.followers.filter((id) => id !== e.characterId);
        next.npcPlaces[e.characterId] = { locationId: e.locationId, x: e.x, y: e.y, ...(e.failText ? { failText: e.failText } : {}) };
        break;
    }
  }
  return { progress: next, newEvidence, messages, removedEvidence, followUp };
}
