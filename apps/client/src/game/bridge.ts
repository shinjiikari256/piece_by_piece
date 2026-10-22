import { readJson, writeJson } from "../state/storage";
export interface CharacterPlace {
  locationId: string;
  x: number;
  y: number;
}

/** Что сцена даёт интерфейсу, пока она жива. */
export interface SceneHandlers {
  interactNearest(): void;
  /** Где сейчас стоит персонаж в сцене (для «остаться здесь»). */
  whereIs(characterId: string): CharacterPlace | undefined;
}

const idle: SceneHandlers = { interactNearest: () => {}, whereIs: () => undefined };

/** Узкий мост между Phaser-сценой и React-интерфейсом. Без сцены обработчики ничего не делают. */
class GameBridge {
  private handlers: SceneHandlers = idle;
  /** Подписчики на «рядом есть с чем взаимодействовать». */
  readonly focusListeners = new Set<(label: string | null) => void>();
  /** Направление с экранного джойстика, компоненты от −1 до 1. */
  joystick = { x: 0, y: 0 };

  /** Сцена подключается при создании; возвращает отключение. */
  attach(handlers: SceneHandlers): () => void {
    this.handlers = handlers;
    return () => {
      if (this.handlers === handlers) this.handlers = idle;
    };
  }

  interactNearest = () => this.handlers.interactNearest();
  whereIs = (characterId: string) => this.handlers.whereIs(characterId);
}

export const gameBridge = new GameBridge();

/** Масштаб поля: «вписать» или во сколько раз тайл больше базового (32 px). */
export type GameZoom = "fit" | number;
/** Наибольший масштаб в шаговом переключателе (300%). */
export const GAME_ZOOM_MAX = 3;

/** По умолчанию: на десктопе «вписать», на телефоне 100% (те же условия, что у мобильной шапки в mobile.css). */
const defaultZoom = (): GameZoom =>
  typeof window !== "undefined" && window.matchMedia?.("(max-width: 640px), (max-height: 500px)").matches ? 1 : "fit";

const ZOOM_KEY = "zoom";

/** Предпочтение игрока (localStorage) важнее умолчания; битое или чужое значение игнорируем. */
const savedZoom = (): GameZoom | null => {
  const v = readJson<unknown>(ZOOM_KEY, null);
  return v === "fit" || (typeof v === "number" && v >= 0.3 && v <= GAME_ZOOM_MAX) ? v : null;
};

/** Выбор масштаба запоминается в браузере и действует во всех делах. */
let zoom: GameZoom = savedZoom() ?? defaultZoom();
const zoomListeners = new Set<() => void>();
/** Фактический масштаб камеры (после «вписать» и нижней границы) и сама граница — сообщает сцена. */
let shown = { value: 1, min: 1 };
const shownListeners = new Set<() => void>();

export const gameZoom = {
  get: () => zoom,
  set(next: GameZoom) {
    zoom = next;
    writeJson(ZOOM_KEY, next);
    zoomListeners.forEach((l) => l());
  },
  subscribe(listener: () => void) {
    zoomListeners.add(listener);
    return () => void zoomListeners.delete(listener);
  },
  shown: () => shown,
  setShown(value: number, min: number) {
    if (shown.value === value && shown.min === min) return;
    shown = { value, min };
    shownListeners.forEach((l) => l());
  },
  subscribeShown(listener: () => void) {
    shownListeners.add(listener);
    return () => void shownListeners.delete(listener);
  },
};
