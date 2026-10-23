import { objectView } from "../../../../shared/object-state";
import { objectEvidenceIds, type Zone, type ZoneAction } from "../../../../shared/case";
import { applyEffects, meets } from "../../../../shared/conditions";
import { allNpcs, findObject } from "../content/case-utils";
import { isWorldBlocked, rememberPlayer, set, state, toast } from "./core";
import { announce, enterNode, fxCtx, moveToLocation, withZoneTargets } from "./flow";

/** Сколько спутник стоит в области без подходящего действия, прежде чем уйти домой. */
const FOLLOWER_DISMISS_MS = 3000;
const dismissTimers = new Map<string, ReturnType<typeof setTimeout>>();

/** Устойчивый ключ действия области (не зависит от порядка в списке) — для «сработало один раз». */
const actionKey = (zoneId: string, a: ZoneAction) =>
  `${zoneId}:${a.kind}:${a.kind === "dialogue" ? a.dialogueId : a.kind === "object" ? a.objectId : a.kind === "effects" ? JSON.stringify(a.effects) : a.to}`;

type ZoneMode = "use" | "enter" | "leave";

/** Действия области, подходящие под способ запуска: `use` — по клавише (всё, кроме «при выходе»), `enter` — при входе (разовые — ещё не сработавшие), `leave` — при выходе. */
function zoneCandidates(zoneId: string, mode: ZoneMode): ZoneAction[] {
  const zone = state.caseFile?.locations.flatMap((l) => l.zones).find((z) => z.id === zoneId);
  return (zone?.actions ?? []).filter((a) => {
    if (a.kind === "dialogue" && !state.caseFile!.dialogues.some((d) => d.id === a.dialogueId)) return false;
    if (mode === "use") return a.trigger !== "leave";
    if (mode === "leave") return a.trigger === "leave";
    return a.trigger === "enterEvery" || (a.trigger === "enter" && !state.progress.fired.includes(actionKey(zoneId, a)));
  });
}

/** Первое подходящее действие области: условие выполнено, цель существует. */
function zoneAction(zoneId: string, mode: ZoneMode = "use"): ZoneAction | undefined {
  return zoneCandidates(zoneId, mode).find((a) => meets(a.requires, state.progress, state.locationId));
}

/** Текст отказа первого действия, которому не хватило условия (`lockedText`). */
function zoneLockedText(zoneId: string, mode: ZoneMode): string | undefined {
  return zoneCandidates(zoneId, mode).find((a) => a.lockedText && !meets(a.requires, state.progress, state.locationId))?.lockedText;
}

/** Запасной ответ области: есть, а ни одно действие «по клавише» сейчас не подходит (у области вообще есть действия). */
function zoneFallback(zoneId: string): Zone["fallback"] {
  const zone = state.caseFile?.locations.flatMap((l) => l.zones).find((z) => z.id === zoneId);
  return zone?.fallback && zone.actions.length && !zoneAction(zoneId) ? zone.fallback : undefined;
}

function runZoneFallback(zoneId: string, f: NonNullable<Zone["fallback"]>) {
  if (f.text) toast(f.text);
  if (!f.effects.length) return;
  const { progress, newEvidence, messages, removedEvidence, followUp } = applyEffects(withZoneTargets(f.effects), state.progress, fxCtx(`zone:${zoneId}#fallback`));
  set({ progress });
  announce(newEvidence, messages, removedEvidence, followUp);
}

/** Выполнить действие области: диалог, взаимодействие с предметом или выход. */
function runZoneAction(zoneId: string, a: ZoneAction) {
  if (a.kind === "dialogue") {
    const dialogue = state.caseFile?.dialogues.find((d) => d.id === a.dialogueId);
    if (dialogue) enterNode(`zone:${zoneId}`, dialogue.id, dialogue.startNodeId);
  } else if (a.kind === "object") world.interact(a.objectId);
  else if (a.kind === "effects") {
    const { progress, newEvidence, messages, removedEvidence, followUp } = applyEffects(
      withZoneTargets(a.effects),
      state.progress,
      fxCtx(
        `zone:${zoneId}#${state.caseFile?.locations
          .flatMap((l) => l.zones)
          .find((z) => z.id === zoneId)
          ?.actions.indexOf(a)}`,
      ),
    );
    set({ progress });
    announce(newEvidence, messages, removedEvidence, followUp);
  } else world.travel({ to: a.to, spawn: a.spawn });
}

/** Области, предметы, переходы и персонажи на карте. */
export const world = {
  /** Есть ли сейчас что делать в области (подсказка «Взаимодействие» показывается только тогда): подходящее действие или текст отказа. */
  hasZoneAction(zoneId: string) {
    return !!zoneAction(zoneId) || !!zoneLockedText(zoneId, "use") || !!zoneFallback(zoneId);
  },

  /** Игрок вошёл в область: срабатывает первое подходящее действие «при входе» (разовое — один раз за прохождение); нет подходящего, но есть текст отказа — показываем его. */
  enterZone(zoneId: string) {
    if (isWorldBlocked(state)) return;
    const action = zoneAction(zoneId, "enter");
    if (!action) {
      const locked = zoneLockedText(zoneId, "enter");
      const fallback = zoneFallback(zoneId);
      if (locked) toast(locked);
      else if (fallback) runZoneFallback(zoneId, fallback);
      // область с действиями, из которых сейчас ничего не подходит: спутники постоят и уйдут по своим местам
      const zone = state.caseFile?.locations.flatMap((l) => l.zones).find((z) => z.id === zoneId);
      if (zone?.actions.length && !zoneAction(zoneId) && state.progress.followers.length) {
        const where = state.locationId;
        clearTimeout(dismissTimers.get(zoneId));
        dismissTimers.set(
          zoneId,
          setTimeout(() => {
            dismissTimers.delete(zoneId);
            if (state.screen === "play" && state.locationId === where) world.releaseFollowers();
          }, FOLLOWER_DISMISS_MS),
        );
      }
      return;
    }
    set((s) => ({ progress: { ...s.progress, fired: [...s.progress.fired, actionKey(zoneId, action)] } }));
    runZoneAction(zoneId, action);
  },

  /** Игрок вышел из области: спутники больше не «ждут» там. */
  leaveZone(zoneId: string) {
    clearTimeout(dismissTimers.get(zoneId));
    dismissTimers.delete(zoneId);
    // действия «при выходе из области»
    if (isWorldBlocked(state)) return;
    const action = zoneAction(zoneId, "leave");
    if (action) runZoneAction(zoneId, action);
  },

  /** Отвязать всех спутников: каждый возвращается на своё место пешком (вручную — кнопка «Отпустить», сама — см. `enterZone`). */
  releaseFollowers() {
    const ids = state.progress.followers;
    if (!ids.length) return;
    const { progress } = applyEffects(
      ids.map((characterId) => ({ type: "returnHome" as const, characterId })),
      state.progress,
      fxCtx(),
    );
    set({ progress });
  },

  /** Переход через дверь в другую локацию; сцену перестраивает OfficeScene. */
  travel(exit: { to: string; spawn: { x: number; y: number } }) {
    if (isWorldBlocked(state)) return;
    moveToLocation(exit.to, exit.spawn);
  },

  /** Сцена запомнила позицию игрока (без перерисовки: меняется каждую секунду движения). */
  rememberPlayer(player: { x: number; y: number; locationId: string }) {
    rememberPlayer(player);
  },

  /**
   * Сцена сообщает, где персонаж оказался на самом деле: дошёл, вернулся или остался на месте, когда путь закрыт.
   * `null` — стоит на исходном месте (запись в `npcPlaces` не нужна).
   */
  npcPlaced(characterId: string, place: { locationId: string; x: number; y: number } | null) {
    const npcPlaces = { ...state.progress.npcPlaces };
    if (place) npcPlaces[characterId] = place;
    else delete npcPlaces[characterId];
    set({ progress: { ...state.progress, npcPlaces } });
  },

  /** Сцена забрала точку появления. */
  consumeSpawn() {
    if (state.spawn) set({ spawn: null });
  },

  /** Вызывается из Phaser по E/клику: объект или NPC. */
  interact(targetId: string) {
    const s = state;
    if (isWorldBlocked(s) || !s.caseFile) return;
    if (targetId.startsWith("zone:")) {
      const zoneId = targetId.slice(5);
      const action = zoneAction(zoneId);
      if (action) runZoneAction(zoneId, action);
      else {
        const locked = zoneLockedText(zoneId, "use");
        const fallback = zoneFallback(zoneId);
        if (locked) toast(locked);
        else if (fallback) runZoneFallback(zoneId, fallback);
      }
      return;
    }
    const npc = allNpcs(s.caseFile).find((n) => n.id === targetId);
    if (npc) {
      if (!meets(npc.requires, s.progress, s.locationId)) return; // человека сейчас на карте нет
      // диалоги по условию — по порядку, первый подходящий; иначе диалог по умолчанию
      const dialogueId = npc.dialogues.find((d) => meets(d.requires, s.progress, s.locationId))?.dialogueId ?? npc.dialogueId;
      const dialogue = s.caseFile.dialogues.find((d) => d.id === dialogueId);
      if (!dialogue) return;
      enterNode(npc.id, dialogue.id, dialogue.startNodeId);
      return;
    }
    // осмотренное сразу попадает в дело
    const obj = findObject(s.caseFile, targetId);
    const view = obj ? objectView(obj, s.progress, s.locationId) : null;
    if (obj && view?.interactive) {
      // всё, что даёт осмотр (улики, флаги, сообщения…), — эффекты `onInteract` (в действующем состоянии): при каждом осмотре, разово — настройкой `once`
      const { progress, newEvidence, messages, removedEvidence, followUp } = applyEffects(withZoneTargets(view.onInteract), s.progress, fxCtx(`object:${obj.id}`));
      set({
        progress,
        // окно осмотра — только у предмета с `interaction` (в действующем состоянии); без него эффекты срабатывают молча (или сообщением)
        ...(view.interaction
          ? {
              overlay: { kind: "object" as const, objectId: obj.id, gained: newEvidence.filter((id) => objectEvidenceIds(obj).includes(id)) },
              examined: s.examined.includes(obj.id) ? s.examined : [...s.examined, obj.id],
            }
          : {}),
      });
      announce(newEvidence, messages, removedEvidence, followUp);
    }
  },
};
