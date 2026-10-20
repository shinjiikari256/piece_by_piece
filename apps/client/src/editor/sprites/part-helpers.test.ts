import { describe, expect, it } from "vitest";
import type { CaseFile, CustomPart } from "../../../../../shared/case";
import { copyPart, isBuiltinPart, newPart, partId, partUses, partView, patchPart, setPartOps, slotKeys, splitPartId, withoutPose } from "./part-helpers";

const mine: CustomPart = { key: "wig", name: "Парик", slot: "hair", frames: { default: [[0, 0, 1, 1, "$hair"]], talk: [] } };
const draft = (parts: CustomPart[] = [mine]) =>
  ({ parts, characters: [{ id: "a", name: "Анна", appearance: { hairStyle: "wig", accentStyle: "tie", bottom: "pants" } }, { id: "b", name: "Борис" }] }) as unknown as CaseFile;

describe("части персонажей в конструкторе", () => {
  it("адрес части разбирается обратно", () => {
    expect(splitPartId(partId("hair", "a/b"))).toEqual(["hair", "a/b"]);
    expect(splitPartId("нет")).toBeNull();
  });

  it("встроенные видны как неизменяемые, свои — после встроенных", () => {
    expect(isBuiltinPart("hair", "short")).toBe(true);
    expect(partView(draft(), "hair", "short")?.name).toBeTruthy();
    expect(partView(draft(), "hair", "wig")).toBe(mine);
    expect(partView(draft(), "hair", "нет")).toBeNull();
    expect(slotKeys(draft(), "hair").at(-1)).toBe("wig");
  });

  it("новая часть и копия не повторяют ключи", () => {
    const d = draft();
    expect(newPart(d, "hair").key).toBe("part");
    expect(newPart(draft([{ ...mine, key: "part" }]), "hair").key).toBe("part_2");
    const c = copyPart(d, mine);
    expect(c.key).toBe("wig_copy");
    expect(c.frames).toEqual(mine.frames);
    expect(c.frames).not.toBe(mine.frames);
    expect(copyPart(draft([mine, c]), mine).key).toBe("wig_copy_2");
  });

  it("правка кадра и свойств затрагивает только свою часть", () => {
    const other: CustomPart = { ...mine, key: "other" };
    const d = setPartOps(draft([mine, other]), "hair", "wig", "idle", [[1, 1, 1, 1]]);
    expect(d.parts![0].frames.idle).toEqual([[1, 1, 1, 1]]);
    expect(d.parts![1]).toBe(other);
    expect(patchPart(d, "hair", "wig", { name: "Новое" }).parts![0].name).toBe("Новое");
  });

  it("кто использует часть", () => {
    expect(partUses(draft(), "hair", "wig")).toEqual(["Анна"]);
    expect(partUses(draft(), "accent", "tie")).toEqual(["Анна"]);
    expect(partUses(draft(), "hair", "short")).toEqual([]);
  });

  it("кадр default удалить нельзя, остальные — можно", () => {
    expect(withoutPose(mine.frames, "default")).toBe(mine.frames);
    expect(Object.keys(withoutPose(mine.frames, "talk"))).toEqual(["default"]);
  });
});
