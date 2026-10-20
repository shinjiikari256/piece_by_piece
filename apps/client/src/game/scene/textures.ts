import type Phaser from "phaser";
import type { PublicCase } from "../../../../../shared/public-case";
import { CHAR_FRAMES, CHAR_H, CHAR_W, DOOR_SIZE, LOOKS, SPRITES, drawCharacter, drawDoor, drawSprite, resolveLook, type Look } from "../art";

type Textures = Phaser.Textures.TextureManager;

/** Текстуры предметов (по одной на вид). */
export function ensureObjectTextures(textures: Textures) {
  for (const [key, spec] of Object.entries(SPRITES)) {
    const tex = `obj_${key}`;
    if (textures.exists(tex)) continue;
    const canvas = textures.createCanvas(tex, spec.w, spec.h)!;
    drawSprite(canvas.getContext(), spec);
    canvas.refresh();
  }
}

/** Текстура кадра предмета (по умолчанию — обычная); возвращает её ключ. Неизвестный кадр рисуется как `default`. */
export function ensureObjectFrameTexture(textures: Textures, sprite: string, frame?: string): string {
  const spec = SPRITES[sprite as keyof typeof SPRITES];
  if (!frame || frame === "default" || !spec.frames[frame]) return `obj_${sprite}`;
  const tex = `obj_${sprite}#${frame}`;
  if (!textures.exists(tex)) {
    const canvas = textures.createCanvas(tex, spec.w, spec.h)!;
    drawSprite(canvas.getContext(), spec, frame);
    canvas.refresh();
  }
  return tex;
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

/** Невидимая клетка-мишень выхода: клик и наведение ловит она, рисует выход сама карта (лестница, дверь). */
export function ensureExitTextures(textures: Textures) {
  if (textures.exists("exit_zone")) return;
  const c = textures.createCanvas("exit_zone", 16, 16)!;
  c.refresh();
}
