import type Phaser from "phaser";
import type { Walk } from "./walker";

export interface Interactable {
  id: string;
  label: string;
  /** Точка, до которой меряется расстояние (низ-центр объекта). */
  x: number;
  y: number;
  footprint: { x: number; y: number }[];
  /** Клетки, с которых предметом можно пользоваться (висящий на стене — только спереди); без поля — любые рядом проходимые. */
  access?: { x: number; y: number }[];
  sprite: Phaser.GameObjects.Image | Phaser.GameObjects.Sprite;
  labelText: Phaser.GameObjects.Text;
  /** Точка подписи в мире, до сдвига к краю видимой части поля (см. `OfficeScene.placeLabels`). */
  labelAt: { x: number; y: number };
  check?: Phaser.GameObjects.Text;
  /** Область-триггер: пользоваться можно, пока игрок стоит внутри (клетки `"x,y"`), а не по расстоянию. */
  zone?: { id: string; cells: Set<string> };
}

export interface Npc extends Interactable {
  sprite: Phaser.GameObjects.Sprite;
  characterId: string;
  /** `walker` — идёт к клетке (эффект `moveTo`): пока идёт, взаимодействие недоступно. */
  mode: "static" | "follower" | "walker";
  /** Текущий ход (только у `walker`). */
  walk?: Walk;
  /** Клетка, где стоит (для static). */
  tile: { x: number; y: number };
}
