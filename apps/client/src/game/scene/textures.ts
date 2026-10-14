import type Phaser from "phaser";
import type { PublicCase } from "../../../../../shared/public-case";
import { CHAR_FRAMES, CHAR_H, CHAR_W, DOOR_SIZE, LOOKS, SPRITES, drawCharacter, drawDoor, resolveLook, type Look } from "../art";

type Textures = Phaser.Textures.TextureManager;

/** Текстуры предметов (по одной на вид). */
export function ensureObjectTextures(textures: Textures) {
  for (const [key, spec] of Object.entries(SPRITES)) {
    const tex = `obj_${key}`;
    if (textures.exists(tex)) continue;
    const canvas = textures.createCanvas(tex, spec.w, spec.h)!;
    spec.draw(canvas.getContext());
    canvas.refresh();
  }
}

/** Текстура на игрока и на каждого персонажа дела (у персонажа может быть своя внешность). */
export function ensureCharacterTextures(textures: Textures, characters: PublicCase["characters"]) {
  const looks: [string, Look][] = [
    ["char_player", LOOKS.player],
    ...characters.map((c): [string, Look] => [`chr_${c.id}`, resolveLook(c)]),
  ];
  for (const [tex, look] of looks) {
    if (textures.exists(tex)) continue;
    const canvas = textures.createCanvas(tex, CHAR_W * CHAR_FRAMES.length, CHAR_H)!;
    const ctx = canvas.getContext();
    CHAR_FRAMES.forEach((frame, i) => {
      drawCharacter(ctx, look, frame, i * CHAR_W);
      canvas.add(frame, 0, i * CHAR_W, 0, CHAR_W, CHAR_H);
    });
    canvas.refresh();
  }
}

/** Двери: горизонтальная и вертикальная, в трёх состояниях. */
export function ensureDoorTextures(textures: Textures) {
    for (const o of ["h", "v"] as const)
      for (const state of ["open", "closed", "locked"] as const) {
        const key = `door_${o}_${state}`;
        if (textures.exists(key)) continue;
        const c = textures.createCanvas(key, DOOR_SIZE[o].w, DOOR_SIZE[o].h)!;
        drawDoor(c.getContext(), o, state === "open", state === "locked");
        c.refresh();
      }
}

/** Стрелки выходов: круглая плашка с шевроном в сторону края карты. */
export function ensureExitTextures(textures: Textures) {
    for (const dir of ["left", "right", "up", "down"] as const) {
      const key = `exit_${dir}`;
      if (textures.exists(key)) continue;
      const c = textures.createCanvas(key, 16, 16)!;
      const ctx = c.getContext();
      ctx.fillStyle = "rgba(43,76,126,0.8)";
      ctx.beginPath();
      ctx.arc(8, 8, 6.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#fdf8ec";
      // шеврон «›» по пикселям, потом поворачиваем рисунок
      const px: [number, number][] = [[6, 4], [7, 5], [8, 6], [9, 7], [9, 8], [8, 9], [7, 10], [6, 11], [5, 4], [6, 5], [7, 6], [8, 7], [8, 8], [7, 9], [6, 10], [5, 11]];
      for (const [x, y] of px) {
        const [rx, ry] = dir === "right" ? [x, y] : dir === "left" ? [15 - x, y] : dir === "down" ? [y, x] : [y, 15 - x];
        ctx.fillRect(rx, ry, 1, 1);
      }
      c.refresh();
    }
}
