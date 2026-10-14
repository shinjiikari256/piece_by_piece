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
