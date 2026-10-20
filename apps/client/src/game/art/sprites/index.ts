import type { SpriteKey } from "../../../../../../shared/case";
import furniture from "./data/furniture.json";
import office from "./data/office.json";
import wall from "./data/wall.json";
import household from "./data/household.json";
import court from "./data/court.json";
import commerce from "./data/commerce.json";
import medical from "./data/medical.json";
import street from "./data/street.json";
import doors from "./data/doors.json";
import type { SpriteGroup, SpriteSpec } from "./types";

export { SPRITE_COLOR, drawSprite, type SpriteFrames, type SpriteGroup, type SpriteOp, type SpriteSpec } from "./types";
export { footprintCells, footprintHas, solidCells, type Footprint } from "./cells";

/** Группы предметов в порядке показа в палитре редактора карты. */
export const SPRITE_GROUPS: SpriteGroup[] = [furniture, office, wall, household, court, commerce, medical, street, doors] as unknown as SpriteGroup[]; // JSON даёт кортежи как массивы: форму проверяет sprites.test.ts

/** Все спрайты по ключу; полноту набора проверяет тест (`sprites.test.ts`). */
export const SPRITES = Object.assign({}, ...SPRITE_GROUPS.map((g) => g.sprites)) as Record<SpriteKey, SpriteSpec>;
