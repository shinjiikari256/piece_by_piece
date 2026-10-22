import "./game-zoom.css";
import { useSyncExternalStore } from "react";
import { GAME_ZOOM_MAX, gameZoom } from "../game/bridge";
import { stepZoom, ZoomControl } from "./zoom-control";

/** Шаг по переключателю; ctrl + колесо и кнопки делают одно и то же. */
export function stepGameZoom(dir: 1 | -1) {
  const { value, min } = gameZoom.shown();
  gameZoom.set(stepZoom(value, dir, min, GAME_ZOOM_MAX));
}

/** Масштаб поля: полоска внизу области просмотра. */
export function GameZoom() {
  const mode = useSyncExternalStore(gameZoom.subscribe, gameZoom.get);
  const { value, min } = useSyncExternalStore(gameZoom.subscribeShown, gameZoom.shown);
  return (
    <div className="game-zoom">
      <ZoomControl
        label="Масштаб поля"
        value={value}
        min={min}
        max={GAME_ZOOM_MAX}
        fitted={mode === "fit"}
        valueText={`${Math.round(value * 100)}%`}
        onStep={stepGameZoom}
        onFit={() => gameZoom.set("fit")}
      />
    </div>
  );
}
