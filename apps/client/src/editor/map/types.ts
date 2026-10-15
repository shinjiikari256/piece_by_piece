import type { SpriteKey as SpriteKeyT } from "../../../../../shared/case";

export type Tool =
  | { kind: "select" }
  | { kind: "tile"; ch: string }
  | { kind: "object"; sprite: SpriteKeyT }
  | { kind: "npc" }
  | { kind: "start" }
  | { kind: "door"; orientation: "h" | "v" }
  /** Рисование области (клетки выбранной области; если не выбрана — создаётся новая); `erase` — стирание. */
  | { kind: "zone"; erase?: boolean };

export type Selection =
  | { kind: "object"; id: string }
  | { kind: "npc"; id: string }
  | { kind: "door"; id: string }
  | { kind: "zone"; id: string }
  | { kind: "start" }
  | null;

export type DoorT = { id: string; x: number; y: number; orientation: "h" | "v"; requires?: unknown };
/** Предметы, люди и двери — элементы с координатой `x, y`; область (`zone`) — набор клеток и в этот список не входит. */
export const LIST_KEY = { object: "objects", npc: "npcs", door: "doors" } as const;
export type PointKind = keyof typeof LIST_KEY;
