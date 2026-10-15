import type Phaser from "phaser";
import type { Walk } from "./walker";

export interface Interactable {
  id: string;
  label: string;
  /** Точка, до которой меряется расстояние (низ-центр объекта). */
  x: number;
  y: number;
  footprint: { x: number; y: number }[];
  sprite: Phaser.GameObjects.Image | Phaser.GameObjects.Sprite;
  labelText: Phaser.GameObjects.Text;
  check?: Phaser.GameObjects.Text;
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
