import { activeState } from "../../../../shared/object-state";
import type { ClipStep, Effect } from "../../../../shared/case";
import { applyEffects, meets, type EffectOutcome } from "../../../../shared/conditions";
import { zoneTargetCell } from "../content/case-utils";
import { gameBridge } from "../game/bridge";
import { platform } from "./platform";
import { onAfterSet, set, state, toast } from "./core";

/** Состояния предметов на прошлой проверке (`null` — игра не идёт; первая проверка только запоминает, эффекты не срабатывают). */
let objectStateMemo: Map<string, string | null> | null = null;
let stateDepth = 0;
/** Живая смена состояния предмета: эффекты выхода из прежнего и входа в новое (при загрузке сохранения не срабатывают). */
function watchObjectStates() {
  const c = state.caseFile;
  if (!c || state.screen !== "play") {
    objectStateMemo = null;
    return;
  }
  const now = new Map<string, string | null>();
  for (const l of c.locations) for (const o of l.objects) if (o.states?.length) now.set(`${l.id}/${o.id}`, activeState(o, state.progress, state.locationId)?.id ?? null);
  const prev = objectStateMemo;
  objectStateMemo = now;
  if (!prev || stateDepth >= 5) return;
  const run: { site: string; effects: Effect[] }[] = [];
  for (const l of c.locations)
    for (const o of l.objects) {
      const key = `${l.id}/${o.id}`;
      const [was, is] = [prev.get(key) ?? null, now.get(key) ?? null];
      if (was === is) continue;
      const fx = (id: string | null, phase: "onExit" | "onEnter") => (id ? o.states?.find((st) => st.id === id)?.[phase] ?? [] : []);
      run.push({ site: `state:${o.id}/${was}>exit`, effects: fx(was, "onExit") }, { site: `state:${o.id}/${is}>enter`, effects: fx(is, "onEnter") });
    }
  stateDepth++;
  try {
    for (const { site, effects } of run) {
      if (!effects.length) continue;
      const out = applyEffects(withZoneTargets(effects), state.progress, fxCtx(site));
      set({ progress: out.progress });
      announce(out.newEvidence, out.messages, out.removedEvidence, out.followUp);
    }
  } finally {
    stateDepth--;
  }
}
onAfterSet(watchObjectStates);

function evidenceTitle(id: string) {
  return state.caseFile?.evidence.find((e) => e.id === id)?.title ?? id;
}

/** Итог эффектов для игрока: новые и убранные улики, сообщения автора (длинный текст висит дольше), затем перенос игрока и запуск диалога. */
export function announce(newEvidence: string[], messages: string[], removedEvidence: string[] = [], followUp: EffectOutcome["followUp"] = {}) {
  newEvidence.forEach((id) => toast(`В дело добавлено: ${evidenceTitle(id)}`));
  removedEvidence.forEach((id) => toast(`Из дела убрано: ${evidenceTitle(id)}`));
  messages.forEach((text) => toast(text, Math.min(9000, 2500 + text.length * 50)));
  runFollowUp(followUp);
}

/** Подписчики на эффект `playAnimation` (сцена Phaser, через хост). */
const animationListeners = new Set<(objectId: string, clip: ClipStep[]) => void>();
export const onPlayAnimation = (fn: (objectId: string, clip: ClipStep[]) => void) => {
  animationListeners.add(fn);
  return () => void animationListeners.delete(fn);
};

let followDepth = 0;
/** Перенос игрока и запуск диалога, которые потребовали эффекты. Глубина ограничена: локации с взаимным переносом не зациклят игру. */
function runFollowUp(f: EffectOutcome["followUp"]) {
  // анимации — только вид: сцена проигрывает их, если предмет в текущей локации
  f.animations?.forEach((a) => animationListeners.forEach((fn) => fn(a.objectId, a.clip)));
  if ((!f.travel && !f.dialogueId && !f.failCase) || followDepth >= 5) return;
  followDepth++;
  try {
    if (f.travel) moveToLocation(f.travel.to, f.travel.spawn);
    const dialogue = f.dialogueId ? state.caseFile?.dialogues.find((d) => d.id === f.dialogueId) : undefined;
    if (dialogue) enterNode(`effect:${dialogue.id}`, dialogue.id, dialogue.startNodeId);
    // дело провалено: прохождение стирается, результат не пишется; окно перекрывает всё остальное
    if (f.failCase && state.caseFile) {
      void platform().saves.clear(state.caseFile.id);
      set({ overlay: { kind: "failed", text: f.failCase.text } });
    }
  } finally {
    followDepth--;
  }
}

export function moveToLocation(to: string, spawn: { x: number; y: number }) {
  set({ locationId: to, spawn });
  enterLocation(to);
}

const whereIs = (characterId: string) => gameBridge.whereIs?.(characterId);
/** Окружение эффектов: где стоят персонажи, границы счётчиков, где игрок (для условий эффектов). */
export const fxCtx = (site?: string) => ({
  site,
  whereIs,
  counters: state.caseFile?.counters ?? [],
  locationId: state.locationId,
  // эффекты улики срабатывают сразу после её выдачи
  onCollect: (id: string) => withZoneTargets(state.caseFile?.evidence.find((e) => e.id === id)?.onCollect ?? []),
});

/** Игрок вошёл в локацию: эффекты входа при каждом входе (один раз — настройкой `once` у самого эффекта). */
export function enterLocation(locationId: string) {
  const loc = state.caseFile?.locations.find((l) => l.id === locationId);
  if (!loc?.onEnter?.length) return;
  const { progress, newEvidence, messages, removedEvidence, followUp } = applyEffects(withZoneTargets(loc.onEnter), state.progress, fxCtx(`enter:${loc.id}`));
  set({ progress });
  announce(newEvidence, messages, removedEvidence, followUp);
}

/**
 * `moveTo` с областью: персонаж встаёт на свободную клетку внутри неё — подставляем её в `x, y`
 * (чужие итоговые места и клетки, занятые раньше в этом же наборе эффектов, пропускаем).
 */
export function withZoneTargets(effects: Effect[]): Effect[] {
  const c = state.caseFile;
  if (!c || !effects.some((e) => e.type === "moveTo" && e.zoneId)) return effects;
  const taken = new Map<string, Set<string>>();
  const mark = (locationId: string, x: number, y: number) => taken.set(locationId, (taken.get(locationId) ?? new Set()).add(`${x},${y}`));
  for (const [id, p] of Object.entries(state.progress.npcPlaces)) if (!effects.some((e) => e.type === "moveTo" && e.characterId === id)) mark(p.locationId, p.x, p.y);
  return effects.map((e) => {
    if (e.type !== "moveTo" || !e.zoneId) return e;
    const loc = c.locations.find((l) => l.id === e.locationId);
    const zone = loc?.zones.find((z) => z.id === e.zoneId);
    const cell = loc && zone ? zoneTargetCell(loc, zone, e.characterId, taken.get(loc.id)) : null;
    if (!cell) return e; // области нет или она вся занята: идёт на запасную клетку
    mark(e.locationId, cell.x, cell.y);
    return { ...e, x: cell.x, y: cell.y };
  });
}

export function enterNode(npcId: string, dialogueId: string, nodeId: string, depth = 0) {
  const dialogue = state.caseFile?.dialogues.find((d) => d.id === dialogueId);
  const node = dialogue?.nodes.find((n) => n.id === nodeId);
  if (!node) return;
  const { progress, newEvidence, messages, removedEvidence, followUp } = applyEffects(withZoneTargets(node.effects), state.progress, fxCtx(`node:${dialogueId}/${nodeId}`));
  // узел-переход: игрок его не видит, первый вариант с выполненным условием срабатывает сам; предел глубины страхует от цикла
  if (node.auto) {
    set({ progress });
    announce(newEvidence, messages, removedEvidence, followUp);
    if (followUp.dialogueId || followUp.failCase) return;
    const pick = node.choices.find((ch) => meets(ch.requires, state.progress, state.locationId));
    if (!pick || depth >= 20) return set({ overlay: null });
    if (pick.effects?.length) {
      const out = applyEffects(withZoneTargets(pick.effects), state.progress, fxCtx(`choice:${dialogueId}/${nodeId}/${pick.id}`));
      set({ progress: out.progress });
      announce(out.newEvidence, out.messages, out.removedEvidence, out.followUp);
      if (out.followUp.failCase || (out.followUp.dialogueId && state.caseFile?.dialogues.some((d) => d.id === out.followUp.dialogueId))) return;
    }
    if (pick.next === null) return set({ overlay: null });
    return enterNode(npcId, dialogueId, pick.next, depth + 1);
  }
  set({ progress, overlay: { kind: "dialogue", npcId, dialogueId, nodeId } });
  announce(newEvidence, messages, removedEvidence, followUp);
}
