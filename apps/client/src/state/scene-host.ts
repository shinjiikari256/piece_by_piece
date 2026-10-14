import type { SceneHost } from "../game/host";
import { readSave, savePlayerPosition } from "./persistence";
import { actions, isWorldBlocked, store } from "./store";

/** Хост сцены поверх стора игры. */
export function createSceneHost(): SceneHost {
  return {
    getState: store.get,
    subscribe: store.subscribe,
    isBlocked: () => isWorldBlocked(store.get()),
    onInteract: (id) => actions.interact(id),
    confrontationWith: (id) => actions.confrontationWith(id),
    consumeSpawn: () => actions.consumeSpawn(),
    savedPlayer: (caseId) => readSave(caseId)?.player,
    savePlayerPosition,
  };
}
