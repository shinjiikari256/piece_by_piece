import type Phaser from "phaser";
import type { Location } from "../../../../../shared/case";
import { SCALE, TILE } from "../art";
import type { SceneHost } from "../host";
import type { Tile } from "./navigation";
import { ensureExitTextures } from "./textures";
import { tileOfSprite } from "./npcs";
import type { Interactable } from "./types";

/** Что областям нужно от сцены: мир, игрок, список взаимодействий. */
export interface ZonesContext {
  scene: Phaser.Scene;
  host: SceneHost;
  location: Location;
  player: Phaser.GameObjects.Sprite;
  interactables: readonly Interactable[];
  makeLabel(text: string): Phaser.GameObjects.Text;
  addInteractable(item: Interactable): void;
}

/** Области-триггеры: взаимодействие (E) работает, пока игрок стоит внутри; вход может запускать диалог сам. */
export class ZoneWatcher {
  /** В каких областях игрок стоит сейчас (чтобы заметить вход). */
  private zonesIn = new Set<string>();

  constructor(private readonly ctx: ZonesContext) {}

  build() {
    const { scene, location } = this.ctx;
    ensureExitTextures(scene.textures);
    this.zonesIn = new Set();
    for (const z of location.zones ?? []) {
      if (!z.cells.length) continue;
      const cells = new Set(z.cells.map((c) => `${c.x},${c.y}`));
      // подпись — над самой верхней клеткой области, по центру её строки
      const top = Math.min(...z.cells.map((c) => c.y));
      const topRow = z.cells.filter((c) => c.y === top);
      const cx = (topRow.reduce((a, c) => a + c.x, 0) / topRow.length + 0.5) * TILE;
      this.ctx.addInteractable({
        id: `zone:${z.id}`,
        label: z.name,
        x: cx,
        y: (top + 0.5) * TILE,
        footprint: z.cells,
        sprite: scene.add
          .image(cx, (top + 1) * TILE, "exit_zone")
          .setOrigin(0.5, 1)
          .setScale(SCALE)
          .setDepth(0),
        labelText: this.ctx.makeLabel(z.name),
        labelAt: { x: cx, y: top * TILE - 4 },
        zone: { id: z.id, cells },
      });
    }
  }

  /** Область-выход под клеткой, у которой сейчас есть подходящее действие (клик по ней — идти и пройти). */
  exitAt(tile: Tile) {
    return this.ctx.location.zones?.find((z) => z.actions.some((a) => a.kind === "exit") && z.cells.some((c) => c.x === tile.x && c.y === tile.y) && this.ctx.host.hasZoneAction(z.id));
  }

  /** Вошёл в область — сообщаем хосту (автозапуск диалога). */
  watch() {
    const t = tileOfSprite(this.ctx.player);
    const key = `${t.x},${t.y}`;
    const now = new Set<string>();
    for (const item of this.ctx.interactables) if (item.zone?.cells.has(key)) now.add(item.zone.id);
    const entered = [...now].filter((id) => !this.zonesIn.has(id));
    const left = [...this.zonesIn].filter((id) => !now.has(id));
    this.zonesIn = now;
    for (const id of left) this.ctx.host.leaveZone(id);
    for (const id of entered) this.ctx.host.enterZone(id);
  }
}
