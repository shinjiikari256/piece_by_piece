import type Phaser from "phaser";
import type { Location } from "../../../../../shared/case";
import type { PublicCase as CaseFile } from "../../../../../shared/public-case";
import { meets } from "../../../../../shared/conditions";
import { CHAR_H, SCALE, TILE } from "../art";
import type { SceneHost } from "../host";
import type { IsFree } from "./navigation";
import { redirect, startWalk, stepWalk, tileOfPoint, turnBack } from "./walker";
import { FOLLOW_GAP, SPEED } from "./consts";
import type { Interactable, Npc } from "./types";

/** Клетка, на которой стоит спрайт (низ-центр). */
export const tileOfSprite = (sprite: { x: number; y: number }) => ({ x: Math.floor(sprite.x / TILE), y: Math.floor((sprite.y - 2) / TILE) });

/** Что персонажам нужно от сцены: мир, игрок, список взаимодействий. */
export interface CrowdContext {
  scene: Phaser.Scene;
  host: SceneHost;
  caseFile: CaseFile;
  location: Location;
  player: Phaser.GameObjects.Sprite;
  /** Путь игрока — по нему идут сопровождающие. */
  trail: { x: number; y: number }[];
  isFree: IsFree;
  makeLabel(text: string): Phaser.GameObjects.Text;
  makeClickable(item: Interactable): void;
  addInteractable(item: Interactable): void;
  removeInteractable(item: Interactable): void;
}

/** Люди на карте: появление и уход, ход пешком (`moveTo`), спутники, реплики над головой. */
export class NpcCrowd {
  readonly npcs = new Map<string, Npc>();
  /** Клетки, занятые стоящими NPC (они меняются по ходу игры). */
  readonly tiles = new Set<string>();

  constructor(private readonly ctx: CrowdContext) {}

  /** Где должен быть каждый персонаж сейчас: на месте, рядом с игроком или в другой локации. Смена места — ход пешком (`moveTo`). */
  sync() {
    const { progress } = this.ctx.host.getState();
    const wanted = new Map<string, { mode: "static" | "follower"; tile: { x: number; y: number }; failText?: string }>();
    const hidden = new Set<string>();
    for (const loc of this.ctx.caseFile.locations) {
      for (const n of loc.npcs) {
        if (progress.followers.includes(n.characterId)) {
          wanted.set(n.characterId, { mode: "follower", tile: tileOfSprite(this.ctx.player) });
          continue;
        }
        // условие присутствия не выполнено — человека на карте нет (исчезает сразу, без хода к выходу)
        if (!meets(n.requires, progress, this.ctx.location.id)) {
          hidden.add(n.characterId);
          continue;
        }
        const place = progress.npcPlaces[n.characterId] ?? { locationId: loc.id, x: n.x, y: n.y };
        if (place.locationId === this.ctx.location.id) wanted.set(n.characterId, { mode: "static", tile: place, failText: place.failText });
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
          this.tiles.delete(`${npc.tile.x},${npc.tile.y}`);
          npc.walk = undefined;
          npc.mode = "follower";
        }
        continue;
      }
      const here = tileOfSprite(npc.sprite);
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
      const npcDef = this.ctx.location.npcs.find((n) => n.characterId === characterId) ??
        this.ctx.caseFile.locations.flatMap((l) => l.npcs).find((n) => n.characterId === characterId)!;
      const tile = want.mode === "follower" ? this.freeTileNear(tileOfSprite(this.ctx.player)) : want.tile;
      this.addNpc(npcDef.id, characterId, tile, want.mode);
    }
  }

  // ---------- ход персонажа (moveTo) ----------

  /** Свободна ли клетка для идущего персонажа: как для игрока, но и сам игрок на клетке — помеха. */
  private walkFree: IsFree = (x, y) => {
    const p = tileOfSprite(this.ctx.player);
    return this.ctx.isFree(x, y) && !(p.x === x && p.y === y);
  };

  /** Начать ход к клетке (или перестроить текущий). Пути нет сейчас — персонаж остаётся и «ругается». */
  private beginMove(npc: Npc, goal: { x: number; y: number }, failText?: string) {
    const from = tileOfSprite(npc.sprite);
    this.tiles.delete(`${npc.tile.x},${npc.tile.y}`);
    this.tiles.add(`${from.x},${from.y}`); // стоит на своей клетке, пока идёт
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
    const from = tileOfSprite(npc.sprite);
    this.tiles.delete(`${npc.tile.x},${npc.tile.y}`);
    this.tiles.add(`${from.x},${from.y}`);
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
    const seen = new Set([this.ctx.location.id]);
    const queue = exitsOf(this.ctx.location).map((first) => ({ at: first.to, first: first.zone }));
    while (queue.length) {
      const { at, first } = queue.shift()!;
      if (seen.has(at)) continue;
      seen.add(at);
      if (at === target) return first;
      const loc = this.ctx.caseFile.locations.find((l) => l.id === at);
      if (loc) for (const e of exitsOf(loc)) queue.push({ at: e.to, first });
    }
    return null;
  }

  /** Персонаж остановился на клетке: стоит там, а стор узнаёт его настоящее место (дошёл, вернулся или остался). */
  private settle(npc: Npc, tile: { x: number; y: number }) {
    npc.mode = "static";
    npc.walk = undefined;
    this.placeNpc(npc, tile);
    const def = this.ctx.caseFile.locations.flatMap((l) => l.npcs.map((n) => ({ locationId: l.id, ...n }))).find((n) => n.characterId === npc.characterId);
    const home = def && def.locationId === this.ctx.location.id && def.x === tile.x && def.y === tile.y;
    const saved = this.ctx.host.getState().progress.npcPlaces[npc.characterId];
    const same = home ? !saved : !!saved && saved.locationId === this.ctx.location.id && saved.x === tile.x && saved.y === tile.y;
    if (!same) this.ctx.host.setNpcPlace(npc.characterId, home ? null : { locationId: this.ctx.location.id, x: tile.x, y: tile.y });
  }

  /** Реплики, сказанные, пока поверх сцены было окно: покажем, когда оно закроется. */
  private pendingSay: { npc: Npc; text: string }[] = [];

  /** Реплика над персонажем на несколько секунд. */
  private say(npc: Npc, text?: string) {
    if (!text) return;
    if (this.ctx.host.isBlocked()) {
      this.pendingSay.push({ npc, text });
      return;
    }
    const bubble = this.ctx.scene.add
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
    this.ctx.scene.time.delayedCall(3500, () => bubble.destroy());
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
        this.tiles.delete(`${npc.tile.x},${npc.tile.y}`);
        npc.tile = tile;
        this.tiles.add(`${tile.x},${tile.y}`);
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
    const character = this.ctx.caseFile.characters.find((c) => c.id === characterId)!;
    const cx = (tile.x + 0.5) * TILE;
    const bottom = (tile.y + 1) * TILE - 2;
    const sprite = this.ctx.scene.add
      .sprite(cx, bottom, `chr_${character.id}`, "idle")
      .setOrigin(0.5, 1)
      .setScale(SCALE)
      .setDepth(bottom);
    if (mode === "static") this.tiles.add(`${tile.x},${tile.y}`);
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
      labelText: this.ctx.makeLabel(character.name).setPosition(cx, bottom - CHAR_H * SCALE - 4),
    };
    this.ctx.makeClickable(npc);
    this.ctx.addInteractable(npc);
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
    this.tiles.add(`${tile.x},${tile.y}`);
  }

  private removeNpc(npc: Npc) {
    this.tiles.delete(`${npc.tile.x},${npc.tile.y}`);
    npc.sprite.destroy();
    npc.labelText.destroy();
    this.ctx.removeInteractable(npc);
    this.npcs.delete(npc.characterId);
  }

  private freeTileNear(t: { x: number; y: number }) {
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, 1], [0, -1], [-1, 1], [1, 1]]) {
      if (this.ctx.isFree(t.x + dx, t.y + dy)) return { x: t.x + dx, y: t.y + dy };
    }
    return t;
  }

  /** Сопровождающий идёт по следу игрока на небольшом расстоянии. Возвращает, двигался ли. */
  private stepFollower(npc: Npc, index: number, dt: number) {
    const gap = FOLLOW_GAP * index;
    let target = this.ctx.trail[0] ?? { x: this.ctx.player.x, y: this.ctx.player.y };
    let acc = 0;
    for (let i = this.ctx.trail.length - 1; i > 0; i--) {
      acc += Math.hypot(this.ctx.trail[i].x - this.ctx.trail[i - 1].x, this.ctx.trail[i].y - this.ctx.trail[i - 1].y);
      if (acc >= gap) {
        target = this.ctx.trail[i - 1];
        break;
      }
    }
    const dx = target.x - npc.sprite.x;
    const dy = target.y - npc.sprite.y;
    const dist = Math.hypot(dx, dy);
    const toPlayer = Math.hypot(this.ctx.player.x - npc.sprite.x, this.ctx.player.y - npc.sprite.y);
    if (dist < 2 || toPlayer < gap * 0.8) return false;
    const step = Math.min(dist, SPEED * 1.15 * dt);
    npc.sprite.x += (dx / dist) * step;
    npc.sprite.y += (dy / dist) * step;
    return true;
  }

  /** Один кадр: реплики, накопившиеся за окном; ход идущих, след за игроком у спутников, кадры анимации. */
  update(blocked: boolean, dt: number, animClock: number, talkingTo: string | null) {
    if (!blocked && this.pendingSay.length) {
      for (const { npc, text } of this.pendingSay.splice(0)) if (this.npcs.get(npc.characterId) === npc) this.say(npc, text);
    }
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
      const phase = Math.floor((animClock + npc.x * 7) / (talking ? 180 : 700)) % 2 === 0;
      const walkFrame = Math.floor(animClock / 160) % 2 === 0 ? "walk1" : "walk2";
      npc.sprite.setFrame(walking ? walkFrame : talking ? (phase ? "talk" : "idle") : phase ? "idle" : "idle2");
    }
  }
}
