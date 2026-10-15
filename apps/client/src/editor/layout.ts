import { useSyncExternalStore } from "react";
import { readJson, writeJson } from "../state/storage";

/** Где стоит палитра редактора локаций: слева колонкой или снизу полосой под картой. Выбор — в шапке конструктора, помнится в браузере. */
export type MapDock = "left" | "bottom";

const KEY = "editor:map-dock";
let dock: MapDock = readJson<string>(KEY, "left") === "bottom" ? "bottom" : "left";
const listeners = new Set<() => void>();

export function setMapDock(next: MapDock) {
  dock = next;
  writeJson(KEY, next);
  listeners.forEach((l) => l());
}

export const useMapDock = (): MapDock =>
  useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => void listeners.delete(l);
    },
    () => dock,
  );
