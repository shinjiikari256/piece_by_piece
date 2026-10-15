import type { SceneHost } from "../game/host";
import { platform } from "./platform";
import { actions, isWorldBlocked, store } from "./store";

/** Хост сцены поверх стора игры. */
export function createSceneHost(): SceneHost {
  return {
    getState: store.get,
    subscribe: store.subscribe,
    isBlocked: () => isWorldBlocked(store.get()),
    onInteract: (id) => actions.interact(id),
    confrontationWith: (id) => actions.confrontationWith(id),
    hasZoneAction: (id) => actions.hasZoneAction(id),
    enterZone: (id) => actions.enterZone(id),
    setNpcPlace: (characterId, place) => actions.npcPlaced(characterId, place),
    consumeSpawn: () => actions.consumeSpawn(),
    savedPlayer: () => store.get().savedPlayer,
    savePlayerPosition: (caseId, player) => {
      actions.rememberPlayer(player);
      void platform().saves.savePlayerPosition(caseId, player);
    },
  };
}
