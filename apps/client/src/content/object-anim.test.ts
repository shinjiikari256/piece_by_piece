import { describe, expect, it } from "vitest";
import { clipDuration, clipFrameAt, findTransition, loopFrameAt } from "../../../../shared/object-anim";

const clip = [{ frame: "a", ms: 100 }, { frame: "b", ms: 200 }];

describe("анимации предметов", () => {
  it("кадр клипа по времени; после конца — null", () => {
    expect(clipDuration(clip)).toBe(300);
    expect([0, 99, 100, 299, 300].map((t) => clipFrameAt(clip, t))).toEqual(["a", "a", "b", "b", null]);
  });

  it("цикл идёт по кругу, в паузе виден кадр состояния (null)", () => {
    const loop = { clip, pauseMs: 100 };
    expect([0, 150, 300, 399, 400, 500].map((t) => loopFrameAt(loop, t))).toEqual(["a", "b", null, null, "a", "b"]);
  });

  it("переход: точное совпадение, затем «*»; нет совпадения — null", () => {
    const o = { transitions: [{ from: "x", to: "y", clip }, { from: "*", to: "open", clip: [{ frame: "z", ms: 10 }] }] };
    expect(findTransition(o, "x", "y")).toBe(clip);
    expect(findTransition(o, "q", "open")?.[0].frame).toBe("z");
    expect(findTransition(o, "y", "x")).toBeNull();
    expect(findTransition({}, "x", "y")).toBeNull();
  });
});
