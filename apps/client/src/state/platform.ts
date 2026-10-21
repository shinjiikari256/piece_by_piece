import type { SaveData } from "./save-data";
import type { ResultRecord } from "./result-record";

/**
 * Платформа игры — всё, что зависит от среды (браузер без сервера, сайт с учётной записью, позже — сервер).
 * Ядро игры (стор, автосохранение, сцена) работает только с этим интерфейсом и не знает, где живёт игрок.
 * Все операции асинхронные: сегодня данные в `localStorage`, завтра — на сервере.
 */

/** Профиль игрока без учётной записи: ФИО и группа для документов. */
export interface Profile {
  name: string;
  group: string;
}

export const EMPTY_PROFILE: Profile = { name: "", group: "" };

/** Сохранение расследования. */
export interface SaveStore {
  /** Все сохранения, свежие сверху. */
  list(): Promise<SaveData[]>;
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
  record(result: ResultRecord, opts?: { recordedOnServer?: boolean }): Promise<{ delivered: boolean }>;
  /** История результатов игрока, свежие сверху. */
  list(): Promise<ResultRecord[]>;
  clear(): Promise<void>;
}

export interface ProfileStore {
  read(): Promise<Profile>;
  write(profile: Profile): Promise<void>;
  /** Профиль изменился (сохранили в другом окне экрана); возвращает отписку. */
  subscribe(listener: () => void): () => void;
}

/** Чем отличается среда: экраны сайта спрашивают это здесь, а не у сборки. */
export interface Capabilities {
  /** Автономный файл без сервера (`--mode offline`): результаты — в файл, без учётных записей. */
  offline: boolean;
}

export interface GamePlatform {
  saves: SaveStore;
  results: ResultStore;
  profile: ProfileStore;
  capabilities: Capabilities;
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
