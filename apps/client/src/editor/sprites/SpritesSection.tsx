import { useState } from "react";
import { CustomSprite as CustomSpriteSchema, type CaseFile, type CustomSprite } from "../../../../../shared/case";
import { SPRITES } from "../../game/art";
import { ask, tell } from "../../ui/dialog";
import { Icon } from "../../ui/icons";
import { EntityList, ItemText } from "../EntityList";
import { ObjectFields } from "../SchemaForm";
import { Tabs } from "../Tabs";
import { formSchema } from "../json-schema";
import { toKey } from "../keys";
import { editor, editorStore, useEditor } from "../state";
import { useUrlParam, useWriteDefaultParam } from "../url";
import { SpriteDraw } from "./SpriteDraw";
import { SpriteParams, SpriteStates } from "./SpriteStates";
import { cellSolid, newSprite, patchSprite, renameSprite, spriteUses, toggleCell } from "./helpers";

type Tab = "general" | "draw" | "footprint" | "vars";
const TABS: { id: Tab; label: string }[] = [
  { id: "general", label: "Общее" },
  { id: "draw", label: "Рисунок" },
  { id: "footprint", label: "Опора" },
  { id: "vars", label: "Переменные и состояния" },
];
const SCHEMA = formSchema(CustomSpriteSchema);
const KEY_RE = /^[a-z][a-z0-9_]*$/;

/** Раздел «Спрайты»: свои предметы дела — рисунок, опора, переменные и состояния. */
export function SpritesSection() {
  const draft = useEditor((s) => s.draft);
  const list = draft.sprites ?? [];
  const [selected, setSelected] = useUrlParam("item", "");
  const [tab, setTab] = useUrlParam("tab", "general");
  const current = list.find((s) => s.key === selected) ?? list[0] ?? null;
  useWriteDefaultParam("item", current?.key === selected, list[0]?.key);

  const add = () => {
    const s = newSprite(editorStore.get().draft, (k) => k in SPRITES);
    editor.update((d) => ({ ...d, sprites: [...(d.sprites ?? []), s] }));
    setSelected(s.key);
  };
  const remove = async (s: CustomSprite) => {
    const uses = spriteUses(draft, s.key);
    if (uses.length) return tell({ title: "Спрайт используется", text: `«${s.name}» стоит на картах: ${uses.join(", ")}. Сначала замените его у этих предметов.` });
    if (!(await ask({ title: `Удалить спрайт «${s.name}»?`, text: "Рисунок и состояния пропадут.", confirmLabel: "Удалить", danger: true }))) return;
    editor.update((d) => ({ ...d, sprites: d.sprites?.filter((x) => x.key !== s.key) }));
  };

  return (
    <section className="ed__split">
      <EntityList
        items={list}
        getKey={(s) => s.key}
        isActive={(s) => s.key === current?.key}
        onSelect={(s) => setSelected(s.key)}
        onAdd={add}
        addLabel="Добавить спрайт"
        empty="Своих спрайтов пока нет. Спрайт — предмет, который вы рисуете сами; его можно ставить на карты и привязывать к переменным дела."
        renderItem={(s) => (
          <>
            <span className="ed__item-kind" title="Спрайт"><Icon name="brush" size={16} /></span>
            <ItemText title={s.name || "без названия"} id={s.key} warn={!s.name} />
          </>
        )}
        tools={(s) => (
          <button className="btn btn--sm btn--icon" aria-label="Удалить спрайт" onClick={() => remove(s)}>
            <Icon name="close" size={14} />
          </button>
        )}
      />
      <div className="ed__panel">
        {current ? (
          <div className="stack" key={current.key}>
            <Tabs tabs={TABS} active={(TABS.find((t) => t.id === tab)?.id ?? "general") as Tab} onChange={setTab} />
            {tab === "draw" ? (
              <SpriteDraw sprite={current} />
            ) : tab === "footprint" ? (
              <Footprint sprite={current} />
            ) : tab === "vars" ? (
              <>
                <SpriteParams sprite={current} />
                <SpriteStates sprite={current} />
              </>
            ) : (
              <General sprite={current} onRenamed={setSelected} />
            )}
          </div>
        ) : (
          <p className="muted">Добавьте спрайт слева.</p>
        )}
      </div>
    </section>
  );
}

function General({ sprite, onRenamed }: { sprite: CustomSprite; onRenamed: (k: string) => void }) {
  const [key, setKey] = useState(sprite.key);
  const commit = async () => {
    const next = toKey(key);
    if (!next || next === sprite.key) return setKey(sprite.key);
    const d = editorStore.get().draft;
    if (!KEY_RE.test(next) || next in SPRITES || d.sprites?.some((s) => s.key === next)) {
      setKey(sprite.key);
      return tell({ title: "Ключ не подходит", text: `Ключ «${next}» занят или записан не латиницей — выберите другой.` });
    }
    const uses = spriteUses(d, sprite.key).length;
    if (uses && !(await ask({ title: "Сменить ключ спрайта?", text: `Он стоит у ${uses} предмет(ов); ссылки обновятся.`, confirmLabel: "Сменить" }))) return setKey(sprite.key);
    editor.update((x) => renameSprite(x, sprite.key, next));
    onRenamed(next);
  };
  return (
    <div className="stack">
      <label className="ef">
        <span className="ef__label">Ключ</span>
        <input value={key} onChange={(e) => setKey(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()} />
      </label>
      <ObjectFields
        schema={SCHEMA}
        value={sprite}
        only={["name", "group", "w", "h", "footprint", "solid", "flat", "mount", "opensNear", "mirrorRight"]}
        ctx={{ draft: editorStore.get().draft }}
        onChange={(v) => editor.update((d: CaseFile) => patchSprite(d, sprite.key, v as Partial<CustomSprite>), `sprite:${sprite.key}`)}
      />
    </div>
  );
}

/** Опора: какие клетки под предметом мешают проходу (клик переключает; остальное — общее «мешает проходу»). */
function Footprint({ sprite }: { sprite: CustomSprite }) {
  const { w, h } = sprite.footprint;
  const rows = Array.from({ length: h }, (_, r) => r);
  return (
    <div className="stack">
      <p className="muted">Опора — клетки на полу под предметом (ширина вправо, высота вверх от точки предмета). Нажмите клетку, чтобы она пропускала или не пропускала игрока.</p>
      <div className="sprite-foot" style={{ gridTemplateColumns: `repeat(${w}, 36px)` }}>
        {rows.flatMap((r) =>
          Array.from({ length: w }, (_, c) => {
            const dx = c;
            const dy = -(h - 1 - r);
            const solid = cellSolid(sprite, dx, dy);
            return (
              <button
                key={`${dx},${dy}`}
                className="sprite-foot__cell"
                data-tone={solid ? "bad" : "good"}
                aria-label={`Клетка ${dx},${dy}: ${solid ? "мешает" : "проходима"}`}
                onClick={() => editor.update((d) => patchSprite(d, sprite.key, { cells: toggleCell(sprite, dx, dy) }))}
              >
                {solid ? "×" : "·"}
              </button>
            );
          }),
        )}
      </div>
    </div>
  );
}
