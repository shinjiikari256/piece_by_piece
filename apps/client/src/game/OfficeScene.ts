import Phaser from "phaser";
import { isInteractive, type Location, type LocationObject } from "../../../../shared/case";
import type { PublicCase as CaseFile } from "../../../../shared/public-case";
import { meets } from "../../../../shared/conditions";
import { objectView } from "../../../../shared/object-state";
import { firstFloorCell, getLocation } from "../content/case-utils";
import {
  BASE_TILE,
  CHAR_H,
  SCALE,
  SPRITES,
  footprintCells,
  solidCells,
  TILE,
  WALL_TILES,
    drawTile,
} from "./art";
import { gameBridge } from "./bridge";
import type { SceneHost } from "./host";
import { collides, findPath, nearestFree, reachWithin, slideShift, type IsFree, type Tile } from "./scene/navigation";
import { redirect, startWalk, stepWalk, tileOfPoint, turnBack } from "./scene/walker";
import { ensureCharacterTextures, ensureExitTextures, ensureObjectFrameTexture, ensureObjectTextures } from "./scene/textures";
import type { Interactable, Npc } from "./scene/types";

const SPEED = 150; // px/с в мировых координатах
const INTERACT_RANGE = TILE * 1.75;
/** Условное «расстояние» до области, в которой стоит игрок: ближе — персонаж или предмет рядом, дальше — область. */
const ZONE_RANGE = TILE * 1.5;
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
  /** Предметы с состояниями: вид и проходимость зависят от прогресса. */
  private stateful: { o: LocationObject; img: Phaser.GameObjects.Image; footprint: { x: number; y: number }[]; item: Interactable | null }[] = [];
  private objectTiles = new Set<string>();
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
    this.stateful = [];
    this.objectTiles = new Set();
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
    this.buildZones();
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
      const tile = { x: Math.floor(pointer.worldX / TILE), y: Math.floor(pointer.worldY / TILE) };
      const exit = this.exitZoneAt(tile);
      if (exit) return this.goThroughExit(exit);
      this.walkTo(nearestFree(this.isFreeFn, tile));
    });

    // наведение на выход: подпись области и курсор-«рука» (клик ведёт к нему и проходит)
    this.input.on("pointermove", (pointer: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => {
      const tile = { x: Math.floor(pointer.worldX / TILE), y: Math.floor(pointer.worldY / TILE) };
      const zone = over.length || this.host.isBlocked() ? undefined : this.exitZoneAt(tile);
      const item = zone ? this.interactables.find((i) => i.zone?.id === zone.id) : undefined;
      if (item === this.hoveredExit) return;
      if (this.hoveredExit && this.hoveredExit !== this.focused) this.hoveredExit.labelText.setVisible(false);
      this.hoveredExit = item;
      item?.labelText.setVisible(true);
      this.input.setDefaultCursor(item ? "pointer" : "");
    });
    this.input.on("pointerout", () => {
      if (this.hoveredExit && this.hoveredExit !== this.focused) this.hoveredExit.labelText.setVisible(false);
      this.hoveredExit = undefined;
      this.input.setDefaultCursor("");
    });

    const detachBridge = gameBridge.attach({
      interactNearest: () => {
        // нечего трогать, а за игроком идут спутники — то же действие отпускает их
        if (this.focused) this.host.onInteract(this.focused.id);
        else if (!this.host.isBlocked()) this.host.releaseFollowers();
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
      const cx = (o.x + spec.footprint.w / 2) * TILE;
      const bottom = (o.y + 1) * TILE - (spec.mount ?? 0) * SCALE;
      const img = this.add
        .image(cx, bottom, `obj_${o.sprite}`)
        .setOrigin(0.5, 1)
        .setScale(SCALE)
        .setDepth(spec.flat ? 0 : bottom);
      const footprint = footprintCells(o.x, o.y, spec.footprint);
      const entry = { o, img, footprint, item: null as Interactable | null };
      if (spec.mirrorRight && o.x >= this.location.tiles[0].length / 2) img.setFlipX(true);
      if (o.states?.length || spec.opensNear) this.stateful.push(entry);
      else {
        solidCells(o.x, o.y, spec).forEach((t) => this.setSolid(t.x, t.y));
        if (isInteractive(o)) this.addObjectItem(entry, o.label);
      }
    }
    this.syncObjects();
  }

  /** Сделать предмет доступным для осмотра: подпись, галочка «осмотрено», клик. */
  private addObjectItem(e: { o: LocationObject; img: Phaser.GameObjects.Image; footprint: { x: number; y: number }[]; item: Interactable | null }, label: string) {
    const spec = SPRITES[e.o.sprite];
    const cx = e.img.x;
    const bottom = e.img.y;
    const top = bottom - spec.h * SCALE;
    const item: Interactable = {
      id: e.o.id,
      label,
      x: cx,
      y: bottom - TILE / 2,
      footprint: e.footprint,
      // висящий на стене предмет читается только спереди (клетка под ним), а не с обратной стороны стены
      access: spec.mount !== undefined ? e.footprint.filter((t) => t.y === e.o.y).map((t) => ({ x: t.x, y: t.y + 1 })) : undefined,
      sprite: e.img,
      labelText: this.makeLabel(label).setPosition(cx, top - 4),
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
    e.item = item;
    this.makeClickable(item);
    this.interactables.push(item);
  }

  private removeObjectItem(e: { img: Phaser.GameObjects.Image; item: Interactable | null }) {
    const item = e.item;
    if (!item) return;
    item.labelText.destroy();
    item.check?.destroy();
    e.img.removeAllListeners().disableInteractive();
    this.interactables = this.interactables.filter((i) => i !== item);
    if (this.focused === item) this.focused = null;
    e.item = null;
  }

  /** Вид, проходимость и доступность осмотра предметов с состояниями по текущему прогрессу. */
  private syncObjects() {
    if (!this.stateful.length) return;
    const { progress, locationId } = this.host.getState();
    this.objectTiles.clear();
    for (const e of this.stateful) {
      const view = objectView(e.o, progress, locationId);
      const spec = SPRITES[e.o.sprite];
      const tex = ensureObjectFrameTexture(this.textures, e.o.sprite, view.state?.frame);
      if (e.img.texture.key !== tex) e.img.setTexture(tex);
      solidCells(e.o.x, e.o.y, spec, view.state?.solid ?? spec.solid).forEach((t) => this.objectTiles.add(`${t.x},${t.y}`));
      if (view.interactive && !e.item) this.addObjectItem(e, view.label);
      else if (!view.interactive) this.removeObjectItem(e);
      else if (e.item && e.item.label !== view.label) {
        e.item.label = view.label;
        e.item.labelText.setText(view.label);
      }
    }
    this.refreshChecks();
  }

  /** Где должен быть каждый персонаж сейчас: на месте, рядом с игроком или в другой локации. Смена места — ход пешком (`moveTo`). */
  private syncNpcs() {
    const { progress } = this.host.getState();
    const wanted = new Map<string, { mode: "static" | "follower"; tile: { x: number; y: number }; failText?: string }>();
    const hidden = new Set<string>();
    for (const loc of this.caseFile.locations) {
      for (const n of loc.npcs) {
        if (progress.followers.includes(n.characterId)) {
          wanted.set(n.characterId, { mode: "follower", tile: this.tileOf(this.player) });
          continue;
        }
        // условие присутствия не выполнено — человека на карте нет (исчезает сразу, без хода к выходу)
        if (!meets(n.requires, progress, this.location.id)) {
          hidden.add(n.characterId);
          continue;
        }
        const place = progress.npcPlaces[n.characterId] ?? { locationId: loc.id, x: n.x, y: n.y };
        if (place.locationId === this.location.id) wanted.set(n.characterId, { mode: "static", tile: place, failText: place.failText });
      }
    }

    for (const [characterId, npc] of this.npcs) {
      const want = wanted.get(characterId);
      if (hidden.has(characterId)) {
        this.removeNpc(npc);
        continue;
      }
      if (!want) {
        // место теперь в другой локации: идёт к выходу и уходит
        if (!(npc.mode === "walker" && npc.walk?.leaving)) this.leaveLocation(npc, progress.npcPlaces[characterId]);
        continue;
      }
      if (want.mode === "follower") {
        if (npc.mode !== "follower") {
          this.npcTiles.delete(`${npc.tile.x},${npc.tile.y}`);
          npc.walk = undefined;
          npc.mode = "follower";
        }
        continue;
      }
      const here = this.tileOf(npc.sprite);
      if (npc.mode === "walker") {
        if (!npc.walk?.leaving && npc.walk?.goal.x === want.tile.x && npc.walk.goal.y === want.tile.y) continue; // идёт туда же
        this.beginMove(npc, want.tile, want.failText);
      } else if (npc.mode === "follower") {
        // перестал идти следом: остался там, где стоит, или пошёл на своё место
        if (here.x === want.tile.x && here.y === want.tile.y) {
          npc.mode = "static";
          this.placeNpc(npc, here);
        } else this.beginMove(npc, want.tile, want.failText);
      } else if (npc.tile.x !== want.tile.x || npc.tile.y !== want.tile.y) {
        this.beginMove(npc, want.tile, want.failText);
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

  // ---------- ход персонажа (moveTo) ----------

  /** Свободна ли клетка для идущего персонажа: как для игрока, но и сам игрок на клетке — помеха. */
  private walkFree: IsFree = (x, y) => {
    const p = this.tileOf(this.player);
    return this.isFree(x, y) && !(p.x === x && p.y === y);
  };

  /** Начать ход к клетке (или перестроить текущий). Пути нет сейчас — персонаж остаётся и «ругается». */
  private beginMove(npc: Npc, goal: { x: number; y: number }, failText?: string) {
    const from = this.tileOf(npc.sprite);
    this.npcTiles.delete(`${npc.tile.x},${npc.tile.y}`);
    this.npcTiles.add(`${from.x},${from.y}`); // стоит на своей клетке, пока идёт
    npc.tile = from;
    const ok = npc.walk ? redirect(npc.walk, this.walkFree, from, goal, { failText }) : (npc.walk = startWalk(this.walkFree, from, goal, { failText }) ?? undefined) !== undefined;
    if (!ok) {
      this.say(npc, failText);
      this.settle(npc, from);
      return;
    }
    npc.mode = "walker";
  }

  /** Место персонажа теперь в другой локации: идёт к ближайшему выходу в ту сторону и исчезает с карты. */
  private leaveLocation(npc: Npc, place: { locationId: string; failText?: string } | undefined) {
    const exit = place ? this.exitToward(place.locationId) : null;
    if (!exit) return this.removeNpc(npc);
    const from = this.tileOf(npc.sprite);
    this.npcTiles.delete(`${npc.tile.x},${npc.tile.y}`);
    this.npcTiles.add(`${from.x},${from.y}`);
    npc.tile = from;
    const walk = startWalk(this.walkFree, from, exit.cells, { leaving: true, failText: place?.failText });
    if (!walk) {
      this.say(npc, place?.failText);
      this.settle(npc, from);
      return;
    }
    npc.walk = walk;
    npc.mode = "walker";
  }

  /** Первая область-выход этой локации на кратчайшем пути в локацию `target` (по действиям `exit`); null — пути нет. */
  private exitToward(target: string) {
    const exitsOf = (loc: Location) => loc.zones.flatMap((zone) => zone.actions.flatMap((a) => (a.kind === "exit" ? [{ zone, to: a.to }] : [])));
    const seen = new Set([this.location.id]);
    const queue = exitsOf(this.location).map((first) => ({ at: first.to, first: first.zone }));
    while (queue.length) {
      const { at, first } = queue.shift()!;
      if (seen.has(at)) continue;
      seen.add(at);
      if (at === target) return first;
      const loc = this.caseFile.locations.find((l) => l.id === at);
      if (loc) for (const e of exitsOf(loc)) queue.push({ at: e.to, first });
    }
    return null;
  }

  /** Персонаж остановился на клетке: стоит там, а стор узнаёт его настоящее место (дошёл, вернулся или остался). */
  private settle(npc: Npc, tile: { x: number; y: number }) {
    npc.mode = "static";
    npc.walk = undefined;
    this.placeNpc(npc, tile);
    const def = this.caseFile.locations.flatMap((l) => l.npcs.map((n) => ({ locationId: l.id, ...n }))).find((n) => n.characterId === npc.characterId);
    const home = def && def.locationId === this.location.id && def.x === tile.x && def.y === tile.y;
    const saved = this.host.getState().progress.npcPlaces[npc.characterId];
    const same = home ? !saved : !!saved && saved.locationId === this.location.id && saved.x === tile.x && saved.y === tile.y;
    if (!same) this.host.setNpcPlace(npc.characterId, home ? null : { locationId: this.location.id, x: tile.x, y: tile.y });
  }

  /** Реплики, сказанные, пока поверх сцены было окно: покажем, когда оно закроется. */
  private pendingSay: { npc: Npc; text: string }[] = [];

  /** Реплика над персонажем на несколько секунд. */
  private say(npc: Npc, text?: string) {
    if (!text) return;
    if (this.host.isBlocked()) {
      this.pendingSay.push({ npc, text });
      return;
    }
    const bubble = this.add
      .text(npc.sprite.x, npc.sprite.y - CHAR_H * SCALE - 26, text, {
        fontFamily: "Rubik, system-ui, sans-serif",
        fontSize: "13px",
        color: "#2b231c",
        backgroundColor: "rgba(255,252,244,0.96)",
        padding: { x: 7, y: 4 },
        wordWrap: { width: 220 },
      })
      .setOrigin(0.5, 1)
      .setDepth(9_600);
    this.time.delayedCall(3500, () => bubble.destroy());
  }

  /** Один кадр хода: шаг по пути, занятая клетка, подпись; события — приход, закрытый путь. */
  private stepWalker(npc: Npc, dt: number) {
    const walk = npc.walk!;
    const pos = { x: npc.sprite.x, y: npc.sprite.y };
    const r = stepWalk(walk, pos, dt, SPEED * 0.9, this.walkFree);
    if (r.moved) {
      npc.sprite.setPosition(pos.x, pos.y).setDepth(pos.y);
      npc.x = pos.x;
      npc.y = pos.y - TILE / 2;
      npc.labelText.setPosition(pos.x, pos.y - CHAR_H * SCALE - 4);
      const tile = tileOfPoint(pos);
      if (tile.x !== npc.tile.x || tile.y !== npc.tile.y) {
        this.npcTiles.delete(`${npc.tile.x},${npc.tile.y}`);
        npc.tile = tile;
        this.npcTiles.add(`${tile.x},${tile.y}`);
      }
    }
    const here = tileOfPoint(pos);
    if (r.event === "arrived") {
      if (walk.leaving) this.removeNpc(npc);
      else this.settle(npc, walk.phase === "out" ? walk.goal : walk.origin);
    } else if (r.event === "failed") {
      this.say(npc, walk.failText);
      if (!turnBack(walk, this.walkFree, here)) this.settle(npc, here);
    } else if (r.event === "gaveUp") {
      this.settle(npc, here);
    }
    return r.moved;
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

  /** Ставит стоящего персонажа на клетку целиком: спрайт, точка взаимодействия, подпись, занятая клетка. */
  private placeNpc(npc: Npc, tile: { x: number; y: number }) {
    npc.tile = { x: tile.x, y: tile.y };
    const cx = (tile.x + 0.5) * TILE;
    const bottom = (tile.y + 1) * TILE - 2;
    npc.sprite.setPosition(cx, bottom).setDepth(bottom);
    npc.x = cx;
    npc.y = bottom - TILE / 2;
    npc.footprint = [npc.tile];
    npc.labelText.setPosition(cx, bottom - CHAR_H * SCALE - 4);
    this.npcTiles.add(`${tile.x},${tile.y}`);
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

  // ---------- области-триггеры ----------

  /** Области локации: взаимодействие (E) работает, пока игрок стоит внутри; вход может запускать диалог сам. */
  private buildZones() {
    ensureExitTextures(this.textures);
    this.zonesIn = new Set();
    this.hoveredExit = undefined;
    for (const z of this.location.zones ?? []) {
      if (!z.cells.length) continue;
      const cells = new Set(z.cells.map((c) => `${c.x},${c.y}`));
      // подпись — над самой верхней клеткой области, по центру её строки
      const top = Math.min(...z.cells.map((c) => c.y));
      const topRow = z.cells.filter((c) => c.y === top);
      const cx = (topRow.reduce((a, c) => a + c.x, 0) / topRow.length + 0.5) * TILE;
      const item: Interactable = {
        id: `zone:${z.id}`,
        label: z.name,
        x: cx,
        y: (top + 0.5) * TILE,
        footprint: z.cells,
        sprite: this.add.image(cx, (top + 1) * TILE, "exit_zone").setOrigin(0.5, 1).setScale(SCALE).setDepth(0),
        labelText: this.makeLabel(z.name).setPosition(cx, top * TILE - 4),
        zone: { id: z.id, cells },
      };
      this.interactables.push(item);
    }
  }

  /** Область-выход под клеткой, у которой сейчас есть подходящее действие (клик по ней — идти и пройти). */
  private exitZoneAt(tile: Tile) {
    return this.location.zones?.find(
      (z) => z.actions.some((a) => a.kind === "exit") && z.cells.some((c) => c.x === tile.x && c.y === tile.y) && this.host.hasZoneAction(z.id),
    );
  }

  /** Клик по выходу: игрок идёт в область и по приходу проходит (автовыход срабатывает сам при входе); уже стоит внутри — проходит сразу. */
  private goThroughExit(zone: { id: string; cells: Tile[]; actions: { kind: string; trigger?: string }[] }) {
    const here = this.tileOf(this.player);
    if (zone.cells.some((c) => c.x === here.x && c.y === here.y)) {
      this.path = [];
      this.host.onInteract(`zone:${zone.id}`);
      return;
    }
    if (this.walkTo(zone.cells.filter((c) => this.isFree(c.x, c.y))) && !zone.actions.some((a) => a.kind === "exit" && (a.trigger === "enter" || a.trigger === "enterEvery"))) this.pendingInteraction = `zone:${zone.id}`;
  }

  /** Выход под курсором (подпись показана, пока наведён). */
  private hoveredExit: Interactable | undefined;

  /** В каких областях игрок стоит сейчас (чтобы заметить вход). */
  private zonesIn = new Set<string>();

  /** Вошёл в область — сообщаем хосту (автозапуск диалога). */
  private watchZones() {
    const t = this.tileOf(this.player);
    const key = `${t.x},${t.y}`;
    const now = new Set<string>();
    for (const item of this.interactables) if (item.zone?.cells.has(key)) now.add(item.zone.id);
    const entered = [...now].filter((id) => !this.zonesIn.has(id));
    const left = [...this.zonesIn].filter((id) => !now.has(id));
    this.zonesIn = now;
    for (const id of left) this.host.leaveZone(id);
    for (const id of entered) this.host.enterZone(id);
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
    this.syncObjects();
    this.syncNpcs();
  }

  // ---------- двери ----------

  /** Предметы с `opensNear` (двери) распахиваются, когда рядом игрок или сопровождающий и они сейчас проходимы. */
  private animateDoors() {
    const doors = this.stateful.filter((e) => SPRITES[e.o.sprite].opensNear);
    if (!doors.length) return;
    const walkers = [this.player, ...[...this.npcs.values()].filter((n) => n.mode === "follower").map((n) => n.sprite)];
    const { progress, locationId } = this.host.getState();
    for (const e of doors) {
      const view = objectView(e.o, progress, locationId);
      const solid = view.state?.solid ?? SPRITES[e.o.sprite].solid;
      const near =
        !solid && walkers.some((w) => Phaser.Math.Distance.Between(w.x, w.y - TILE / 4, e.img.x, e.img.y - TILE / 2) < TILE * 1.7);
      const tex = ensureObjectFrameTexture(this.textures, e.o.sprite, near ? "open" : view.state?.frame);
      if (e.img.texture.key !== tex) e.img.setTexture(tex);
    }
  }

  private buildPlayer() {
    // точка входа из двери → сохранённая позиция → старт локации
    const { spawn } = this.host.getState();
    const saved = this.host.savedPlayer(this.caseFile.id);
    const start =
      spawn ??
      (saved && saved.locationId === this.location.id && this.isFree(saved.x, saved.y) ? saved : this.location.playerStart ?? firstFloorCell(this.location));
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
      if ((item as Npc).mode === "walker") return;
      if (this.host.isBlocked() || this.time.now - this.overlayClosedAt < 250) return;
      if (this.distanceTo(item) <= INTERACT_RANGE && this.canUse(item)) {
        this.path = [];
        this.host.onInteract(item.id);
        return;
      }
      // Подойти к объекту и взаимодействовать по прибытии (к висящему на стене — только спереди)
      const goals = item.access ?? item.footprint.flatMap((t) => [
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
    return this.solid[y]?.[x] === false && !this.npcTiles.has(key) && !this.objectTiles.has(key);
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

  private reachKey = "";
  private reach = new Set<string>();
  /** Проходимая клетка (стены и закрытые двери — нет); людей и мебель не учитываем: это о том, по какую сторону стены стоит игрок. */
  private walkable: IsFree = (x, y) => this.solid[y]?.[x] === false && !this.objectTiles.has(`${x},${y}`);

  /** Клетки, достижимые от игрока за два шага: через стену взаимодействовать нельзя. */
  private reachableTiles() {
    const t = this.tileOf(this.player);
    const key = `${t.x},${t.y}`;
    if (key !== this.reachKey) {
      this.reachKey = key;
      this.reach = reachWithin(this.walkable, t, 2);
    }
    return this.reach;
  }

  /** Можно ли пользоваться предметом отсюда: игрок стоит по ту же сторону стены, с которой к нему подходят. */
  private canUse(item: Interactable) {
    const reach = this.reachableTiles();
    const tiles =
      item.access ??
      item.footprint.flatMap((f) => [-1, 0, 1].flatMap((dx) => [-1, 0, 1].map((dy) => ({ x: f.x + dx, y: f.y + dy }))));
    return tiles.some((t) => reach.has(`${t.x},${t.y}`));
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

    if (!blocked && this.pendingSay.length) {
      for (const { npc, text } of this.pendingSay.splice(0)) if (this.npcs.get(npc.characterId) === npc) this.say(npc, text);
    }
    const talkingTo = state.overlay?.kind === "dialogue" ? state.overlay.npcId : null;
    let followerIndex = 0;
    for (const npc of this.npcs.values()) {
      let walking = false;
      if (npc.mode === "walker" && npc.walk) {
        walking = blocked ? false : this.stepWalker(npc, dt); // за окном (разговор, журнал) ход стоит
      } else if (npc.mode === "follower") {
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
    if (!blocked) this.watchZones();
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
    if (this.host.isBlocked()) return;
    const release = !this.focused && this.host.getState().progress.followers.length > 0; // нечего трогать — отпускаем спутников
    if (!this.focused && !release) return;
    // нажатие поглощаем: открывшееся окно не должно получить этот же Enter/Пробел
    event.preventDefault();
    event.stopImmediatePropagation();
    this.path = [];
    if (this.focused) this.host.onInteract(this.focused.id);
    else this.host.releaseFollowers();
  }

  private updateFocus(blocked: boolean) {
    let best: Interactable | null = null;
    let bestDist = INTERACT_RANGE;
    if (!blocked) {
      for (const item of this.interactables) {
        if ((item as Npc).mode === "walker") continue; // пока идёт, поговорить нельзя
        if (item.zone) {
          // область: подсказка, пока игрок внутри и у области есть подходящий диалог
          const t = this.tileOf(this.player);
          if (item.zone.cells.has(`${t.x},${t.y}`) && this.host.hasZoneAction(item.zone.id) && ZONE_RANGE < bestDist) {
            best = item;
            bestDist = ZONE_RANGE;
          }
          continue;
        }
        const d = this.distanceTo(item);
        if (d <= bestDist && this.canUse(item)) {
          best = item;
          bestDist = d;
        }
      }
    }
    const label = best?.label ?? null;
    if (best !== this.focused) {
      this.focused?.labelText.setVisible(false);
      this.focused?.sprite.clearTint();
      this.focused = best;
      gameBridge.focusListeners.forEach((l) => l(label));
    }
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
