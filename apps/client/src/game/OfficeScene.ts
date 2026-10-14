import Phaser from "phaser";
import type { Door, Location } from "../../../../shared/case";
import type { PublicCase as CaseFile } from "../../../../shared/public-case";
import { meets } from "../../../../shared/conditions";
import { getLocation } from "../content/case-utils";
import {
  BASE_TILE,
  CHAR_H,
  SCALE,
  SPRITES,
  TILE,
  WALL_TILES,
  doorMirrored,
  drawTile,
} from "./art";
import { gameBridge } from "./bridge";
import type { SceneHost } from "./host";
import { collides, findPath, nearestFree, slideShift, type IsFree, type Tile } from "./scene/navigation";
import { ensureCharacterTextures, ensureDoorTextures, ensureExitTextures, ensureObjectTextures } from "./scene/textures";
import type { Interactable, Npc } from "./scene/types";

const SPEED = 150; // px/с в мировых координатах
const INTERACT_RANGE = TILE * 1.75;
const INTERACT_KEYS = new Set(["KeyE", "Enter", "NumpadEnter", "Space"]);
const UI_TARGETS = "button, input, textarea, select, a, [contenteditable]";

const FOLLOW_GAP = TILE * 1.1;
/** Минимальный размер клетки на экране (px), ниже которого включается следящая камера. */
const MIN_TILE_PX = 40;

const labelStyle: Phaser.Types.GameObjects.Text.TextStyle = {
  fontFamily: "Rubik, system-ui, sans-serif",
  fontSize: "13px",
  color: "#fdf8ec",
  backgroundColor: "rgba(43,35,28,0.82)",
  padding: { x: 6, y: 3 },
};

export class OfficeScene extends Phaser.Scene {
  private host!: SceneHost;
  private caseFile!: CaseFile;
  private location!: Location;
  private solid: boolean[][] = [];
  /** Клетки, занятые стоящими NPC (они меняются по ходу игры). */
  private npcTiles = new Set<string>();
  /** Путь игрока — по нему идут сопровождающие. */
  private trail: { x: number; y: number }[] = [];
  private leaving = false;
  private doors: { def: Door; sprite: Phaser.GameObjects.Image; tiles: { x: number; y: number }[]; locked: boolean; item: Interactable | null }[] = [];
  /** Клетки запертых дверей — непроходимы. */
  private doorTiles = new Set<string>();
  private player!: Phaser.GameObjects.Sprite;
  private keys!: Record<"up" | "down" | "left" | "right" | "w" | "a" | "s" | "d", Phaser.Input.Keyboard.Key>;
  private interactables: Interactable[] = [];
  private npcs = new Map<string, Npc>();
  private path: { x: number; y: number }[] = [];
  private pendingInteraction: string | null = null;
  private hadOverlay = false;
  /** Отписки от window и стора — снимаем при перезапуске и при уничтожении сцены. */
  private cleanups: (() => void)[] = [];
  private overlayClosedAt = -Infinity;
  private prompt!: Phaser.GameObjects.Text;
  private focused: Interactable | null = null;
  private focusLabel: string | null = null;
  /** Второй участник очной ставки, когда фокус на первом. */
  private confPartners: Npc[] = [];
  private animClock = 0;
  private lastSavedTile = "";
  private saveClock = 0;
  private unsubscribe?: () => void;

  constructor() {
    super("office");
  }

  create() {
    if (import.meta.env.MODE === "development") Object.assign(window, { __scene: this });
    // при scene.restart() экземпляр тот же — состояние сбрасываем вручную
    this.interactables = [];
    this.doors = [];
    this.doorTiles = new Set();
    this.npcs = new Map();
    this.npcTiles = new Set();
    this.trail = [];
    this.path = [];
    this.focused = null;
    this.pendingInteraction = null;
    this.leaving = false;

    this.host = this.registry.get("host") as SceneHost;
    this.caseFile = this.registry.get("caseFile") as CaseFile;
    this.location = getLocation(this.caseFile, this.host.getState().locationId);
    this.buildTextures();
    this.buildMap();
    this.buildObjects();
    this.buildExits();
    this.buildDoors();
    this.buildPlayer();
    this.syncNpcs();
    this.fitCamera();
    this.scale.on(Phaser.Scale.Events.RESIZE, this.fitCamera, this);
    this.cameras.main.fadeIn(200, 43, 35, 28);

    const kb = this.input.keyboard!;
    // enableCapture=false: иначе Phaser съест буквы в полях ввода React-интерфейса
    this.keys = {
      up: kb.addKey("UP", false),
      down: kb.addKey("DOWN", false),
      left: kb.addKey("LEFT", false),
      right: kb.addKey("RIGHT", false),
      w: kb.addKey("W", false),
      a: kb.addKey("A", false),
      s: kb.addKey("S", false),
      d: kb.addKey("D", false),
    };
    // Клавишу взаимодействия ловим сразу, в фазе перехвата на window, а не из очереди Phaser:
    // очередь обрабатывается в следующем кадре, когда окно, закрытое этим же Enter/Пробелом,
    // уже исчезло, — и сцена тут же открывала его снова (игра «зависала» в окне).
    const onKey = (event: KeyboardEvent) => this.onInteractKey(event);
    window.addEventListener("keydown", onKey, true);
    this.cleanups.push(() => window.removeEventListener("keydown", onKey, true));

    this.prompt = this.add
      .text(0, 0, "E", {
        fontFamily: "Rubik, system-ui, sans-serif",
        fontSize: "14px",
        fontStyle: "bold",
        color: "#2b231c",
        backgroundColor: "#f6d55c",
        padding: { x: 6, y: 2 },
      })
      .setOrigin(0.5, 1)
      .setDepth(10_000)
      .setVisible(false);

    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => {
      if (over.length || this.host.isBlocked() || this.time.now - this.overlayClosedAt < 250) return;
      this.pendingInteraction = null;
      this.walkTo(nearestFree(this.isFreeFn, { x: Math.floor(pointer.worldX / TILE), y: Math.floor(pointer.worldY / TILE) }));
    });

    const detachBridge = gameBridge.attach({
      interactNearest: () => {
        if (this.focused) this.host.onInteract(this.focused.id);
      },
      whereIs: (characterId) => {
        const npc = this.npcs.get(characterId);
        if (!npc) return undefined;
        const x = Math.floor(npc.sprite.x / TILE);
        const y = Math.floor((npc.sprite.y - 2) / TILE);
        return { locationId: this.location.id, x, y };
      },
    });

    this.unsubscribe = this.host.subscribe(() => this.onStoreChange());
    this.refreshChecks();
    this.cleanups.push(() => {
      this.unsubscribe?.();
      this.unsubscribe = undefined;
      this.scale?.off(Phaser.Scale.Events.RESIZE, this.fitCamera, this);
      detachBridge();
    });
    // перезапуск сцены (SHUTDOWN) и уничтожение всей игры при выходе из дела (DESTROY)
    const cleanup = () => this.cleanups.splice(0).forEach((f) => f());
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, cleanup);
    this.events.once(Phaser.Scenes.Events.DESTROY, cleanup);
  }

  // ---------- построение ----------

  private buildTextures() {
    ensureObjectTextures(this.textures);
    ensureCharacterTextures(this.textures, this.caseFile.characters);
  }

  private buildMap() {
    const { tiles, areas } = this.location;
    const h = tiles.length;
    const w = tiles[0].length;
    if (this.textures.exists("map")) this.textures.remove("map");
    const canvas = this.textures.createCanvas("map", w * BASE_TILE, h * BASE_TILE)!;
    const ctx = canvas.getContext();
    tiles.forEach((row, y) =>
      [...row].forEach((ch, x) =>
        drawTile(ctx, ch, x * BASE_TILE, y * BASE_TILE, {
          below: tiles[y + 1]?.[x],
          above: tiles[y - 1]?.[x],
          left: row[x - 1],
          right: row[x + 1],
        }),
      ),
    );
    canvas.refresh();
    this.add.image(0, 0, "map").setOrigin(0).setScale(SCALE).setDepth(-1);
    this.solid = tiles.map((row) => [...row].map((ch) => WALL_TILES.has(ch)));

    for (const a of areas) {
      this.add
        .text((a.x + 0.5) * TILE, (a.y + 0.5) * TILE, a.name.toUpperCase(), {
          fontFamily: "Rubik, system-ui, sans-serif",
          fontSize: "12px",
          fontStyle: "bold",
          color: "#2b231c",
        })
        .setOrigin(0.5)
        .setAlpha(0.35)
        .setDepth(0);
    }
  }

  private makeLabel(text: string) {
    return this.add.text(0, 0, text, labelStyle).setOrigin(0.5, 1).setDepth(9_000).setVisible(false);
  }

  private buildObjects() {
    for (const o of this.location.objects) {
      const spec = SPRITES[o.sprite];
      const cx = (o.x + spec.footprint / 2) * TILE;
      const bottom = (o.y + 1) * TILE - (spec.mount ?? 0) * SCALE;
      const img = this.add
        .image(cx, bottom, `obj_${o.sprite}`)
        .setOrigin(0.5, 1)
        .setScale(SCALE)
        .setDepth(spec.flat ? 0 : bottom);
      const footprint = Array.from({ length: spec.footprint }, (_, i) => ({ x: o.x + i, y: o.y }));
      if (spec.solid) footprint.forEach((t) => this.setSolid(t.x, t.y));
      if (!o.interaction) continue;

      const top = bottom - spec.h * SCALE;
      const item: Interactable = {
        id: o.id,
        label: o.label,
        x: cx,
        y: bottom - TILE / 2,
        footprint,
        sprite: img,
        labelText: this.makeLabel(o.label).setPosition(cx, top - 4),
        check: this.add
          .text(cx + (spec.w * SCALE) / 2 - 2, top + 2, "✓", {
            fontFamily: "Rubik, system-ui, sans-serif",
            fontSize: "14px",
            fontStyle: "bold",
            color: "#ffffff",
            backgroundColor: "#2e9e5b",
            padding: { x: 3, y: 0 },
          })
          .setOrigin(1, 0)
          .setDepth(9_500)
          .setVisible(false),
      };
      this.makeClickable(item);
      this.interactables.push(item);
    }
  }

  /** Где должен быть каждый персонаж сейчас: на месте, рядом с игроком или в другой локации. */
  private syncNpcs() {
    const { progress } = this.host.getState();
    const wanted = new Map<string, { mode: Npc["mode"]; tile: { x: number; y: number } }>();
    for (const loc of this.caseFile.locations) {
      for (const n of loc.npcs) {
        if (progress.followers.includes(n.characterId)) {
          wanted.set(n.characterId, { mode: "follower", tile: this.tileOf(this.player) });
          continue;
        }
        const place = progress.npcPlaces[n.characterId] ?? { locationId: loc.id, x: n.x, y: n.y };
        if (place.locationId === this.location.id) wanted.set(n.characterId, { mode: "static", tile: place });
      }
    }

    for (const [characterId, npc] of this.npcs) {
      const want = wanted.get(characterId);
      if (!want) {
        this.removeNpc(npc);
        continue;
      }
      if (want.mode !== npc.mode || (want.mode === "static" && (want.tile.x !== npc.tile.x || want.tile.y !== npc.tile.y))) {
        this.npcTiles.delete(`${npc.tile.x},${npc.tile.y}`);
        npc.mode = want.mode;
        if (want.mode === "static") {
          // остаётся там, где стоит сейчас, если это и есть его новое место
          npc.tile = { x: want.tile.x, y: want.tile.y };
          npc.sprite.setPosition((npc.tile.x + 0.5) * TILE, (npc.tile.y + 1) * TILE - 2);
          this.npcTiles.add(`${npc.tile.x},${npc.tile.y}`);
        }
      }
    }
    for (const [characterId, want] of wanted) {
      if (this.npcs.has(characterId)) continue;
      const npcDef = this.location.npcs.find((n) => n.characterId === characterId) ??
        this.caseFile.locations.flatMap((l) => l.npcs).find((n) => n.characterId === characterId)!;
      const tile = want.mode === "follower" ? this.freeTileNear(this.tileOf(this.player)) : want.tile;
      this.addNpc(npcDef.id, characterId, tile, want.mode);
    }
  }

  private addNpc(id: string, characterId: string, tile: { x: number; y: number }, mode: Npc["mode"]) {
    const character = this.caseFile.characters.find((c) => c.id === characterId)!;
    const cx = (tile.x + 0.5) * TILE;
    const bottom = (tile.y + 1) * TILE - 2;
    const sprite = this.add
      .sprite(cx, bottom, `chr_${character.id}`, "idle")
      .setOrigin(0.5, 1)
      .setScale(SCALE)
      .setDepth(bottom);
    if (mode === "static") this.npcTiles.add(`${tile.x},${tile.y}`);
    const npc: Npc = {
      id,
      characterId,
      mode,
      tile,
      label: character.name,
      x: cx,
      y: bottom - TILE / 2,
      footprint: [tile],
      sprite,
      labelText: this.makeLabel(character.name).setPosition(cx, bottom - CHAR_H * SCALE - 4),
    };
    this.makeClickable(npc);
    this.interactables.push(npc);
    this.npcs.set(characterId, npc);
  }

  private removeNpc(npc: Npc) {
    this.npcTiles.delete(`${npc.tile.x},${npc.tile.y}`);
    npc.sprite.destroy();
    npc.labelText.destroy();
    this.interactables = this.interactables.filter((i) => i !== npc);
    this.npcs.delete(npc.characterId);
    if (this.focused === npc) this.focused = null;
  }

  private tileOf(sprite: { x: number; y: number }) {
    return { x: Math.floor(sprite.x / TILE), y: Math.floor((sprite.y - 2) / TILE) };
  }

  private freeTileNear(t: { x: number; y: number }) {
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, 1], [0, -1], [-1, 1], [1, 1]]) {
      if (this.isFree(t.x + dx, t.y + dy)) return { x: t.x + dx, y: t.y + dy };
    }
    return t;
  }

  // ---------- выходы ----------

  /** Выходы — объекты взаимодействия: переход только по E / клику, а не от случайного шага. */
  private buildExits() {
    // стрелка «туда» — в сторону края карты, у которого стоит выход
    const w = this.location.tiles[0].length;
    const h = this.location.tiles.length;
    const dirOf = (e: { x: number; y: number }) => (e.x === 0 ? "left" : e.x === w - 1 ? "right" : e.y === h - 1 ? "down" : "up");
    ensureExitTextures(this.textures);
    for (const exit of this.location.exits) {
      const target = this.caseFile.locations.find((l) => l.id === exit.to);
      const label = exit.label || `Выход → ${target?.name ?? exit.to}`;
      const cx = (exit.x + 0.5) * TILE;
      const bottom = (exit.y + 1) * TILE;
      const marker = this.add.image(cx, bottom - 4, `exit_${dirOf(exit)}`).setOrigin(0.5, 1).setScale(SCALE * 0.8).setDepth(bottom).setAlpha(0.9);
      const item: Interactable = {
        id: `exit:${exit.id}`,
        label,
        x: cx,
        y: bottom - TILE / 2,
        footprint: [{ x: exit.x, y: exit.y }],
        sprite: marker,
        labelText: this.makeLabel(label).setPosition(cx, bottom - TILE - 4),
      };
      this.makeClickable(item);
      this.interactables.push(item);
    }
    for (const exit of this.location.exits) {
      if (!exit.label) continue;
      const cx = (exit.x + 0.5) * TILE;
      const cy = (exit.y + 0.5) * TILE;
      this.add
        .text(cx, cy, `${exit.label}`, {
          fontFamily: "Rubik, system-ui, sans-serif",
          fontSize: "12px",
          fontStyle: "bold",
          color: "#fdf8ec",
          backgroundColor: "rgba(43,76,126,0.9)",
          padding: { x: 5, y: 2 },
        })
        .setOrigin(exit.x === 0 ? 0 : exit.x >= this.location.tiles[0].length - 1 ? 1 : 0.5, exit.y === 0 ? 0 : 1)
        .setDepth(8_000);
    }
  }

  /**
   * Большой экран — видна вся карта. Маленький (телефон) — камера приближается
   * так, чтобы клетка была не мельче MIN_TILE_PX, и следует за игроком.
   */
  private fitCamera() {
    const cam = this.cameras.main;
    const { width, height } = this.scale.gameSize;
    const worldW = this.location.tiles[0].length * TILE;
    const worldH = this.location.tiles.length * TILE;
    const fit = Math.min(width / worldW, height / worldH);
    const minZoom = MIN_TILE_PX / TILE;
    if (fit >= minZoom) {
      cam.stopFollow();
      cam.removeBounds();
      cam.setZoom(fit);
      cam.centerOn(worldW / 2, worldH / 2);
    } else {
      cam.setZoom(minZoom);
      // по оси, где карта меньше экрана, держим её по центру
      const bw = Math.max(worldW, width / minZoom);
      const bh = Math.max(worldH, height / minZoom);
      cam.setBounds((worldW - bw) / 2, (worldH - bh) / 2, bw, bh);
      cam.startFollow(this.player, true, 0.2, 0.2);
    }
  }

  private onStoreChange() {
    const s = this.host.getState();
    // окно только что закрылось — короткая пауза, чтобы тот же клик/клавиша не открыли его снова
    if (this.hadOverlay && s.overlay === null) this.overlayClosedAt = this.time.now;
    this.hadOverlay = s.overlay !== null;
    if (this.leaving) return;
    if (s.locationId !== this.location.id) {
      this.leaving = true;
      // принудительное затемнение (fadeOut не стартует, пока идёт проявление после входа)
      // и перезапуск по таймеру — не зависим от события окончания эффекта
      this.cameras.main.fade(180, 43, 35, 28, true);
      this.time.delayedCall(200, () => this.scene.restart());
      return;
    }
    this.refreshChecks();
    this.syncDoors();
    this.syncNpcs();
  }

  // ---------- двери ----------

  private buildDoors() {
    ensureDoorTextures(this.textures);
    for (const def of this.location.doors) {
      const h = def.orientation === "h";
      const tiles = h ? [{ x: def.x, y: def.y }, { x: def.x + 1, y: def.y }] : [{ x: def.x, y: def.y }, { x: def.x, y: def.y + 1 }];
      const cx = h ? (def.x + 1) * TILE : (def.x + 0.5) * TILE;
      const bottom = h ? (def.y + 1) * TILE : (def.y + 2) * TILE;
      const sprite = this.add.image(cx, bottom, `door_${def.orientation}_closed`).setOrigin(0.5, 1).setScale(SCALE).setDepth(bottom);
      if (!h && doorMirrored(def.x, this.location.tiles[0].length)) sprite.setFlipX(true);
      this.doors.push({ def, sprite, tiles, locked: false, item: null });
    }
    this.syncDoors();
  }

  /** Заперта ли дверь сейчас — зависит от прогресса (ключ, разрешение, факт). */
  private syncDoors() {
    const { progress } = this.host.getState();
    this.doorTiles.clear();
    for (const d of this.doors) {
      d.locked = !meets(d.def.requires, progress);
      if (d.locked) d.tiles.forEach((t) => this.doorTiles.add(`${t.x},${t.y}`));
      if (d.locked && !d.item) {
        const label = "Дверь · заперто";
        d.item = {
          id: `door:${d.def.id}`,
          label,
          x: d.sprite.x,
          y: d.sprite.y - TILE / 2,
          footprint: d.tiles,
          sprite: d.sprite,
          labelText: this.makeLabel(label).setPosition(d.sprite.x, d.sprite.y - d.sprite.displayHeight - 4),
        };
        this.makeClickable(d.item);
        this.interactables.push(d.item);
      } else if (!d.locked && d.item) {
        d.item.labelText.destroy();
        d.sprite.removeAllListeners().disableInteractive();
        this.interactables = this.interactables.filter((i) => i !== d.item);
        if (this.focused === d.item) this.focused = null;
        d.item = null;
      }
      d.sprite.setTexture(`door_${d.def.orientation}_${d.locked ? "locked" : "closed"}`);
    }
  }

  /** Незапертые двери распахиваются, когда рядом игрок или сопровождающий. */
  private animateDoors() {
    const walkers = [this.player, ...[...this.npcs.values()].filter((n) => n.mode === "follower").map((n) => n.sprite)];
    for (const d of this.doors) {
      if (d.locked) continue;
      const near = walkers.some((w) => Phaser.Math.Distance.Between(w.x, w.y - TILE / 4, d.sprite.x, d.sprite.y - TILE / 2) < TILE * 1.7);
      const key = `door_${d.def.orientation}_${near ? "open" : "closed"}`;
      if (d.sprite.texture.key !== key) d.sprite.setTexture(key);
    }
  }

  private buildPlayer() {
    // точка входа из двери → сохранённая позиция → старт локации
    const { spawn } = this.host.getState();
    const saved = this.host.savedPlayer(this.caseFile.id);
    const start =
      spawn ??
      (saved && saved.locationId === this.location.id && this.isFree(saved.x, saved.y) ? saved : this.location.playerStart);
    if (spawn) this.host.consumeSpawn();
    this.lastSavedTile = `${start.x},${start.y}`;
    this.player = this.add
      .sprite((start.x + 0.5) * TILE, (start.y + 1) * TILE - 2, "char_player", "idle")
      .setOrigin(0.5, 1)
      .setScale(SCALE);
  }

  private makeClickable(item: Interactable) {
    item.sprite.setInteractive({ useHandCursor: true, pixelPerfect: false });
    item.sprite.on("pointerover", () => item.labelText.setVisible(true));
    item.sprite.on("pointerout", () => item !== this.focused && item.labelText.setVisible(false));
    item.sprite.on("pointerdown", () => {
      if (this.host.isBlocked() || this.time.now - this.overlayClosedAt < 250) return;
      if (this.distanceTo(item) <= INTERACT_RANGE) {
        this.path = [];
        this.host.onInteract(item.id);
        return;
      }
      // Подойти к объекту и взаимодействовать по прибытии
      const goals = item.footprint.flatMap((t) => [
        { x: t.x, y: t.y + 1 },
        { x: t.x - 1, y: t.y },
        { x: t.x + 1, y: t.y },
        { x: t.x, y: t.y - 1 },
      ]);
      if (this.walkTo(goals)) this.pendingInteraction = item.id;
    });
  }

  private setSolid(x: number, y: number) {
    if (this.solid[y]?.[x] !== undefined) this.solid[y][x] = true;
  }

  private refreshChecks() {
    const { examined } = this.host.getState();
    for (const item of this.interactables) item.check?.setVisible(examined.includes(item.id));
  }

  // ---------- движение ----------

  private isFree(x: number, y: number) {
    const key = `${x},${y}`;
    return this.solid[y]?.[x] === false && !this.npcTiles.has(key) && !this.doorTiles.has(key);
  }

  private isFreeFn: IsFree = (x, y) => this.isFree(x, y);

  private walkTo(goals: Tile[]): boolean {
    const start = { x: Math.floor(this.player.x / TILE), y: Math.floor((this.player.y - 2) / TILE) };
    const path = findPath(this.isFreeFn, start, goals);
    if (!path) return false;
    this.path = path.slice(1);
    if (!this.path.length) this.path = [path[0]];
    return true;
  }

  private move(dx: number, dy: number) {
    const nx = this.player.x + dx;
    if (!collides(this.isFreeFn, nx, this.player.y)) this.player.x = nx;
    else if (!dy) this.player.y += slideShift(this.isFreeFn, this.player, "y", dx);
    const ny = this.player.y + dy;
    if (!collides(this.isFreeFn, this.player.x, ny)) this.player.y = ny;
    else if (!dx) this.player.x += slideShift(this.isFreeFn, this.player, "x", dy);
  }

  private distanceTo(item: Interactable) {
    return Phaser.Math.Distance.Between(this.player.x, this.player.y - TILE / 4, item.x, item.y);
  }

  update(_: number, deltaMs: number) {
    const state = this.host.getState();
    const blocked = this.host.isBlocked();
    const dt = Math.min(deltaMs, 50) / 1000;
    this.animClock += deltaMs;

    let vx = 0;
    let vy = 0;
    if (!blocked) {
      const k = this.keys;
      vx = (k.right.isDown || k.d.isDown ? 1 : 0) - (k.left.isDown || k.a.isDown ? 1 : 0);
      vy = (k.down.isDown || k.s.isDown ? 1 : 0) - (k.up.isDown || k.w.isDown ? 1 : 0);
      if (!vx && !vy) {
        vx = gameBridge.joystick.x;
        vy = gameBridge.joystick.y;
      }
      if (vx || vy) {
        this.path = [];
        this.pendingInteraction = null;
      }
    } else {
      this.path = [];
      this.pendingInteraction = null;
    }

    let moving = false;
    if (vx || vy) {
      // с джойстика скорость пропорциональна наклону, клавиатура — всегда полная
      const len = Math.max(1, Math.hypot(vx, vy));
      this.move((vx / len) * SPEED * dt, (vy / len) * SPEED * dt);
      moving = true;
    } else if (this.path.length) {
      const target = this.path[0];
      const dx = target.x - this.player.x;
      const dy = target.y - this.player.y;
      const dist = Math.hypot(dx, dy);
      const step = SPEED * dt;
      if (dist <= step) {
        this.player.setPosition(target.x, target.y);
        this.path.shift();
        if (!this.path.length && this.pendingInteraction) {
          const id = this.pendingInteraction;
          this.pendingInteraction = null;
          this.host.onInteract(id);
        }
      } else {
        this.player.x += (dx / dist) * step;
        this.player.y += (dy / dist) * step;
      }
      moving = true;
    }

    this.player.setDepth(this.player.y);
    const walkFrame = Math.floor(this.animClock / 160) % 2 === 0 ? "walk1" : "walk2";
    const idleFrame = Math.floor(this.animClock / 600) % 2 === 0 ? "idle" : "idle2";
    this.player.setFrame(moving ? walkFrame : idleFrame);

    // след игрока для сопровождающих
    const last = this.trail[this.trail.length - 1];
    if (!last || Math.hypot(last.x - this.player.x, last.y - this.player.y) > 4) {
      this.trail.push({ x: this.player.x, y: this.player.y });
      if (this.trail.length > 60) this.trail.shift();
    }

    const talkingTo = state.overlay?.kind === "dialogue" ? state.overlay.npcId : null;
    let followerIndex = 0;
    for (const npc of this.npcs.values()) {
      let walking = false;
      if (npc.mode === "follower") {
        walking = this.stepFollower(npc, ++followerIndex, dt);
        npc.x = npc.sprite.x;
        npc.y = npc.sprite.y - TILE / 2;
        npc.sprite.setDepth(npc.sprite.y);
        npc.labelText.setPosition(npc.sprite.x, npc.sprite.y - CHAR_H * SCALE - 4);
      }
      const talking = npc.id === talkingTo;
      const phase = Math.floor((this.animClock + npc.x * 7) / (talking ? 180 : 700)) % 2 === 0;
      const walkFrame = Math.floor(this.animClock / 160) % 2 === 0 ? "walk1" : "walk2";
      npc.sprite.setFrame(walking ? walkFrame : talking ? (phase ? "talk" : "idle") : phase ? "idle" : "idle2");
    }


    this.animateDoors();
    this.updateFocus(blocked);

    this.saveClock += deltaMs;
    if (this.saveClock > 1000) {
      this.saveClock = 0;
      const tile = { x: Math.floor(this.player.x / TILE), y: Math.floor((this.player.y - 2) / TILE) };
      const key = `${tile.x},${tile.y}`;
      if (key !== this.lastSavedTile) {
        this.lastSavedTile = key;
        this.host.savePlayerPosition(this.caseFile.id, { ...tile, locationId: this.location.id });
      }
    }
  }

  /** Сопровождающий идёт по следу игрока на небольшом расстоянии. Возвращает, двигался ли. */
  private stepFollower(npc: Npc, index: number, dt: number) {
    const gap = FOLLOW_GAP * index;
    let target = this.trail[0] ?? { x: this.player.x, y: this.player.y };
    let acc = 0;
    for (let i = this.trail.length - 1; i > 0; i--) {
      acc += Math.hypot(this.trail[i].x - this.trail[i - 1].x, this.trail[i].y - this.trail[i - 1].y);
      if (acc >= gap) {
        target = this.trail[i - 1];
        break;
      }
    }
    const dx = target.x - npc.sprite.x;
    const dy = target.y - npc.sprite.y;
    const dist = Math.hypot(dx, dy);
    const toPlayer = Math.hypot(this.player.x - npc.sprite.x, this.player.y - npc.sprite.y);
    if (dist < 2 || toPlayer < gap * 0.8) return false;
    const step = Math.min(dist, SPEED * 1.15 * dt);
    npc.sprite.x += (dx / dist) * step;
    npc.sprite.y += (dy / dist) * step;
    return true;
  }

  /**
   * E, Enter и Пробел — взаимодействие. Нажатия, адресованные кнопкам и полям
   * интерфейса, пропускаем: иначе Enter, которым выбрали последний вариант
   * в диалоге, тут же открыл бы разговор заново.
   */
  private onInteractKey(event: KeyboardEvent) {
    if (!INTERACT_KEYS.has(event.code) || event.repeat) return;
    if (event.target instanceof Element && event.target.closest(UI_TARGETS)) return;
    if (this.time.now - this.overlayClosedAt < 250) return;
    if (this.host.isBlocked() || !this.focused) return;
    // нажатие поглощаем: открывшееся окно не должно получить этот же Enter/Пробел
    event.preventDefault();
    event.stopImmediatePropagation();
    this.path = [];
    this.host.onInteract(this.focused.id);
  }

  private updateFocus(blocked: boolean) {
    let best: Interactable | null = null;
    let bestDist = INTERACT_RANGE;
    if (!blocked) {
      for (const item of this.interactables) {
        const d = this.distanceTo(item);
        if (d <= bestDist) {
          best = item;
          bestDist = d;
        }
      }
    }
    // для персонажа, с которым сейчас возможна очная ставка, — особая подпись и подсветка обоих
    const npc = best && [...this.npcs.values()].find((n) => n === best);
    const conf = npc ? this.host.confrontationWith(npc.characterId) : undefined;
    const partners = conf ? conf.characters.filter((id) => id !== npc!.characterId).flatMap((id) => this.npcs.get(id) ?? []) : [];
    const label = conf && npc ? `Очная ставка: ${[npc, ...partners].map((n) => n.label).join(", ")}` : best?.label ?? null;
    if (best !== this.focused || label !== this.focusLabel) {
      this.focused?.labelText.setVisible(false);
      this.focused?.sprite.clearTint();
      this.confPartners.forEach((p) => p.sprite.clearTint());
      if (this.focused && this.focusLabel !== this.focused.label) this.focused.labelText.setText(this.focused.label).setStyle(labelStyle);
      this.focused = best;
      this.focusLabel = label;
      this.confPartners = partners;
      if (best && conf) best.labelText.setText(label!).setStyle({ ...labelStyle, backgroundColor: "rgba(184,50,42,0.92)" });
      gameBridge.focusListeners.forEach((l) => l(label));
    }
    this.confPartners.forEach((p) => p.sprite.setTint(0xffd0c8));
    if (best) {
      best.labelText.setVisible(true);
      best.sprite.setTint(0xfff3c4);
      const bounce = Math.sin(this.animClock / 180) * 2;
      this.prompt.setPosition(best.labelText.x, best.labelText.y - best.labelText.height - 2 + bounce).setVisible(true);
    } else {
      this.prompt.setVisible(false);
    }
  }
}
