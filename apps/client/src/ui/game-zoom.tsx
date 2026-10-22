import "./game-zoom.css";
import { useSyncExternalStore } from "react";
import { GAME_ZOOM_MAX, gameZoom } from "../game/bridge";

/** Шаг переключателя — 100%: тайл на один базовый размер крупнее. */
const STEP = 1;

/**
 * Следующий масштаб в шаговом переключателе. Если текущий не кратен шагу (например, «вписать» дало 137%),
 * «+» идёт к ближайшему кратному выше, «−» — к ближайшему кратному ниже; граница — min и GAME_ZOOM_MAX.
 */
export function stepZoom(current: number, dir: 1 | -1, min: number): number {
  if (dir > 0) return current >= GAME_ZOOM_MAX ? current : Math.min(GAME_ZOOM_MAX, Math.floor(current / STEP + 1) * STEP);
  return current <= min ? current : Math.max(min, Math.ceil(current / STEP - 1) * STEP);
}

/** Шаг по переключателю; ctrl + колесо и кнопки делают одно и то же. */
export function stepGameZoom(dir: 1 | -1) {
  const { value, min } = gameZoom.shown();
  gameZoom.set(stepZoom(value, dir, min));
}

/** Масштаб поля: «−» 100% «+» и отдельно «вписать». */
export function GameZoom() {
  const mode = useSyncExternalStore(gameZoom.subscribe, gameZoom.get);
  const { value, min } = useSyncExternalStore(gameZoom.subscribeShown, gameZoom.shown);
  const down = stepZoom(value, -1, min);
  const up = stepZoom(value, 1, min);
  return (
    <div className="game-zoom" role="group" aria-label="Масштаб поля">
      <button className="btn btn--sm btn--icon game-zoom__step" onClick={() => stepGameZoom(-1)} disabled={down === value} aria-label="Уменьшить масштаб">
        −
      </button>
      <span className="game-zoom__value" aria-live="polite">
        {Math.round(value * 100)}%
      </span>
      <button className="btn btn--sm btn--icon game-zoom__step" onClick={() => stepGameZoom(1)} disabled={up === value} aria-label="Увеличить масштаб">
        +
      </button>
      <button
        className="btn btn--sm game-zoom__fit"
        aria-pressed={mode === "fit"}
        onClick={() => gameZoom.set("fit")}
        title="Вся карта на экране"
      >
        вписать
      </button>
    </div>
  );
}
