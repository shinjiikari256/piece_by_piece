import { describe, expect, it } from "vitest";
import type { CaseFile, LocationObject } from "../../../../../shared/case";
import testCase from "../../content/test-cases/case-test-moveto.json";
import { previewSources } from "./AnimPreview";

const safe = (testCase as unknown as CaseFile).locations.flatMap((l) => l.objects).find((o) => o.id === "dec_safe") as LocationObject;

describe("предпросмотр анимаций предмета", () => {
  it("предмет без анимаций — один кадр по умолчанию", () => {
    const o = { id: "x", sprite: "door_h", x: 0, y: 0, label: "", interaction: null, onInteract: [] } as LocationObject;
    expect(previewSources(o).map((s) => s.id)).toEqual(["frame:default"]);
  });

  it("сейф: состояния, цикл, переходы, действие и таймер перечислены, у клипов есть кадры", () => {
    const sources = previewSources(safe);
    const ids = sources.map((s) => s.id);
    for (const st of safe.states ?? []) expect(ids).toContain(`state:${st.id}`);
    if (safe.states?.some((st) => st.loop)) expect(ids.some((i) => i.startsWith("loop:"))).toBe(true);
    if (safe.transitions?.length) expect(ids).toContain("tr:0");
    if (safe.actions?.length) expect(ids).toContain("ac:0");
    if (safe.timers?.length) expect(ids).toContain("ti:0");
    for (const s of sources.filter((x) => x.clip)) expect(s.clip!.length).toBeGreaterThan(0);
  });
});
