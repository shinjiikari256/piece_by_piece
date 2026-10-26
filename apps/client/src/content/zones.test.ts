import { describe, expect, it } from "vitest";
import type { CaseFile } from "../../../../shared/case";
import case001 from "./cases/case-001.json";
import { validateCase } from "./validate";

describe("области и их действия: формат и валидатор", () => {
  const base = () => structuredClone(case001) as unknown as CaseFile;
  const errorsOf = (c: CaseFile) => {
    const r = validateCase(c);
    return r.ok ? "" : r.errors.join("\n");
  };
  const zone = (id: string, over: Partial<CaseFile["locations"][0]["zones"][0]> = {}) => ({
    id,
    name: "Холл",
    cells: [
      { x: 15, y: 13 },
      { x: 16, y: 13 },
    ],
    actions: [],
    ...over,
  });

  it("дело без областей проходит (области по умолчанию пустые)", () => {
    expect(errorsOf(base())).toEqual("");
    expect(base().locations.every((l) => l.zones.length === 0)).toBe(true);
  });

  it("область с действиями «диалог» и «предмет» — без ошибок", () => {
    const c = base();
    const obj = c.locations[0].objects.find((o) => o.interaction)!;
    c.locations[0].zones = [
      zone("zone_hall", {
        actions: [
          { kind: "dialogue", dialogueId: c.dialogues[0].id, trigger: "enter" },
          { kind: "object", objectId: obj.id, requires: { flags: [] } },
        ],
      }),
    ];
    expect(errorsOf(c)).toEqual("");
  });

  it("ошибки: пустая область, клетка вне карты, повтор id, неизвестный диалог и предмет, предмет-декорация", () => {
    const c = base();
    const decoration = c.locations[0].objects.find((o) => !o.interaction)!;
    c.locations[0].zones = [
      zone("z", { cells: [] }),
      zone("z", {
        cells: [{ x: 999, y: 0 }],
        actions: [
          { kind: "dialogue", dialogueId: "нет_такого" },
          { kind: "object", objectId: decoration.id },
          { kind: "object", objectId: "нет_предмета" },
        ],
      }),
    ];
    const text = errorsOf(c);
    expect(text).toContain("область пуста");
    expect(text).toContain("вне карты");
    expect(text).toContain("повторяющийся id «z»");
    expect(text).toContain("неизвестная ссылка «нет_такого»");
    expect(text).toContain("это декорация");
    expect(text).toContain("неизвестная ссылка «нет_предмета»");
  });

  it("цвет области — только вида #rrggbb", () => {
    const c = base();
    c.locations[0].zones = [zone("zc", { color: "#3f9e5a" })];
    expect(errorsOf(c)).toEqual("");
    c.locations[0].zones = [zone("zc", { color: "зелёный" })];
    expect(errorsOf(c)).toContain("нужен вид #rrggbb");
  });

  it("выход: неизвестная локация, spawn не на полу и в области с автоматическим выходом", () => {
    const c = base();
    const floorCell = c.locations[0].playerStart!;
    c.locations[0].zones = [
      zone("exit_a", { actions: [{ kind: "exit", to: "нет_такой", spawn: floorCell }] }),
      zone("exit_b", { actions: [{ kind: "exit", to: c.locations[0].id, spawn: { x: 0, y: 0 } }] }), // 0,0 — стена
      zone("exit_c", { cells: [floorCell], actions: [{ kind: "exit", to: c.locations[0].id, spawn: floorCell, trigger: "enter" }] }), // spawn сразу в области с автовыходом
    ];
    const text = errorsOf(c);
    expect(text).toContain("неизвестная ссылка «нет_такой»");
    expect(text).toContain("spawn не на полу");
    expect(text).toContain("сразу выкинет обратно");
  });
});
