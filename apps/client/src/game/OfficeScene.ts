import Phaser from "phaser";
import { type Location } from "../../../../shared/case";
import type { PublicCase as CaseFile } from "../../../../shared/public-case";
import { firstFloorCell, getLocation } from "../content/case-utils";
import { BASE_TILE, SCALE, TILE, WALL_TILES, drawTile } from "./art";
import { gameBridge, gameZoom } from "./bridge";
import type { SceneHost } from "./host";
import { collides, findPath, nearestFree, reachWithin, slideShift, type IsFree, type Tile } from "./scene/navigation";
import { ensureCharacterTextures, ensureObjectTextures } from "./scene/textures";
import { NpcCrowd, tileOfSprite } from "./scene/npcs";
import { ObjectLayer } from "./scene/objects";
import { ZoneWatcher } from "./scene/zones";
import { SPEED } from "./scene/consts";
import type { Interactable, Npc } from "./scene/types";

const INTERACT_RANGE = TILE * 1.75;
/** Условное «расстояние» до области, в которой стоит игрок: ближе — персонаж или предмет рядом, дальше — область. */
const ZONE_RANGE = TILE * 1.5;
const INTERACT_KEYS = new Set(["KeyE", "Enter", "NumpadEnter", "Space"]);
const UI_TARGETS = "button, input, textarea, select, a, [contenteditable]";

/** Минимальный размер клетки на экране (px), ниже которого включается следящая камера. */
const MIN_TILE_PX = 16;
/** Отступ подписи от края видимой части поля (px). */
const LABEL_EDGE = 4;

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
  /** Путь игрока — по нему идут сопровождающие. */
  private trail: { x: number; y: number }[] = [];
  private leaving = false;
  /** Предметы с состояниями: вид и проходимость зависят от прогресса. */
  private objects!: ObjectLayer;
  private zones!: ZoneWatcher;
  /** Выход под курсором (подпись показана, пока наведён). */
  private hoveredExit: Interactable | undefined;
  private player!: Phaser.GameObjects.Sprite;
  private keys!: Record<"up" | "down" | "left" | "right" | "w" | "a" | "s" | "d", Phaser.Input.Keyboard.Key>;
  private interactables: Interactable[] = [];
  private crowd!: NpcCrowd;
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
    this.objects = this.makeObjects();
    this.objects.reset();
    this.objects.build();
    this.zones = this.makeZones();
    this.hoveredExit = undefined;
    this.zones.build();
    this.buildPlayer();
    this.crowd = this.makeCrowd();
    this.crowd.sync();
    this.fitCamera();
    this.scale.on(Phaser.Scale.Events.RESIZE, this.fitCamera, this);
    // масштаб может смениться до старта или после остановки сцены — карту тогда не трогаем
    const unsubscribeZoom = gameZoom.subscribe(() => {
      if (this.scene.isActive()) this.fitCamera();
    });
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
      const exit = this.zones.exitAt(tile);
      if (exit) return this.goThroughExit(exit);
      this.walkTo(nearestFree(this.isFreeFn, tile));
    });

    // наведение на выход: подпись области и курсор-«рука» (клик ведёт к нему и проходит)
    this.input.on("pointermove", (pointer: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => {
      const tile = { x: Math.floor(pointer.worldX / TILE), y: Math.floor(pointer.worldY / TILE) };
      const zone = over.length || this.host.isBlocked() ? undefined : this.zones.exitAt(tile);
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
        if (this.focused) this.interactWith(this.focused.id);
        else if (!this.host.isBlocked()) this.host.releaseFollowers();
      },
      whereIs: (characterId) => {
        const npc = this.crowd.npcs.get(characterId);
        if (!npc) return undefined;
        const x = Math.floor(npc.sprite.x / TILE);
        const y = Math.floor((npc.sprite.y - 2) / TILE);
        return { locationId: this.location.id, x, y };
      },
    });

    this.unsubscribe = this.host.subscribe(() => this.onStoreChange());
    this.refreshChecks();
    const stopAnimations = this.host.onPlayAnimation((objectId, clip) => {
      this.objects.playClip(objectId, clip);
    });
    this.cleanups.push(() => {
      stopAnimations();
      this.unsubscribe?.();
      this.unsubscribe = undefined;
      this.scale?.off(Phaser.Scale.Events.RESIZE, this.fitCamera, this);
      unsubscribeZoom();
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

  /** Люди на карте живут в `NpcCrowd`; сцена даёт им только то, что нужно (мир, игрока, список взаимодействий). */
  private makeCrowd() {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const scene = this;
    return new NpcCrowd({
      scene,
      get host() {
        return scene.host;
      },
      get caseFile() {
        return scene.caseFile;
      },
      get location() {
        return scene.location;
      },
      get player() {
        return scene.player;
      },
      get trail() {
        return scene.trail;
      },
      isFree: (x, y) => scene.isFree(x, y),
      makeLabel: (text) => scene.makeLabel(text),
      makeClickable: (item) => scene.makeClickable(item),
      addInteractable: (item) => void scene.interactables.push(item),
      removeInteractable: (item) => {
        scene.interactables = scene.interactables.filter((i) => i !== item);
        if (scene.focused === item) scene.focused = null;
      },
    });
  }

  /** Предметы живут в `ObjectLayer`; сцена даёт им мир, список взаимодействий и карту проходимости. */
  private makeObjects() {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const scene = this;
    return new ObjectLayer({
      scene,
      get host() {
        return scene.host;
      },
      get caseFile() {
        return scene.caseFile;
      },
      get location() {
        return scene.location;
      },
      makeLabel: (text) => scene.makeLabel(text),
      makeClickable: (item) => scene.makeClickable(item),
      addInteractable: (item) => void scene.interactables.push(item),
      removeInteractable: (item) => {
        scene.interactables = scene.interactables.filter((i) => i !== item);
        if (scene.focused === item) scene.focused = null;
      },
      setSolid: (x, y) => scene.setSolid(x, y),
      refreshChecks: () => scene.refreshChecks(),
    });
  }

  /** Области живут в `ZoneWatcher`. */
  private makeZones() {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const scene = this;
    return new ZoneWatcher({
      scene,
      get host() {
        return scene.host;
      },
      get location() {
        return scene.location;
      },
      get player() {
        return scene.player;
      },
      get interactables() {
        return scene.interactables;
      },
      makeLabel: (text) => scene.makeLabel(text),
      addInteractable: (item) => void scene.interactables.push(item),
    });
  }

  private makeLabel(text: string) {
    return this.add.text(0, 0, text, labelStyle).setOrigin(0.5, 1).setDepth(9_000).setVisible(false);
  }

  /** Взаимодействие с предметом или областью: анимация действия предмета (если есть) и передача событию игры. */
  private interactWith(id: string) {
    this.objects.playAction(id);
    this.host.onInteract(id);
  }

  /** Клик по выходу: игрок идёт в область и по приходу проходит (автовыход срабатывает сам при входе); уже стоит внутри — проходит сразу. */
  private goThroughExit(zone: { id: string; cells: Tile[]; actions: { kind: string; trigger?: string }[] }) {
    const here = tileOfSprite(this.player);
    if (zone.cells.some((c) => c.x === here.x && c.y === here.y)) {
      this.path = [];
      this.host.onInteract(`zone:${zone.id}`);
      return;
    }
    if (this.walkTo(zone.cells.filter((c) => this.isFree(c.x, c.y))) && !zone.actions.some((a) => a.kind === "exit" && (a.trigger === "enter" || a.trigger === "enterEvery")))
      this.pendingInteraction = `zone:${zone.id}`;
  }

  /**
   * Масштаб: «вписать» — вся карта на экране, если клетка не мельче MIN_TILE_PX
   * (иначе как на маленьком экране); число — тайлы крупнее базовых. Если карта
   * целиком не помещается, камера следит за игроком.
   */
  private fitCamera() {
    const cam = this.cameras.main;
    const { width, height } = this.scale.gameSize;
    const worldW = this.location.tiles[0].length * TILE;
    const worldH = this.location.tiles.length * TILE;
    const fit = Math.min(width / worldW, height / worldH);
    const minZoom = MIN_TILE_PX / TILE;
    const chosen = gameZoom.get();
    const zoom = Math.max(chosen === "fit" ? fit : chosen, minZoom);
    gameZoom.setShown(zoom, minZoom);
    if (worldW * zoom <= width && worldH * zoom <= height) {
      cam.stopFollow();
      cam.removeBounds();
      cam.setZoom(zoom);
      cam.centerOn(worldW / 2, worldH / 2);
    } else {
      cam.setZoom(zoom);
      // по оси, где карта меньше экрана, держим её по центру
      const bw = Math.max(worldW, width / zoom);
      const bh = Math.max(worldH, height / zoom);
      cam.setBounds((worldW - bw) / 2, (worldH - bh) / 2, bw, bh);
      cam.startFollow(this.player, true, 0.2, 0.2);
    }
  }

  /**
   * Подписи не уходят за видимую часть поля: у верхнего или бокового края камеры
   * их сдвигает внутрь, иначе наведение на предмет у края не показывает подпись.
   */
  private placeLabels() {
    const view = this.cameras.main.worldView;
    for (const { labelText: label, labelAt: at } of this.interactables) {
      const half = label.width / 2 + LABEL_EDGE;
      label.setPosition(Phaser.Math.Clamp(at.x, view.left + half, view.right - half), Math.max(at.y, view.top + label.height + LABEL_EDGE));
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
    this.objects.sync();
    this.crowd.sync();
  }

  private buildPlayer() {
    // точка входа из двери → сохранённая позиция → старт локации
    const { spawn } = this.host.getState();
    const saved = this.host.savedPlayer(this.caseFile.id);
    const start = spawn ?? (saved && saved.locationId === this.location.id && this.isFree(saved.x, saved.y) ? saved : (this.location.playerStart ?? firstFloorCell(this.location)));
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
        this.interactWith(item.id);
        return;
      }
      // Подойти к объекту и взаимодействовать по прибытии (к висящему на стене — только спереди)
      const goals =
        item.access ??
        item.footprint.flatMap((t) => [
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
    return this.solid[y]?.[x] === false && !this.crowd?.tiles.has(key) && !this.objects.tiles.has(key);
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
  private walkable: IsFree = (x, y) => this.solid[y]?.[x] === false && !this.objects.tiles.has(`${x},${y}`);

  /** Клетки, достижимые от игрока за два шага: через стену взаимодействовать нельзя. */
  private reachableTiles() {
    const t = tileOfSprite(this.player);
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
    const tiles = item.access ?? item.footprint.flatMap((f) => [-1, 0, 1].flatMap((dx) => [-1, 0, 1].map((dy) => ({ x: f.x + dx, y: f.y + dy }))));
    return tiles.some((t) => reach.has(`${t.x},${t.y}`));
  }

  private distanceTo(item: Interactable) {
    return Phaser.Math.Distance.Between(this.player.x, this.player.y - TILE / 4, item.x, item.y);
  }

  /** Множитель хода (игрок, люди): сквозные тесты ускоряют ходьбу; шаг за кадр при ≤3 остаётся меньше тайла. */
  timeScale = 1;

  update(_: number, deltaMs: number) {
    const state = this.host.getState();
    const blocked = this.host.isBlocked();
    const dt = (Math.min(deltaMs, 50) / 1000) * this.timeScale;
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
          this.interactWith(id);
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

    this.crowd.update(blocked, dt, this.animClock, state.overlay?.kind === "dialogue" ? state.overlay.npcId : null);
    this.placeLabels();

    this.objects.animateDoors([this.player, ...[...this.crowd.npcs.values()].filter((n) => n.mode === "follower").map((n) => n.sprite)]);
    this.objects.tick(deltaMs, this.animClock);
    if (!blocked) this.zones.watch();
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
    if (this.focused) this.interactWith(this.focused.id);
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
          const t = tileOfSprite(this.player);
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
