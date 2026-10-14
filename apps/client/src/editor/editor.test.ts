import { describe, expect, it } from "vitest";
import { validateCase } from "../content/validate";
import { blankCase } from "./template";
import { editor, editorStore, getIn, setIn } from "./state";

describe("конструктор", () => {
  it("шаблон нового дела сразу проходит валидацию", () => {
    const r = validateCase(blankCase());
    expect(r.ok ? [] : r.errors).toEqual([]);
  });

  it("setIn не мутирует исходник и удаляет ключ по undefined", () => {
    const src = { a: { b: [1, 2, 3] }, c: 1 };
    const next = setIn(src, ["a", "b", 1], 9);
    expect(next.a.b).toEqual([1, 9, 3]);
    expect(src.a.b).toEqual([1, 2, 3]);
    expect(getIn(next, ["a", "b", 2])).toBe(3);
    expect(setIn(src, ["c"], undefined)).toEqual({ a: { b: [1, 2, 3] } });
  });

  it("отмена и повтор; правки одного поля подряд — один шаг истории", () => {
    editor.load(blankCase());
    const before = editorStore.get().draft.title;
    editor.update((d) => ({ ...d, title: "А" }), "title");
    editor.update((d) => ({ ...d, title: "Ак" }), "title");
    editor.update((d) => ({ ...d, title: "Акт" }), "title");
    expect(editorStore.get().draft.title).toBe("Акт");
    editor.undo();
    expect(editorStore.get().draft.title).toBe(before);
    editor.redo();
    expect(editorStore.get().draft.title).toBe("Акт");
  });

  it("черновик не записался в хранилище — конструктор это показывает", () => {
    const real = globalThis.localStorage;
    Object.assign(globalThis, {
      localStorage: {
        ...real,
        getItem: () => null,
        setItem: () => {
          throw new DOMException("quota", "QuotaExceededError");
        },
      },
    });
    try {
      editor.update((c) => ({ ...c, title: c.title + "!" }));
      expect(editorStore.get().storageFailed).toBe(true);
    } finally {
      Object.assign(globalThis, { localStorage: real });
    }
  });
});
