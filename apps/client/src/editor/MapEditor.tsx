import { useEffect, useRef, useState } from "react";
import { useWindowKey } from "../ui/hooks";
import {
  LOOKS,
  SPRITES,
  resolveLook,
  SPRITE_NAMES,
  TILE_NAMES,
} from "../game/art";
import type { Location as LocationT } from "../../../../shared/case";
import { editor, editorStore, useEditor } from "./state";
import { ObjectFields } from "./SchemaForm";
import { ask } from "../ui/dialog";
import { MapPalette } from "./map/Palette";
import { renderMap } from "./map/render";
import { addLocation, normRect, pickTopmost, resize, selectionBox } from "./map/helpers";
import { T, doorCanvas, doorTiles, lookCanvas, useSpriteCanvases } from "./map/canvases";
import { LIST_KEY, type Selection, type Tool } from "./map/types";
import { ObjectList } from "./map/ObjectList";
import { LOCATION_SCHEMA, SelectedPanel, SizeInput } from "./map/panels";
import { Tabs } from "./Tabs";
import { useUrlParam, useWriteDefaultParam } from "./url";



/** Выбранный объект из адреса (`object:obj_desk`, `start`); если такого на локации нет — ничего не выбрано. */
function parseSelection(loc: LocationT | undefined, key: string): Selection {
  if (!loc || !key) return null;
  if (key === "start") return { kind: "start" };
  const [kind, ...rest] = key.split(":");
  const id = rest.join(":");
  const list = { object: loc.objects, npc: loc.npcs, exit: loc.exits, door: loc.doors }[kind as "object" | "npc" | "exit" | "door"];
  return list?.some((x) => x.id === id) ? ({ kind, id } as Selection) : null;
}

export function MapEditor() {
  const draft = useEditor((s) => s.draft);
  // выбранная локация, объект и вкладка инспектора — в адресе (`?item=…&obj=…&tab=list`)
  const [locKey, setLocKey] = useUrlParam("item", "");
  const found = draft.locations.findIndex((l) => l.id === locKey);
  const locIndex = found >= 0 ? found : 0;
  useWriteDefaultParam("item", found >= 0, draft.locations[0]?.id);
  const setLocIndex = (i: number) => setLocKey(editorStore.get().draft.locations[i]?.id ?? "");
  const loc = draft.locations[Math.min(locIndex, draft.locations.length - 1)];
  const li = draft.locations.indexOf(loc);
  const [tool, setTool] = useState<Tool>({ kind: "select" });
  const [objKey, setObjKey] = useUrlParam("obj", "");
  const sel = parseSelection(loc, objKey);
  const setSel = (s: Selection) => setObjKey(s === null ? "" : s.kind === "start" ? "start" : `${s.kind}:${s.id}`);
  const [insp, setInsp] = useUrlParam<"props" | "list">("tab", "props", ["props", "list"]);
  const [npcCharacter, setNpcCharacter] = useState(draft.characters[0]?.id ?? "");
  const [hover, setHover] = useState<{ x: number; y: number; px: number; py: number } | null>(null);
  const [zoom, setZoom] = useState<number | "fit">("fit");
  const [brush, setBrush] = useState<"pen" | "rect">("pen");
  const [lastTile, setLastTile] = useState(",");
  const [rect, setRect] = useState<{ from: { x: number; y: number }; to: { x: number; y: number } } | null>(null);
  // переход к объекту с ошибкой
  const focus = useEditor((s) => s.focus);
  useEffect(() => {
    if (focus?.section !== "locations") return;
    const i = draft.locations.findIndex((l) => l.id === focus.sub);
    if (i >= 0) setLocIndex(i);
    if (focus.kind && focus.id) setSel({ kind: focus.kind, id: focus.id } as Selection);
  }, [focus]); // eslint-disable-line react-hooks/exhaustive-deps
  const canvas = useRef<HTMLCanvasElement>(null);
  const art = useSpriteCanvases();
  const stroke = useRef<{ id: number; drag?: { dx: number; dy: number } } | null>(null);

  const updateLoc = (fn: (l: LocationT) => LocationT, merge?: string) =>
    editor.update((d) => ({ ...d, locations: d.locations.map((l, i) => (i === li ? fn(l) : l)) }), merge);

  // ---------- рисование ----------
  useEffect(() => {
    const cv = canvas.current;
    if (!cv || !loc) return;
    renderMap(cv, { loc, art, characters: draft.characters, tool, npcCharacter, hover, rect, selected: selectionBox(loc, sel) });
  });

  // ---------- мышь ----------
  const tileAt = (e: React.MouseEvent) => {
    const r = canvas.current!.getBoundingClientRect();
    const w = loc.tiles[0].length;
    const h = loc.tiles.length;
    const px = Math.max(0, Math.min(w * T - 1, ((e.clientX - r.left) / r.width) * w * T));
    const py = Math.max(0, Math.min(h * T - 1, ((e.clientY - r.top) / r.height) * h * T));
    // клетка и точка внутри карты (в базовых пикселях) — по точке находим верхний предмет
    return { x: Math.floor(px / T), y: Math.floor(py / T), px, py };
  };

  /** Есть ли пиксель картинки в точке (прозрачные углы спрайта не выделяются). */
  const opaqueAt = (s: NonNullable<Selection>, lx: number, ly: number) => {
    let c: HTMLCanvasElement | undefined;
    if (s.kind === "object") c = art.sprites.get(loc.objects.find((o) => o.id === s.id)?.sprite ?? "");
    if (s.kind === "npc") {
      const n = loc.npcs.find((x) => x.id === s.id);
      const ch = n && draft.characters.find((x) => x.id === n.characterId);
      c = lookCanvas(ch ? resolveLook(ch) : LOOKS.casual_m);
    }
    if (s.kind === "door") {
      const d = loc.doors.find((x) => x.id === s.id);
      if (d) c = doorCanvas(d.orientation, !!d.requires);
    }
    const data = c?.getContext("2d")?.getImageData(Math.floor(lx), Math.floor(ly), 1, 1).data;
    return !data || data[3] > 16;
  };

  const hit = (t: { x: number; y: number; px?: number; py?: number }): Selection => {
    const exit = loc.exits.find((x) => x.x === t.x && x.y === t.y);
    if (exit) return { kind: "exit", id: exit.id };
    if (loc.playerStart.x === t.x && loc.playerStart.y === t.y) return { kind: "start" };
    // верхний из нарисованных предметов, людей и дверей под курсором — целиком, а не по клетке под ногами
    const top = t.px === undefined || t.py === undefined ? null : pickTopmost(loc, t.px, t.py, opaqueAt);
    if (top) return top;
    // запасной путь: клетка, которую занимает предмет или дверь
    const npc = loc.npcs.find((n) => n.x === t.x && n.y === t.y);
    if (npc) return { kind: "npc", id: npc.id };
    const door = loc.doors.find((d) => doorTiles(d).some((p) => p.x === t.x && p.y === t.y));
    if (door) return { kind: "door", id: door.id };
    const obj = [...loc.objects].reverse().find((o) => t.y === o.y && t.x >= o.x && t.x < o.x + SPRITES[o.sprite].footprint);
    return obj ? { kind: "object", id: obj.id } : null;
  };

  const paint = (t: { x: number; y: number }, ch: string, id: number) =>
    updateLoc(
      (l) => ({
        ...l,
        tiles: l.tiles.map((row, y) => (y === t.y && row[t.x] !== ch ? row.slice(0, t.x) + ch + row.slice(t.x + 1) : row)),
      }),
      `paint:${id}`,
    );

  const uniqueId = (prefix: string, taken: string[]) => {
    for (let i = 1; ; i++) if (!taken.includes(`${prefix}${i}`)) return `${prefix}${i}`;
  };
  const allIds = () => draft.locations.flatMap((l) => [...l.objects.map((o) => o.id), ...l.npcs.map((n) => n.id)]);

  const onDown = (e: React.MouseEvent) => {
    const t = tileAt(e);
    const id = Date.now();
    stroke.current = { id };
    switch (tool.kind) {
      case "tile":
        if (brush === "rect" || e.shiftKey) setRect({ from: t, to: t });
        else paint(t, tool.ch, id);
        break;
      case "object": {
        const oid = uniqueId(`obj_${tool.sprite}_`, allIds());
        updateLoc((l) => ({ ...l, objects: [...l.objects, { id: oid, sprite: tool.sprite, x: t.x, y: t.y, label: "", interaction: null }] }));
        setSel({ kind: "object", id: oid });
        setTool({ kind: "select" });
        break;
      }
      case "npc": {
        const ch = draft.characters.find((c) => c.id === npcCharacter);
        if (!ch) return;
        const nid = uniqueId(`npc_${ch.id}_`, allIds());
        const dialogueId = draft.dialogues.find((d) => d.characterId === ch.id)?.id ?? "";
        updateLoc((l) => ({ ...l, npcs: [...l.npcs, { id: nid, characterId: ch.id, dialogueId, x: t.x, y: t.y }] }));
        setSel({ kind: "npc", id: nid });
        setTool({ kind: "select" });
        break;
      }
      case "start":
        updateLoc((l) => ({ ...l, playerStart: t }));
        setTool({ kind: "select" });
        break;
      case "exit": {
        const xid = uniqueId("exit_", loc.exits.map((x) => x.id));
        const target = draft.locations.find((l) => l.id !== loc.id) ?? loc;
        updateLoc((l) => ({ ...l, exits: [...l.exits, { id: xid, x: t.x, y: t.y, to: target.id, spawn: target.playerStart, label: `→ ${target.name}` }] }));
        setSel({ kind: "exit", id: xid });
        setTool({ kind: "select" });
        break;
      }
      case "door": {
        const did = uniqueId("door_", draft.locations.flatMap((l) => l.doors.map((d) => d.id)));
        updateLoc((l) => ({ ...l, doors: [...l.doors, { id: did, x: t.x, y: t.y, orientation: tool.orientation }] }));
        setSel({ kind: "door", id: did });
        setTool({ kind: "select" });
        break;
      }
      case "select": {
        const h = hit(t);
        setSel(h);
        if (h) {
          const pos = posOf(h);
          if (pos) stroke.current.drag = { dx: t.x - pos.x, dy: t.y - pos.y };
        }
        break;
      }
    }
  };

  const posOf = (s: Selection) => {
    if (!s) return null;
    if (s.kind === "start") return loc.playerStart;
    const list = loc[LIST_KEY[s.kind]] as { id: string; x: number; y: number }[];
    return list.find((x) => x.id === s.id) ?? null;
  };

  const onMove = (e: React.MouseEvent) => {
    const t = tileAt(e);
    if (!hover || hover.px !== t.px || hover.py !== t.py) setHover(t);
    if (!stroke.current || !(e.buttons & 1)) return;
    if (tool.kind === "tile") {
      if (rect) return setRect({ ...rect, to: t });
      return paint(t, tool.ch, stroke.current.id);
    }
    const drag = stroke.current.drag;
    if (tool.kind !== "select" || !sel || !drag) return;
    const x = t.x - drag.dx;
    const y = t.y - drag.dy;
    const pos = posOf(sel);
    if (!pos || (pos.x === x && pos.y === y)) return;
    const merge = `move:${stroke.current.id}`;
    if (sel.kind === "start") return updateLoc((l) => ({ ...l, playerStart: { x, y } }), merge);
    const key = LIST_KEY[sel.kind];
    updateLoc((l) => ({ ...l, [key]: (l[key] as { id: string }[]).map((it) => (it.id === sel.id ? { ...it, x, y } : it)) }), merge);
  };

  const onUp = () => {
    if (rect && tool.kind === "tile") {
      const r = normRect(rect);
      const ch = tool.ch;
      updateLoc((l) => ({
        ...l,
        tiles: l.tiles.map((row, y) =>
          y < r.y || y >= r.y + r.h ? row : row.slice(0, r.x) + ch.repeat(Math.min(r.w, row.length - r.x)) + row.slice(r.x + r.w),
        ),
      }));
    }
    setRect(null);
    stroke.current = null;
  };

  const pickTile = (ch: string) => {
    setTool({ kind: "tile", ch });
    setLastTile(ch);
  };

  const deleteSelected = () => {
    if (!sel || sel.kind === "start") return;
    const key = LIST_KEY[sel.kind];
    updateLoc((l) => ({ ...l, [key]: (l[key] as { id: string }[]).filter((it) => it.id !== sel.id) }));
    setSel(null);
  };

  useWindowKey((e) => {
    if (e.target instanceof HTMLElement && e.target.closest("input, textarea, select")) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === "Delete" || e.key === "Backspace") deleteSelected();
    if (e.key === "Escape") {
      setSel(null);
      setRect(null);
      setTool({ kind: "select" });
    }
    if (e.code === "KeyV") setTool({ kind: "select" });
    if (e.code === "KeyB") {
      setBrush("pen");
      pickTile(tool.kind === "tile" ? tool.ch : lastTile);
    }
    if (e.code === "KeyR") {
      setBrush("rect");
      pickTile(tool.kind === "tile" ? tool.ch : lastTile);
    }
  });

  if (!loc) return <p>Нет локаций.</p>;
  const w = loc.tiles[0].length;
  const h = loc.tiles.length;
  const hoverInfo = (() => {
    if (!hover) return "";
    const h = hit(hover);
    if (!h) return "";
    if (h.kind === "start") return "Старт игрока";
    if (h.kind === "npc") {
      const n = loc.npcs.find((x) => x.id === h.id)!;
      const ch = draft.characters.find((c) => c.id === n.characterId);
      return `${ch?.name ?? n.characterId} · диалог «${n.dialogueId}»`;
    }
    if (h.kind === "door") {
      const d = loc.doors.find((x) => x.id === h.id)!;
      return d.requires ? `Дверь · заперта, пока не выполнено условие` : "Дверь · открывается, когда игрок подходит";
    }
    if (h.kind === "exit") {
      const e = loc.exits.find((x) => x.id === h.id)!;
      return `Выход → ${draft.locations.find((l) => l.id === e.to)?.name ?? e.to}`;
    }
    const o = loc.objects.find((x) => x.id === h.id)!;
    const name = o.label || SPRITE_NAMES[o.sprite] || o.sprite;
    if (!o.interaction) return `${name} · декорация`;
    const evId = o.interaction.evidenceId;
    return `${name} → материал «${draft.evidence.find((e) => e.id === evId)?.title ?? evId}»`;
  })();

  const toolHint =
    tool.kind === "select"
      ? ""
      : tool.kind === "tile"
        ? `${brush === "rect" ? "Прямоугольник" : "Кисть"} «${TILE_NAMES[tool.ch]}»: ${brush === "rect" ? "растяните область" : "ведите с зажатой кнопкой (Shift — прямоугольником)"}`
        : tool.kind === "object"
          ? `Предмет «${SPRITE_NAMES[tool.sprite] ?? tool.sprite}»: кликните, куда поставить`
          : tool.kind === "npc"
            ? `Человек «${draft.characters.find((c) => c.id === npcCharacter)?.name ?? ""}»: кликните, куда поставить`
            : tool.kind === "start"
              ? "Старт игрока: кликните по клетке пола"
              : tool.kind === "door"
                ? `Дверь ${tool.orientation === "h" ? "в горизонтальной стене (2 клетки вправо)" : "в вертикальной стене (2 клетки вниз)"}: кликните по первой клетке проёма`
                : "Выход: кликните по проёму на краю карты";

  return (
    <section className="lm">
      <Tabs
        variant="bar"
        className="lm__tabs"
        active={String(li)}
        onChange={(id) => {
          setLocIndex(Number(id));
          setSel(null);
        }}
        tabs={draft.locations.map((l, i) => ({
          id: String(i),
          label: (
            <>
              {i === 0 && <span title="Стартовая локация">★ </span>}
              {l.name}
            </>
          ),
        }))}
        trailing={
          <button className="tab tab--add" onClick={() => addLocation(draft, setLocIndex)} title="Новая локация">
            + локация
          </button>
        }
      />

      <MapPalette
        draft={draft}
        tool={tool}
        setTool={setTool}
        brush={brush}
        setBrush={setBrush}
        lastTile={lastTile}
        pickTile={pickTile}
        npcCharacter={npcCharacter}
        setNpcCharacter={setNpcCharacter}
      />

      {/* ---------- карта ---------- */}
      <div className="lm__center">
        <div
          className="lm__stage"
          onWheel={(e) => {
            if (!e.ctrlKey) return;
            e.preventDefault();
            const cur = zoom === "fit" ? 2 : zoom;
            setZoom(Math.max(1, Math.min(6, cur + (e.deltaY < 0 ? 1 : -1))));
          }}
        >
          <canvas
            ref={canvas}
            className={`lm__canvas tool--${tool.kind} ${zoom === "fit" ? "is-fit" : ""}`}
            style={zoom === "fit" ? { aspectRatio: `${w} / ${h}` } : { width: w * T * zoom, height: h * T * zoom }}
            onMouseDown={onDown}
            onMouseMove={onMove}
            onMouseUp={onUp}
            onMouseLeave={() => {
              setHover(null);
              onUp();
            }}
          />
        </div>
        <div className="lm__status">
          <span className="lm__coords">{hover ? `${hover.x}, ${hover.y}` : `${w}×${h} клеток`}</span>
          <span className="lm__hint">{hoverInfo || toolHint}</span>
          <span className="lm__zoom">
            {(["fit", 2, 3, 4] as const).map((z) => (
              <button key={z} aria-pressed={zoom === z} onClick={() => setZoom(z)}>
                {z === "fit" ? "вписать" : `×${z}`}
              </button>
            ))}
          </span>
        </div>
      </div>

      {/* ---------- инспектор ---------- */}
      <aside className="lm__inspector">
        <Tabs
          className="lm__itabs"
          active={insp}
          onChange={setInsp}
          tabs={[
            { id: "props", label: "Свойства" },
            { id: "list", label: `Объекты (${loc.objects.length + loc.npcs.length + loc.exits.length + loc.doors.length})` },
          ]}
        />
        <div className="lm__inspector-body">
          {insp === "list" ? (
            <ObjectList
              loc={loc}
              draft={draft}
              sel={sel}
              onPick={(s) => {
                setSel(s);
                setInsp("props");
              }}
            />
          ) : sel ? (
            <SelectedPanel loc={loc} sel={sel} updateLoc={updateLoc} onDelete={deleteSelected} draft={draft} onClose={() => setSel(null)} />
          ) : (
            <>
              <h3>Локация</h3>
              <ObjectFields
                schema={LOCATION_SCHEMA}
                value={loc}
                ctx={{ draft }}
                only={["id", "name"]}
                onChange={(v) => updateLoc(() => v as LocationT, `loc:${li}`)}
              />
              <div className="lm__size">
                <span className="ef__label">Размер карты</span>
                <div>
                  <SizeInput label="ширина" value={w} onChange={(v) => updateLoc((l) => resize(l, v, h))} />
                  <SizeInput label="высота" value={h} onChange={(v) => updateLoc((l) => resize(l, w, v))} />
                </div>
              </div>
              <ObjectFields
                schema={LOCATION_SCHEMA}
                value={loc}
                ctx={{ draft }}
                only={["areas"]}
                onChange={(v) => updateLoc(() => v as LocationT, `loc:${li}`)}
              />
              <div className="lm__stats">
                <span>Предметов: {loc.objects.length}</span>
                <span>Людей: {loc.npcs.length}</span>
                <span>Выходов: {loc.exits.length}</span>
                <span>Дверей: {loc.doors.length}</span>
              </div>
              {draft.locations.length > 1 && (
                <button
                  className="btn btn--sm btn--danger"
                  onClick={async () => {
                    if (!(await ask({ title: `Удалить локацию «${loc.name}»?`, text: "Удалятся все предметы, люди, выходы и двери в ней.", confirmLabel: "Удалить", danger: true }))) return;
                    editor.update((d) => ({ ...d, locations: d.locations.filter((_, i) => i !== li) }));
                    setLocIndex(0);
                  }}
                >
                  Удалить локацию
                </button>
              )}
              <p className="lm__note">Первая локация — стартовая. Кликните по предмету, человеку или выходу, чтобы изменить его.</p>
            </>
          )}
        </div>
      </aside>
    </section>
  );
}
