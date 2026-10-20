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
import { SpriteCanvas, TOOLS, type Tool } from "./SpriteCanvas";
import { DrawPanel, FootPanel, PropsPanel } from "./SpritePanels";
import { SpriteAnims, SpriteParams, SpriteStates } from "./SpriteStates";
import { frameLabel, newSprite, spriteUses, uniqueKey } from "./helpers";

type Tab = "draw" | "props" | "foot" | "vars" | "states" | "anims";
const TABS: { id: Tab; label: string; own: boolean }[] = [
  { id: "draw", label: "Рисунок", own: true },
  { id: "props", label: "Свойства", own: false },
  { id: "foot", label: "Опора", own: false },
  { id: "vars", label: "Переменные", own: true },
  { id: "states", label: "Состояния", own: true },
  { id: "anims", label: "Анимации", own: true },
];

/** Раздел «Спрайты»: слева все спрайты (встроенные и свои), в центре рисунок, справа свойства. Компоновка — как в «Локациях». */
export function SpritesSection() {
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
            <PaletteGroup key={g.id} title={g.label} count={keys.length} open={!!q || (open[g.id] ?? (g.id.startsWith("custom:") || keys.includes(key)))} onToggle={() => setOpen((o) => ({ ...o, [g.id]: !(o[g.id] ?? (g.id.startsWith("custom:") || keys.includes(key))) }))}>
              <div className="lm__things">
                {keys.map((k) => (
                  <button key={k} className="lm__thing" aria-pressed={k === key} title={nameOf(k)} onClick={() => choose(k)}>
                    <span className="lm__thing-art">
                      <ArtThumb kind="sprite" id={k} scale={1.5} />
                    </span>
                    <span className="lm__thing-label">
                      {isBuiltin(k) && <Icon name="lock" size={11} />} {nameOf(k)}
                    </span>
                  </button>
                ))}
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
                <SpriteCanvas sprite={sprite} frame={current} tool={tool} color={color} alpha={alpha} readOnly={builtin} foot={tab === "foot"} onPickColor={(c, a) => (setColor(c), setAlpha(a))} />
              </div>
              <div className="lm__status">
                <span className="lm__hint">
                  {builtin
                    ? "Встроенный спрайт нельзя изменить — сделайте копию и правьте её"
                    : tab === "foot"
                      ? "Нажимайте клетки опоры: красные не пропускают игрока, зелёные пропускают"
                      : tab === "draw"
                        ? (TOOLS.find((t) => t.id === tool)?.hint ?? "")
                        : `${sprite.w}×${sprite.h} пикс.`}
                </span>
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
                <button className="btn btn--sm" onClick={() => copy(sprite)} title="Создать свою копию и править её">
                  <Icon name="copy" size={15} /> Копировать
                </button>
                <button className="btn btn--sm btn--danger" disabled={builtin} onClick={() => remove(sprite)} title={builtin ? "Встроенные спрайты удалять нельзя" : "Удалить спрайт"}>
                  <Icon name="trash" size={15} />
                </button>
              </div>
              {builtin && <p className="muted">Встроенный спрайт: смотреть можно, менять и удалять нельзя. Сделайте копию, чтобы править.</p>}
              <fieldset className="sprite-ro" disabled={builtin}>
                {tab === "draw" && <DrawPanel sprite={sprite} frame={current} tool={tool} setTool={setTool} color={color} alpha={alpha} setColor={(c, a) => (setColor(c), setAlpha(a))} onFrame={setFrame} />}
                {tab === "props" && <PropsPanel sprite={sprite} />}
                {tab === "foot" && <FootPanel sprite={sprite} />}
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
