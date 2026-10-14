import type { SaveData } from "./save-data";
import type { ResultRecord } from "./result-record";

/**
 * Платформа игры — всё, что зависит от среды (браузер без сервера, сайт с учётной записью, позже — сервер).
 * Ядро игры (стор, автосохранение, сцена) работает только с этим интерфейсом и не знает, где живёт игрок.
 * Все операции асинхронные: сегодня данные в `localStorage`, завтра — на сервере.
 */

/** Сохранение расследования. */
export interface SaveStore {
  read(caseId: string): Promise<SaveData | null>;
  /** false — хранилище не приняло запись (игра покажет предупреждение). */
  write(save: Omit<SaveData, "v" | "savedAt" | "player">): Promise<boolean>;
  clear(caseId: string): Promise<void>;
  /** Игрок вышел из дела: время отсутствия не идёт в таймер. */
  markPaused(caseId: string): Promise<void>;
  /** Позицию игрока пишет сцена; только поверх уже существующего сохранения. */
  savePlayerPosition(caseId: string, player: { x: number; y: number; locationId: string }): Promise<void>;
}

/** История результатов игрока. */
export interface ResultStore {
  /** `delivered: false` — результат сохранён только у игрока и не дошёл до места назначения (игра покажет предупреждение). */
  record(result: ResultRecord): Promise<{ delivered: boolean }>;
}

export interface GamePlatform {
  saves: SaveStore;
  results: ResultStore;
}

let current: GamePlatform | null = null;

/** Подключить платформу; вызывается один раз при старте (`main.tsx`, тесты). */
export function setPlatform(platform: GamePlatform) {
  current = platform;
}

export function platform(): GamePlatform {
  if (!current) throw new Error("Платформа игры не подключена: вызовите setPlatform() при старте");
  return current;
}
