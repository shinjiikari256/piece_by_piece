import type { SceneHost } from "../game/host";
import { platform } from "./platform";
import { actions, isWorldBlocked, onPlayAnimation, store } from "./store";

/** Хост сцены поверх стора игры. */
export function createSceneHost(): SceneHost {
  return {
    getState: store.get,
    subscribe: store.subscribe,
    isBlocked: () => isWorldBlocked(store.get()),
    onPlayAnimation,
    onInteract: (id) => actions.interact(id),
    hasZoneAction: (id) => actions.hasZoneAction(id),
    enterZone: (id) => actions.enterZone(id),
    leaveZone: (id) => actions.leaveZone(id),
    releaseFollowers: () => actions.releaseFollowers(),
    setNpcPlace: (characterId, place) => actions.npcPlaced(characterId, place),
    consumeSpawn: () => actions.consumeSpawn(),
    savedPlayer: () => store.get().savedPlayer,
    savePlayerPosition: (caseId, player) => {
      actions.rememberPlayer(player);
      void platform().saves.savePlayerPosition(caseId, player);
    },
  };
}
