import { useState } from "react";
import type { CustomSprite } from "../../../../../shared/case";
import { SPRITES } from "../../game/art";
import { ask, tell } from "../../ui/dialog";
import { Icon } from "../../ui/icons";
import { ArtThumb } from "../Pickers";
import { PaletteGroup } from "../map/panels";
import { Tabs } from "../Tabs";
import { editor, editorStore, useEditor } from "../state";
import { useUrlParam } from "../url";
import { isBuiltin, copyOf, spriteGroups, spriteView } from "./catalog";
import { SpriteCanvas, SpriteToolbar, TOOLS, type Tool } from "./SpriteCanvas";
import { DrawPanel, FootBar, PropsPanel } from "./SpritePanels";
import { PartsSection } from "./PartsSection";
import { TilesSection } from "./TilesSection";
import { SpriteAnims, SpriteParams, SpriteStates } from "./SpriteStates";
import { frameLabel, moveFrame, newSprite, patchSprite, spriteUses, uniqueKey } from "./helpers";

type Tab = "draw" | "props" | "vars" | "states" | "anims";
const TABS: { id: Tab; label: string; own: boolean }[] = [
  { id: "draw", label: "Рисунок", own: false },
  { id: "props", label: "Свойства", own: false },
  { id: "vars", label: "Переменные", own: true },
  { id: "states", label: "Состояния", own: true },
  { id: "anims", label: "Анимации", own: true },
];

/** Раздел «Спрайты»: слева все спрайты (встроенные и свои), в центре рисунок, справа свойства. Компоновка — как в «Локациях». */
function SpriteEditor() {
  const draft = useEditor((s) => s.draft);
  const [selected, setSelected] = useUrlParam("item", "");
  const [tabParam, setTab] = useUrlParam("tab", "draw");
  const [frame, setFrame] = useState("default");
  const [tool, setTool] = useState<Tool>("pencil");
  const [color, setColor] = useState("#7a5230");
  const [alpha, setAlpha] = useState(255);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<Record<string, boolean>>({});

  const groups = spriteGroups(draft);
  const first = draft.sprites?.[0]?.key ?? groups[0]?.keys[0] ?? "";
  const key = spriteView(draft, selected) ? selected : first;
  const sprite = spriteView(draft, key);
  const builtin = isBuiltin(key);
  const tabs = TABS.filter((t) => !builtin || !t.own);
  const tab = tabs.find((t) => t.id === tabParam)?.id ?? tabs[0].id;
  const current = sprite?.frames[frame] ? frame : "default";

  const choose = (k: string) => {
    setSelected(k);
    setFrame("default");
  };
  const add = () => {
    const s = newSprite(editorStore.get().draft, (k) => k in SPRITES);
    editor.update((d) => ({ ...d, sprites: [...(d.sprites ?? []), s] }));
    choose(s.key);
    setTab("draw");
  };
  const copy = (src: CustomSprite) => {
    const c = copyOf(editorStore.get().draft, src);
    editor.update((d) => ({ ...d, sprites: [...(d.sprites ?? []), c] }));
    choose(c.key);
  };
  const remove = async (s: CustomSprite) => {
    const uses = spriteUses(draft, s.key);
    if (uses.length) return tell({ title: "Спрайт используется", text: `«${s.name}» стоит на картах: ${uses.join(", ")}. Сначала замените его у этих предметов.` });
    if (!(await ask({ title: `Удалить спрайт «${s.name}»?`, text: "Рисунок и состояния пропадут.", confirmLabel: "Удалить", danger: true }))) return;
    editor.update((d) => ({ ...d, sprites: d.sprites?.filter((x) => x.key !== s.key) }));
  };
  const addFrame = () => {
    if (!sprite || builtin) return;
    const name = uniqueKey(`Кадр ${Object.keys(sprite.frames).length}`, (k) => k in sprite.frames);
    editor.update((d) => ({ ...d, sprites: d.sprites?.map((s) => (s.key === sprite.key ? { ...s, frames: { ...s.frames, [name]: [...(s.frames[current] ?? [])] } } : s)) }));
    setFrame(name);
    setTab("draw");
  };

  const q = query.trim().toLowerCase();
  const nameOf = (k: string) => spriteView(draft, k)?.name ?? k;

  return (
    <section className="lm" style={{ ["--col-right" as string]: "26rem" }}>
      <aside className="lm__palette">
        <button className="btn btn--primary" onClick={add}>
          <Icon name="plus" size={15} /> Новый спрайт
        </button>
        <input className="lm__search" placeholder="Поиск спрайта…" value={query} onChange={(e) => setQuery(e.target.value)} />
        {groups.map((g) => {
          const keys = g.keys.filter((k) => !q || nameOf(k).toLowerCase().includes(q) || k.includes(q));
          if (!keys.length) return null;
          return (
            <PaletteGroup
              key={g.id}
              title={g.label}
              count={keys.length}
              open={!!q || (open[g.id] ?? (g.id.startsWith("custom:") || keys.includes(key)))}
              onToggle={() => setOpen((o) => ({ ...o, [g.id]: !(o[g.id] ?? (g.id.startsWith("custom:") || keys.includes(key))) }))}
            >
              <div className="sprite-list">
                {keys.map((k) => {
                  const own = draft.sprites?.find((x) => x.key === k);
                  return (
                    <div key={k} className="sprite-row" aria-current={k === key || undefined}>
                      <button className="sprite-row__main" title={nameOf(k)} onClick={() => choose(k)}>
                        <span className="sprite-row__art">
                          <ArtThumb kind="sprite" id={k} scale={1} />
                        </span>
                        <span className="sprite-row__name ellipsis">{nameOf(k)}</span>
                      </button>
                      <button className="btn btn--icon btn--sm" title="Копировать: своя копия, которую можно править" aria-label="Копировать" onClick={() => copy(spriteView(draft, k)!)}>
                        <Icon name="copy" size={14} />
                      </button>
                      {own ? (
                        <button className="btn btn--icon btn--sm btn--danger" title="Удалить спрайт" aria-label="Удалить" onClick={() => remove(own)}>
                          <Icon name="trash" size={14} />
                        </button>
                      ) : (
                        <span className="sprite-row__lock" title="Встроенный спрайт: менять и удалять нельзя, можно копировать">
                          <Icon name="lock" size={14} />
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </PaletteGroup>
          );
        })}
      </aside>

      <div className="lm__main">
        {sprite ? (
          <>
            <Tabs
              variant="bar"
              className="lm__tabs"
              tabs={Object.keys(sprite.frames).map((f) => ({ id: f, label: frameLabel(f) }))}
              active={current}
              onChange={setFrame}
              onReorder={builtin ? undefined : (from, to) => editor.update((d) => patchSprite(d, sprite.key, { frames: moveFrame(sprite.frames, from, to) }))}
              trailing={
                !builtin && (
                  <button className="tab tab--add" onClick={addFrame} title="Новый кадр — копия текущего">
                    <Icon name="plus" size={14} />
                  </button>
                )
              }
            />
            <div className="lm__center">
              <div className="lm__stage">
                <SpriteCanvas sprite={sprite} frame={current} tool={tool} color={color} alpha={alpha} readOnly={builtin} foot={tool === "foot"} onPickColor={(c, a) => (setColor(c), setAlpha(a))} />
              </div>
              <div className="lm__status">
                {tool === "foot" ? (
                  <FootBar sprite={sprite} readOnly={builtin} />
                ) : (
                  <span className="lm__hint">
                    {builtin ? "Встроенный спрайт нельзя изменить — сделайте копию и правьте её" : (TOOLS.find((t) => t.id === tool)?.hint ?? "")}
                    <span className="sprite-status__size">
                      {sprite.w}×{sprite.h} пикс. · клетка поля 16×16
                    </span>
                  </span>
                )}
              </div>
            </div>
          </>
        ) : (
          <p className="muted">Выберите спрайт слева.</p>
        )}
      </div>

      <aside className="lm__inspector">
        {sprite && (
          <>
            <Tabs className="lm__itabs" tabs={tabs.map(({ id, label }) => ({ id, label }))} active={tab} onChange={setTab} />
            <div className="lm__inspector-body">
              <div className="sprite-head">
                <span className="sprite-head__title ellipsis">
                  {builtin && <Icon name="lock" size={14} />} {sprite.name || "Без названия"}
                </span>
              </div>
              {builtin && <p className="muted">Встроенный спрайт: смотреть можно, менять и удалять нельзя. Сделайте копию, чтобы править.</p>}
              {tab === "draw" && (
                <>
                  <h3>Инструмент</h3>
                  <SpriteToolbar sprite={sprite} frame={current} tool={tool} setTool={setTool} readOnly={builtin} />
                </>
              )}
              <fieldset className="sprite-ro" disabled={builtin}>
                {tab === "draw" && <DrawPanel sprite={sprite} frame={current} color={color} alpha={alpha} setColor={(c, a) => (setColor(c), setAlpha(a))} onFrame={setFrame} />}
                {tab === "props" && <PropsPanel sprite={sprite} />}
                {tab === "vars" && <SpriteParams sprite={sprite} />}
                {tab === "states" && <SpriteStates sprite={sprite} />}
                {tab === "anims" && <SpriteAnims sprite={sprite} />}
              </fieldset>
            </div>
          </>
        )}
      </aside>
    </section>
  );
}

const KINDS = [
  { id: "sprites", label: "Предметы" },
  { id: "parts", label: "Части персонажей" },
  { id: "tiles", label: "Тайлы" },
] as const;

/** Раздел «Спрайты»: предметы, части персонажей и тайлы — три страницы с одним переключателем. */
export function SpritesSection() {
  const focus = useEditor((s) => s.focus);
  const [kind, setKind] = useUrlParam<"sprites" | "parts" | "tiles">("kind", focus?.sub === "parts" ? "parts" : focus?.sub === "tiles" ? "tiles" : "sprites", ["sprites", "parts", "tiles"]);
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      <Tabs variant="bar" tabs={KINDS.map((k) => ({ id: k.id, label: k.label }))} active={kind} onChange={setKind} />
      <div style={{ flex: 1, minHeight: 0 }}>{kind === "parts" ? <PartsSection /> : kind === "tiles" ? <TilesSection /> : <SpriteEditor />}</div>
    </div>
  );
}
