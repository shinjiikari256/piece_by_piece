import { useEffect, useRef, useState } from "react";
import { useWindowKey } from "../ui/hooks";
import { type Location as LocationT } from "../../../../shared/case";
import { editor, editorStore, useEditor } from "./state";
import { ObjectFields } from "./SchemaForm";
import { ask } from "../ui/dialog";
import { MapPalette } from "./map/Palette";
import { renderMap } from "./map/render";
import { addLocation, resize, selectionBox } from "./map/helpers";
import { T, useSpriteCanvases } from "./map/canvases";
import { LIST_KEY, type Selection, type Tool } from "./map/types";
import { ObjectList } from "./map/ObjectList";
import { LOCATION_SCHEMA, SelectedPanel, SizeInput } from "./map/panels";
import { Tabs } from "./Tabs";
import { moveItem } from "../util/lists";
import { useMapDock } from "./layout";
import { useMapPointer } from "./map/useMapPointer";
import { describeHit, toolHint } from "./map/describe";
import { hitTest, opaqueAt, parseSelection } from "./map/hit-test";
import { PanelGrip, PanelRail, panelVars, usePanel } from "./panels";
import { useUrlParam, useWriteDefaultParam } from "./url";
import { useFocusJump } from "./useFocusJump";
import { GAME_ZOOM_MAX } from "../game/bridge";
import { stepZoom, ZoomControl } from "../ui/zoom-control";

/** Нижняя граница масштаба карты: можно отдалить сильнее 100%, чтобы увидеть большую карту целиком. */
const MIN_ZOOM = 0.3;



export function MapEditor() {
  const palettePanel = usePanel("map-palette", "Палитра", "left", { width: 272, min: 180, max: 520 });
  const paletteDock = usePanel("map-palette-bottom", "Палитра", "bottom", { width: 260, min: 140, max: 520 });
  // где стоит палитра — выбор в шапке конструктора (editor/layout.ts)
  const dock = useMapDock();
  const inspectorPanel = usePanel("map-inspector", "Инспектор", "right", { width: 336, min: 240, max: 640 });
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
  // масштаб — как в игре: шаги по 10% от 100% до верхней границы, отдельно «вписать» (вся карта в области)
  const [zoom, setZoom] = useState(1);
  const [fit, setFit] = useState(true);
  // на телефоне и планшете палитра и инспектор — поверх карты, по одной за раз
  const [phoneView, setPhoneView] = useState<"map" | "palette" | "inspector">("map");
  // «вписать»: фактический масштаб холста (его пиксели — клетки × T, холст — object-fit: contain, берём меньшую сторону)
  const [fitZoom, setFitZoom] = useState(1);
  const [rect, setRect] = useState<{ from: { x: number; y: number }; to: { x: number; y: number } } | null>(null);
  // переход к объекту с ошибкой
  useFocusJump((focus) => {
    if (focus.section !== "locations") return;
    const i = draft.locations.findIndex((l) => l.id === focus.sub);
    if (i >= 0) setLocIndex(i);
    if (focus.kind && focus.id) setSel({ kind: focus.kind, id: focus.id } as Selection);
  });
  const canvas = useRef<HTMLCanvasElement>(null);
  const art = useSpriteCanvases();

  const updateLoc = (fn: (l: LocationT) => LocationT, merge?: string) =>
    editor.update((d) => ({ ...d, locations: d.locations.map((l, i) => (i === li ? fn(l) : l)) }), merge);

  // ---------- рисование ----------
  useEffect(() => {
    const cv = canvas.current;
    if (!cv || !loc) return;
    renderMap(cv, { loc, art, characters: draft.characters, tool, npcCharacter, hover, rect, selected: sel?.kind === "zone" ? null : selectionBox(loc, sel), zoneSel: sel?.kind === "zone" ? sel.id : null });
  });
  useEffect(() => {
    const cv = canvas.current;
    if (!cv || !fit) return;
    const measure = () => {
      const r = cv.getBoundingClientRect();
      setFitZoom(Math.min(r.width / cv.width, r.height / cv.height));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(cv);
    return () => observer.disconnect();
  }, [fit, loc]);

  const opaque = (s: NonNullable<Selection>, lx: number, ly: number) => opaqueAt(loc, art, draft.characters, s, lx, ly);
  const hitAt = (t: { x: number; y: number; px?: number; py?: number }) => hitTest(loc, t, opaque);
  const { onDown, onMove, onUp } = useMapPointer({ canvas, draft, loc, li, tool, setTool, sel, setSel, npcCharacter, hover, setHover, rect, setRect, hitAt });

  const pickTile = (ch: string) => setTool({ kind: "tile", ch });

  const deleteSelected = async () => {
    if (!sel || sel.kind === "start") return;
    if (sel.kind === "zone") {
      const actions = loc.zones.find((z) => z.id === sel.id)?.actions.length ?? 0;
      if (actions && !(await ask({ title: "Удалить область?", text: `Область запускает действия (${actions}): они пропадут вместе с ней.`, confirmLabel: "Удалить", danger: true }))) return;
      updateLoc((l) => ({ ...l, zones: l.zones.filter((z) => z.id !== sel.id) }));
      setSel(null);
      return;
    }
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
  });

  if (!loc) return <p>Нет локаций.</p>;
  const w = loc.tiles[0].length;
  const h = loc.tiles.length;
  const current = fit ? fitZoom : zoom;
  const hoverInfo = hover ? describeHit(hitAt(hover), loc, draft) : "";
  const hint = toolHint(tool, sel, loc, draft, npcCharacter);

  return (
    <section className="lm" data-dock={dock} data-view={phoneView} style={dock === "left" ? panelVars(palettePanel, inspectorPanel) : panelVars(undefined, inspectorPanel, paletteDock)}>
      <div className="lm__phone-bar">
        <button className="btn btn--sm" onClick={() => setPhoneView("map")}>
          ← К карте
        </button>
        <span>{phoneView === "palette" ? "Инструменты" : "Свойства"}</span>
      </div>
      {(dock === "left" ? palettePanel : paletteDock).collapsed ? (
        <PanelRail panel={dock === "left" ? palettePanel : paletteDock} />
      ) : (
        <MapPalette
          draft={draft}
          tool={tool}
          setTool={setTool}
          pickTile={pickTile}
          npcCharacter={npcCharacter}
          setNpcCharacter={setNpcCharacter}
        />
      )}

      {/* ---------- карта: вкладки локаций только над ней; палитра и инспектор — равнозначные ей блоки ---------- */}
      <div className="lm__main">
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
        <div className="lm__center">
          <div
            className="lm__stage"
            onWheel={(e) => {
              if (!e.ctrlKey) return;
              e.preventDefault();
              setFit(false);
              setZoom(stepZoom(current, e.deltaY < 0 ? 1 : -1, 1, GAME_ZOOM_MAX));
            }}
          >
            <canvas
              ref={canvas}
              role="img"
              aria-label="Карта локации: рисуется мышью, свойства выбранного — в панели справа"
              className={`lm__canvas tool--${tool.kind} ${fit ? "is-fit" : ""}`}
              style={fit ? { aspectRatio: `${w} / ${h}` } : { width: w * T * zoom, height: h * T * zoom }}
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
            <div className="lm__phone-nav">
              <button className="btn btn--sm" onClick={() => setPhoneView("palette")}>
                Инструменты
              </button>
              <button className="btn btn--sm" onClick={() => setPhoneView("inspector")}>
                Свойства
              </button>
            </div>
            <span className="lm__hint">
              <span className="lm__coords">{hover ? `${hover.x}, ${hover.y}` : `${w}×${h} клеток`}</span>
              {hoverInfo || hint}
            </span>
            <ZoomControl
              label="Масштаб карты"
              value={current}
              min={MIN_ZOOM}
              max={GAME_ZOOM_MAX}
              fitted={fit}
              valueText={`${Math.round(current * 100)}%`}
              onStep={(dir) => {
                setFit(false);
                setZoom(stepZoom(current, dir, MIN_ZOOM, GAME_ZOOM_MAX));
              }}
              onFit={() => setFit(true)}
            />
          </div>
        </div>
      </div>

      {/* ---------- инспектор ---------- */}
      {inspectorPanel.collapsed ? (
        <PanelRail panel={inspectorPanel} />
      ) : (
        <aside className="lm__inspector">
          <Tabs
            className="lm__itabs"
            active={insp}
            onChange={setInsp}
            tabs={[
              { id: "props", label: "Свойства" },
              { id: "list", label: `Объекты (${loc.objects.length + loc.npcs.length + loc.zones.length})` },
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
              <SelectedPanel loc={loc} sel={sel} updateLoc={updateLoc} onDelete={deleteSelected} draft={draft} onClose={() => setSel(null)} tool={tool} setTool={setTool} onSelect={setSel} />
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
                <ObjectFields
                  schema={LOCATION_SCHEMA}
                  value={loc}
                  ctx={{ draft }}
                  only={["onEnter"]}
                  onChange={(v) => updateLoc(() => v as LocationT, `loc:${li}`)}
                />
                {draft.locations.length > 1 && (
                  <div className="row lm__order">
                    <button
                      className="btn btn--sm"
                      disabled={li === 0}
                      onClick={() => editor.update((d) => ({ ...d, locations: moveItem(d.locations, li, -1) ?? d.locations }))}
                      title="Сдвинуть локацию влево в списке вкладок"
                    >
                      ← Влево
                    </button>
                    <button
                      className="btn btn--sm"
                      disabled={li === draft.locations.length - 1}
                      onClick={() => editor.update((d) => ({ ...d, locations: moveItem(d.locations, li, 1) ?? d.locations }))}
                      title="Сдвинуть локацию вправо в списке вкладок"
                    >
                      Вправо →
                    </button>
                  </div>
                )}
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
                <p className="lm__note">Игра начинается в локации с клеткой старта ▶ (она одна на дело). Кликните по предмету, человеку или выходу, чтобы изменить его.</p>
              </>
            )}
          </div>
        </aside>
      )}
      <PanelGrip panel={dock === "left" ? palettePanel : paletteDock} />
      <PanelGrip panel={inspectorPanel} />
    </section>
  );
}
