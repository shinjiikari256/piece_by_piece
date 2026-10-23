export type Tool =
  | { kind: "select" }
  | { kind: "tile"; ch: string }
  | { kind: "object"; sprite: string }
  | { kind: "npc" }
  | { kind: "start" }
  /** Рисование области (клетки выбранной области; если не выбрана — создаётся новая); `erase` — стирание. */
  | { kind: "zone"; erase?: boolean };

export type Selection = { kind: "object"; id: string } | { kind: "npc"; id: string } | { kind: "zone"; id: string } | { kind: "start" } | null;

/** Предметы и люди — элементы с координатой `x, y`; область (`zone`) — набор клеток и в этот список не входит. */
export const LIST_KEY = { object: "objects", npc: "npcs" } as const;
export type PointKind = keyof typeof LIST_KEY;
