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
  npcPlaces: {},
  fired: [],
});

function meetsAll(cond: Omit<Condition, "anyOf">, p: Progress, locationId?: string): boolean {
  return (
    (cond.evidence ?? []).every((id) => p.collected.includes(id)) &&
    (cond.flags ?? []).every((f) => p.flags.includes(f)) &&
    (cond.notFlags ?? []).every((f) => !p.flags.includes(f)) &&
    (cond.deductions ?? []).every((id) => p.deductions.includes(id)) &&
    (cond.following ?? []).every((id) => p.followers.includes(id)) &&
    (cond.notFollowing ?? []).every((id) => !p.followers.includes(id)) &&
    (cond.counters ?? []).every((r) => {
      const v = p.counters?.[r.counterId] ?? 0;
      return (r.min === undefined || v >= r.min) && (r.max === undefined || v <= r.max);
    }) &&
    (!cond.inLocation?.length || (locationId !== undefined && cond.inLocation.includes(locationId)))
  );
}

/** @param locationId — где сейчас игрок (для `inLocation`; не передан — такое условие не выполняется). */
/** Начало расследования: флаги и счётчики с начальными значениями из дела. */
export function startProgress(c: { flags?: { id: string; initial?: boolean }[]; counters?: CounterDef[] } | null | undefined): Progress {
  return {
    ...emptyProgress(),
    flags: (c?.flags ?? []).filter((f) => f.initial).map((f) => f.id),
    counters: Object.fromEntries((c?.counters ?? []).filter((x) => x.initial).map((x) => [x.id, clampCounter(x.initial!, x)])),
  };
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
  return meetsAll(cond, p, locationId) && (!cond.anyOf?.length || cond.anyOf.some((alt) => meetsAll(alt, p, locationId)));
}

export interface EffectOutcome {
  progress: Progress;
  newEvidence: string[];
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
    npcPlaces: { ...p.npcPlaces },
    fired: [...(p.fired ?? [])],
  };
  const newEvidence: string[] = [];
  for (const e of effects) {
    if (e.requires && !meets(e.requires, next, ctx.locationId)) continue;
    switch (e.type) {
      case "addEvidence":
        if (!next.collected.includes(e.evidenceId)) {
          next.collected.push(e.evidenceId);
          newEvidence.push(e.evidenceId);
        }
        break;
      case "changeVariable": {
        const id = e.variableId;
        if (e.action === "on" || e.action === "off" || e.action === "toggle") {
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
  return { progress: next, newEvidence };
}
