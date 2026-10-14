import type { SpriteKey } from "../../../../../../shared/case";
import { furniture } from "./furniture";
import { office } from "./office";
import { wall } from "./wall";
import { household } from "./household";
import { court } from "./court";
import { commerce } from "./commerce";
import { medical } from "./medical";
import { street } from "./street";
import type { SpriteGroup, SpriteSpec } from "./types";

export type { SpriteGroup, SpriteSpec } from "./types";

/** Группы предметов в порядке показа в палитре редактора карты. */
export const SPRITE_GROUPS: SpriteGroup[] = [furniture, office, wall, household, court, commerce, medical, street];

/** Все спрайты по ключу; полноту набора проверяет тест (`sprites.test.ts`). */
export const SPRITES = Object.assign({}, ...SPRITE_GROUPS.map((g) => g.sprites)) as Record<SpriteKey, SpriteSpec>;
