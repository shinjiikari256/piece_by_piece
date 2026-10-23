import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import type { CaseFile } from "../../../shared/case";
import { embedSprites, readSpriteSpecs } from "../../../shared/offline-embed";

const TEMPLATE = "<html><head><title>Дело</title></head><body></body></html>";
const SPRITES_DIR = new URL("../../client/src/game/art/sprites/data", import.meta.url).pathname;

const caseWith = (...sprites: string[]) => ({ locations: [{ objects: sprites.map((sprite) => ({ sprite })) }] }) as unknown as CaseFile;

/** Вшитый набор спрайтов из шаблона (`id="sprites"`). */
const embeddedKeys = (html: string) => {
  const m = html.match(/<script type="application\/json" id="sprites">(.*?)<\/script>/);
  return m ? Object.keys(JSON.parse(m[1])).sort() : null;
};

describe("embedSprites", () => {
  it("вшивает только спрайты, которые стоят в делах", () => {
    const specs = { desk: { w: 1 }, chair: { w: 1 }, sofa: { w: 1 } };
    const html = embedSprites(TEMPLATE, specs, [caseWith("desk"), caseWith("sofa", "desk")]);
    expect(embeddedKeys(html)).toEqual(["desk", "sofa"]);
  });

  it("без нужных спрайтов вшивает пустой набор", () => {
    expect(embeddedKeys(embedSprites(TEMPLATE, { desk: { w: 1 } }, [caseWith("door_h")]))).toEqual([]);
  });

  it("не вшивает второй раз поверх уже вшитых спрайтов", () => {
    const once = embedSprites(TEMPLATE, { desk: { w: 1 } }, [caseWith("desk")]);
    expect(() => embedSprites(once, { desk: { w: 1 } }, [caseWith("desk")])).toThrow();
  });

  it("экранирует «</» внутри JSON", () => {
    const html = embedSprites(TEMPLATE, { desk: { label: "</script>" } }, [caseWith("desk")]);
    expect(JSON.parse(html.match(/id="sprites">(.*?)<\/script>/)![1]).desk.label).toBe("</script>");
  });
});

describe("readSpriteSpecs", () => {
  it("читает спрайты всех групп из папки данных клиента", () => {
    expect(existsSync(SPRITES_DIR)).toBe(true);
    const specs = readSpriteSpecs(SPRITES_DIR);
    expect(specs).toHaveProperty("desk");
    expect(Object.keys(specs).length).toBeGreaterThan(50);
  });
});
