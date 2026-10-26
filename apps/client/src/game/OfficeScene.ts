import Phaser from "phaser";
import { isInteractive, type Location, type LocationObject } from "../../../../shared/case";
import type { PublicCase as CaseFile } from "../../../../shared/public-case";
import type { ClipStep, ObjectState } from "../../../../shared/case";
import { effectSites } from "../../../../shared/effect-sites";
import { DEFAULT_STATE, clipFrameAt, findAction, findTransition, loopFrameAt, timerActive, timerDelay } from "../../../../shared/object-anim";
import { objectView } from "../../../../shared/object-state";
import { firstFloorCell, getLocation } from "../content/case-utils";
import { BASE_TILE, SCALE, SPRITES, footprintCells, solidCells, TILE, WALL_TILES, drawTile } from "./art";
import { gameBridge, gameZoom } from "./bridge";
import type { SceneHost } from "./host";
import { collides, findPath, nearestFree, reachWithin, slideShift, type IsFree, type Tile } from "./scene/navigation";
import { ensureCharacterTextures, ensureExitTextures, ensureObjectFrameTexture, ensureObjectTextures } from "./scene/textures";
import { NpcCrowd, tileOfSprite } from "./scene/npcs";
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

/** Предмет на сцене: картинка, опора, кнопка осмотра и состояние анимации. */
interface ObjEntry {
  o: LocationObject;
  img: Phaser.GameObjects.Image;
  footprint: { x: number; y: number }[];
  item: Interactable | null;
  stateId?: string;
  baseFrame?: string;
  loop?: ObjectState["loop"];
  trans?: ClipStep[];
  /** Разовый клип поверх состояния (действие или таймер) и его время, мс. */
  overlay?: ClipStep[];
  overlayT: number;
  /** Когда (по часам сцены) в следующий раз сработает каждый таймер. */
  timerAt: number[];
  /** Время с начала текущего перехода или цикла, мс. */
  animT: number;
}

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
  private stateful: ObjEntry[] = [];
  private objectTiles = new Set<string>();
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
    this.stateful = [];
    this.objectTiles = new Set();
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
      const e = this.stateful.find((s) => s.o.id === objectId);
      if (e && !e.trans) this.playOverlay(e, clip);
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

  private makeLabel(text: string) {
    return this.add.text(0, 0, text, labelStyle).setOrigin(0.5, 1).setDepth(9_000).setVisible(false);
  }

  private buildObjects() {
    const animated = new Set(
      effectSites(this.caseFile as unknown as Parameters<typeof effectSites>[0]) /* нужны только эффекты, ответов сопоставлений они не касаются */
        .flatMap((s) => s.effects.flatMap((e) => (e.type === "playAnimation" ? [e.objectId] : []))),
    );
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
      const entry: ObjEntry = { o, img, footprint, item: null, animT: 0, overlayT: 0, timerAt: (o.timers ?? []).map((t) => timerDelay(t, Math.random())) };
      if (spec.mirrorRight && o.x >= this.location.tiles[0].length / 2) img.setFlipX(true);
      if (o.states?.length || spec.opensNear || o.actions?.length || o.timers?.length || animated.has(o.id)) this.stateful.push(entry);
      else {
        solidCells(o.x, o.y, spec).forEach((t) => this.setSolid(t.x, t.y));
        if (isInteractive(o)) this.addObjectItem(entry, o.label);
      }
    }
    this.syncObjects();
  }

  /** Сделать предмет доступным для осмотра: подпись, галочка «осмотрено», клик. */
  private addObjectItem(e: ObjEntry, label: string) {
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
      labelText: this.makeLabel(label),
      labelAt: { x: cx, y: top - 4 },
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
      const sid = view.state?.id ?? DEFAULT_STATE;
      // живая смена состояния запускает переход; первая синхронизация (старт, загрузка) только запоминает состояние
      if (e.stateId !== undefined && e.stateId !== sid) {
        e.trans = findTransition(e.o, e.stateId, sid) ?? undefined;
        e.animT = 0;
      }
      e.stateId = sid;
      e.baseFrame = view.state?.frame;
      e.loop = view.state?.loop;
      this.showObjectFrame(e);
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

  /** Кадр предмета сейчас: переход, затем цикл состояния, иначе кадр состояния. */
  private showObjectFrame(e: ObjEntry) {
    let frame: string | null = null;
    if (e.trans) {
      frame = clipFrameAt(e.trans, e.animT);
      if (frame === null) e.trans = undefined;
    }
    if (frame === null && e.overlay) {
      frame = clipFrameAt(e.overlay, e.overlayT);
      if (frame === null) e.overlay = undefined;
    }
    if (frame === null && e.loop) frame = loopFrameAt(e.loop, e.animT);
    const tex = ensureObjectFrameTexture(this.textures, e.o.sprite, frame ?? e.baseFrame);
    if (e.img.texture.key !== tex) e.img.setTexture(tex);
  }

  /** Время сцены: идёт всегда (цикл Phaser не засыпает), на паузе дела сцена не обновляется. */
  private tickObjectAnims(deltaMs: number) {
    for (const e of this.stateful) {
      e.o.timers?.forEach((t, i) => {
        if (this.animClock < e.timerAt[i]) return;
        e.timerAt[i] = this.animClock + timerDelay(t, Math.random());
        if (!e.trans && !e.overlay && timerActive(t, e.stateId ?? DEFAULT_STATE)) this.playOverlay(e, t.clip);
      });
      if (!e.trans && !e.loop && !e.overlay) continue;
      const wasTrans = !!e.trans;
      e.animT += deltaMs;
      e.overlayT += deltaMs;
      this.showObjectFrame(e);
      if (wasTrans && !e.trans) {
        e.animT = 0; // цикл состояния начинается после перехода
        this.showObjectFrame(e);
      }
    }
  }

  private playOverlay(e: ObjEntry, clip: ClipStep[]) {
    e.overlay = clip;
    e.overlayT = 0;
    this.showObjectFrame(e);
  }

  /** Взаимодействие с предметом или областью: анимация действия предмета (если есть) и передача событию игры. */
  private interactWith(id: string) {
    const e = this.stateful.find((s) => s.o.id === id);
    const clip = e && !e.trans ? findAction(e.o, e.stateId ?? DEFAULT_STATE) : null;
    if (e && clip) this.playOverlay(e, clip);
    this.host.onInteract(id);
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
        sprite: this.add
          .image(cx, (top + 1) * TILE, "exit_zone")
          .setOrigin(0.5, 1)
          .setScale(SCALE)
          .setDepth(0),
        labelText: this.makeLabel(z.name),
        labelAt: { x: cx, y: top * TILE - 4 },
        zone: { id: z.id, cells },
      };
      this.interactables.push(item);
    }
  }

  /** Область-выход под клеткой, у которой сейчас есть подходящее действие (клик по ней — идти и пройти). */
  private exitZoneAt(tile: Tile) {
    return this.location.zones?.find((z) => z.actions.some((a) => a.kind === "exit") && z.cells.some((c) => c.x === tile.x && c.y === tile.y) && this.host.hasZoneAction(z.id));
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

  /** Выход под курсором (подпись показана, пока наведён). */
  private hoveredExit: Interactable | undefined;

  /** В каких областях игрок стоит сейчас (чтобы заметить вход). */
  private zonesIn = new Set<string>();

  /** Вошёл в область — сообщаем хосту (автозапуск диалога). */
  private watchZones() {
    const t = tileOfSprite(this.player);
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
    this.syncObjects();
    this.crowd.sync();
  }

  // ---------- двери ----------

  /** Предметы с `opensNear` (двери) распахиваются, когда рядом игрок или сопровождающий и они сейчас проходимы. */
  private animateDoors() {
    const doors = this.stateful.filter((e) => SPRITES[e.o.sprite].opensNear && !e.trans);
    if (!doors.length) return;
    const walkers = [this.player, ...[...this.crowd.npcs.values()].filter((n) => n.mode === "follower").map((n) => n.sprite)];
    const { progress, locationId } = this.host.getState();
    for (const e of doors) {
      const view = objectView(e.o, progress, locationId);
      const solid = view.state?.solid ?? SPRITES[e.o.sprite].solid;
      const near = !solid && walkers.some((w) => Phaser.Math.Distance.Between(w.x, w.y - TILE / 4, e.img.x, e.img.y - TILE / 2) < TILE * 1.7);
      const tex = ensureObjectFrameTexture(this.textures, e.o.sprite, near ? "open" : view.state?.frame);
      if (e.img.texture.key !== tex) e.img.setTexture(tex);
    }
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
    return this.solid[y]?.[x] === false && !this.crowd?.tiles.has(key) && !this.objectTiles.has(key);
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

    this.animateDoors();
    this.tickObjectAnims(deltaMs);
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
