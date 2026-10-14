import type Phaser from "phaser";

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
  mode: "static" | "follower";
  /** Клетка, где стоит (для static). */
  tile: { x: number; y: number };
}
