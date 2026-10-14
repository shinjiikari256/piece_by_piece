import type { SpriteKey as SpriteKeyT } from "../../../../../shared/case";

export type Tool =
  | { kind: "select" }
  | { kind: "tile"; ch: string }
  | { kind: "object"; sprite: SpriteKeyT }
  | { kind: "npc" }
  | { kind: "start" }
  | { kind: "exit" }
  | { kind: "door"; orientation: "h" | "v" };

export type Selection =
  | { kind: "object"; id: string }
  | { kind: "npc"; id: string }
  | { kind: "exit"; id: string }
  | { kind: "door"; id: string }
  | { kind: "start" }
  | null;

export type DoorT = { id: string; x: number; y: number; orientation: "h" | "v"; requires?: unknown };
export const LIST_KEY = { object: "objects", npc: "npcs", exit: "exits", door: "doors" } as const;
