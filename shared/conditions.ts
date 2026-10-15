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
}

export const emptyProgress = (): Progress => ({
  collected: [],
  flags: [],
  deductions: [],
  characterNotes: {},
  followers: [],
  npcPlaces: {},
});

export function meets(cond: Condition | undefined, p: Progress): boolean {
  if (!cond) return true;
  return (
    (cond.evidence ?? []).every((id) => p.collected.includes(id)) &&
    (cond.flags ?? []).every((f) => p.flags.includes(f)) &&
    (cond.notFlags ?? []).every((f) => !p.flags.includes(f)) &&
    (cond.deductions ?? []).every((id) => p.deductions.includes(id)) &&
    (cond.following ?? []).every((id) => p.followers.includes(id)) &&
    (cond.notFollowing ?? []).every((id) => !p.followers.includes(id))
  );
}

export interface EffectOutcome {
  progress: Progress;
  newEvidence: string[];
}

/**
 * @param whereIs — где сейчас стоит персонаж (нужно для «stay»: остаётся там, куда дошёл).
 * Эффект `moveTo` пишет итоговое место сразу; идёт персонаж к нему уже в сцене.
 */
export function applyEffects(
  effects: Effect[],
  p: Progress,
  whereIs: (characterId: string) => Place | undefined = () => undefined,
): EffectOutcome {
  const next: Progress = {
    ...p,
    collected: [...p.collected],
    flags: [...p.flags],
    characterNotes: { ...p.characterNotes },
    followers: [...p.followers],
    npcPlaces: { ...p.npcPlaces },
  };
  const newEvidence: string[] = [];
  for (const e of effects) {
    switch (e.type) {
      case "addEvidence":
        if (!next.collected.includes(e.evidenceId)) {
          next.collected.push(e.evidenceId);
          newEvidence.push(e.evidenceId);
        }
        break;
      case "setFlag":
        if (!next.flags.includes(e.flag)) next.flags.push(e.flag);
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
  return { progress: next, newEvidence };
}
