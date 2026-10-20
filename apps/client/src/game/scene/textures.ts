import type Phaser from "phaser";
import type { PublicCase } from "../../../../../shared/public-case";
import { spriteVersion } from "../art/sprites/registry";
import { CHAR_FRAMES, CHAR_H, CHAR_W, LOOKS, SPRITES, drawCharacter, drawSprite, resolveLook, type Look } from "../art";

type Textures = Phaser.Textures.TextureManager;

/** Текстуры предметов (по одной на вид). */
const seenVersion = new WeakMap<Textures, number>();

export function ensureObjectTextures(textures: Textures) {
  // набор спрайтов дела сменился — старые текстуры (в т.ч. кадры «obj_ключ#кадр») убираем, чтобы перерисовались
  const v = spriteVersion();
  if (seenVersion.get(textures) !== v) {
    if (seenVersion.has(textures)) for (const k of textures.getTextureKeys()) if (k.startsWith("obj_")) textures.remove(k);
    seenVersion.set(textures, v);
  }
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
  const spec = SPRITES[sprite];
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

/** Невидимая клетка-мишень выхода: клик и наведение ловит она, рисует выход сама карта (лестница, дверь). */
export function ensureExitTextures(textures: Textures) {
  if (textures.exists("exit_zone")) return;
  const c = textures.createCanvas("exit_zone", 16, 16)!;
  c.refresh();
}
