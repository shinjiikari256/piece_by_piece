import type { actions, GameState } from "../state/store";

/**
 * Всё, что сцена Phaser берёт из приложения. Сцена не импортирует стор и сохранения:
 * хост создаётся в `PhaserGame.tsx` (см. `state/scene-host.ts`) и передаётся через registry.
 */
export interface SceneHost {
  getState(): GameState;
  subscribe(listener: () => void): () => void;
  /** Открыт интерфейс поверх сцены — персонаж стоит. */
  isBlocked(): boolean;
  /** Игрок взаимодействует с объектом, персонажем или выходом. */
  onInteract(targetId: string): void;
  /** Очная ставка, доступная с этим персонажем. */
  confrontationWith(characterId: string): ReturnType<typeof actions.confrontationWith>;
  /** Где персонаж оказался после хода (`null` — на исходном месте). */
  setNpcPlace(characterId: string, place: { locationId: string; x: number; y: number } | null): void;
  /** Точка входа из двери использована. */
  consumeSpawn(): void;
  /** Сохранённая позиция игрока в деле. */
  savedPlayer(caseId: string): { x: number; y: number; locationId: string } | undefined;
  savePlayerPosition(caseId: string, player: { x: number; y: number; locationId: string }): void;
}
