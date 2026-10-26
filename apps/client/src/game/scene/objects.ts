import Phaser from "phaser";
import { isInteractive, type ClipStep, type Location, type LocationObject, type ObjectState } from "../../../../../shared/case";
import type { PublicCase as CaseFile } from "../../../../../shared/public-case";
import { effectSites } from "../../../../../shared/effect-sites";
import { DEFAULT_STATE, clipFrameAt, findAction, findTransition, loopFrameAt, timerActive, timerDelay } from "../../../../../shared/object-anim";
import { objectView } from "../../../../../shared/object-state";
import { SCALE, SPRITES, footprintCells, solidCells, TILE } from "../art";
import type { SceneHost } from "../host";
import { ensureObjectFrameTexture } from "./textures";
import type { Interactable } from "./types";

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

/** Что предметам нужно от сцены: мир, список взаимодействий, карта проходимости. */
export interface ObjectsContext {
  scene: Phaser.Scene;
  host: SceneHost;
  caseFile: CaseFile;
  location: Location;
  makeLabel(text: string): Phaser.GameObjects.Text;
  makeClickable(item: Interactable): void;
  addInteractable(item: Interactable): void;
  removeInteractable(item: Interactable): void;
  setSolid(x: number, y: number): void;
  refreshChecks(): void;
}

/** Предметы локации: картинки, осмотр, состояния, анимации и распахивание дверей. */
export class ObjectLayer {
  /** Клетки, занятые предметами с состояниями (меняются по ходу игры). */
  readonly tiles = new Set<string>();
  private stateful: ObjEntry[] = [];

  constructor(private readonly ctx: ObjectsContext) {}

  build() {
    const { scene, caseFile, location } = this.ctx;
    const animated = new Set(
      effectSites(caseFile as unknown as Parameters<typeof effectSites>[0]) /* нужны только эффекты, ответов сопоставлений они не касаются */
        .flatMap((s) => s.effects.flatMap((e) => (e.type === "playAnimation" ? [e.objectId] : []))),
    );
    for (const o of location.objects) {
      const spec = SPRITES[o.sprite];
      const cx = (o.x + spec.footprint.w / 2) * TILE;
      const bottom = (o.y + 1) * TILE - (spec.mount ?? 0) * SCALE;
      const img = scene.add
        .image(cx, bottom, `obj_${o.sprite}`)
        .setOrigin(0.5, 1)
        .setScale(SCALE)
        .setDepth(spec.flat ? 0 : bottom);
      const footprint = footprintCells(o.x, o.y, spec.footprint);
      const entry: ObjEntry = { o, img, footprint, item: null, animT: 0, overlayT: 0, timerAt: (o.timers ?? []).map((t) => timerDelay(t, Math.random())) };
      if (spec.mirrorRight && o.x >= location.tiles[0].length / 2) img.setFlipX(true);
      if (o.states?.length || spec.opensNear || o.actions?.length || o.timers?.length || animated.has(o.id)) this.stateful.push(entry);
      else {
        solidCells(o.x, o.y, spec).forEach((t) => this.ctx.setSolid(t.x, t.y));
        if (isInteractive(o)) this.addItem(entry, o.label);
      }
    }
    this.sync();
  }

  /** Сброс при `scene.restart()`: экземпляр сцены тот же. */
  reset() {
    this.stateful = [];
    this.tiles.clear();
  }

  /** Сделать предмет доступным для осмотра: подпись, галочка «осмотрено», клик. */
  private addItem(e: ObjEntry, label: string) {
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
      labelText: this.ctx.makeLabel(label),
      labelAt: { x: cx, y: top - 4 },
      check: this.ctx.scene.add
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
    this.ctx.makeClickable(item);
    this.ctx.addInteractable(item);
  }

  private removeItem(e: ObjEntry) {
    const item = e.item;
    if (!item) return;
    item.labelText.destroy();
    item.check?.destroy();
    e.img.removeAllListeners().disableInteractive();
    this.ctx.removeInteractable(item);
    e.item = null;
  }

  /** Вид, проходимость и доступность осмотра предметов с состояниями по текущему прогрессу. */
  sync() {
    if (!this.stateful.length) return;
    const { progress, locationId } = this.ctx.host.getState();
    this.tiles.clear();
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
      this.showFrame(e);
      solidCells(e.o.x, e.o.y, spec, view.state?.solid ?? spec.solid).forEach((t) => this.tiles.add(`${t.x},${t.y}`));
      if (view.interactive && !e.item) this.addItem(e, view.label);
      else if (!view.interactive) this.removeItem(e);
      else if (e.item && e.item.label !== view.label) {
        e.item.label = view.label;
        e.item.labelText.setText(view.label);
      }
    }
    this.ctx.refreshChecks();
  }

  /** Кадр предмета сейчас: переход, затем цикл состояния, иначе кадр состояния. */
  private showFrame(e: ObjEntry) {
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
    const tex = ensureObjectFrameTexture(this.ctx.scene.textures, e.o.sprite, frame ?? e.baseFrame);
    if (e.img.texture.key !== tex) e.img.setTexture(tex);
  }

  /** `clock` — время сцены: идёт всегда (цикл Phaser не засыпает), на паузе дела сцена не обновляется. */
  tick(deltaMs: number, clock: number) {
    for (const e of this.stateful) {
      e.o.timers?.forEach((t, i) => {
        if (clock < e.timerAt[i]) return;
        e.timerAt[i] = clock + timerDelay(t, Math.random());
        if (!e.trans && !e.overlay && timerActive(t, e.stateId ?? DEFAULT_STATE)) this.play(e, t.clip);
      });
      if (!e.trans && !e.loop && !e.overlay) continue;
      const wasTrans = !!e.trans;
      e.animT += deltaMs;
      e.overlayT += deltaMs;
      this.showFrame(e);
      if (wasTrans && !e.trans) {
        e.animT = 0; // цикл состояния начинается после перехода
        this.showFrame(e);
      }
    }
  }

  private play(e: ObjEntry, clip: ClipStep[]) {
    e.overlay = clip;
    e.overlayT = 0;
    this.showFrame(e);
  }

  /** Эффект `playAnimation`: разовый клип, если предмет сейчас не в переходе. */
  playClip(objectId: string, clip: ClipStep[]) {
    const e = this.stateful.find((s) => s.o.id === objectId);
    if (e && !e.trans) this.play(e, clip);
  }

  /** Анимация действия предмета (если есть) при взаимодействии с ним. */
  playAction(id: string) {
    const e = this.stateful.find((s) => s.o.id === id);
    const clip = e && !e.trans ? findAction(e.o, e.stateId ?? DEFAULT_STATE) : null;
    if (e && clip) this.play(e, clip);
  }

  /** Предметы с `opensNear` (двери) распахиваются, когда рядом один из `walkers` (игрок, сопровождающие) и они сейчас проходимы. */
  animateDoors(walkers: { x: number; y: number }[]) {
    const doors = this.stateful.filter((e) => SPRITES[e.o.sprite].opensNear && !e.trans);
    if (!doors.length) return;
    const { progress, locationId } = this.ctx.host.getState();
    for (const e of doors) {
      const view = objectView(e.o, progress, locationId);
      const solid = view.state?.solid ?? SPRITES[e.o.sprite].solid;
      const near = !solid && walkers.some((w) => Phaser.Math.Distance.Between(w.x, w.y - TILE / 4, e.img.x, e.img.y - TILE / 2) < TILE * 1.7);
      const tex = ensureObjectFrameTexture(this.ctx.scene.textures, e.o.sprite, near ? "open" : view.state?.frame);
      if (e.img.texture.key !== tex) e.img.setTexture(tex);
    }
  }
}
