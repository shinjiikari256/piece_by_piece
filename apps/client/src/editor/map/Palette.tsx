import { useState } from "react";
import { FLOOR_GROUPS, SPRITE_GROUPS, SPRITE_NAMES, WALL_GROUPS, resolveLook } from "../../game/art";
import { SpriteKey } from "../../../../../shared/case";
import type { CaseFile as CaseFileT, SpriteKey as SpriteKeyT } from "../../../../../shared/case";
import { ArtThumb } from "../Pickers";
import { PaletteGroup, PaletteSection, SwatchButton, ToolButton } from "./panels";
import { TILE_TOOLS } from "./canvases";
import type { Tool } from "./types";

/** Левая панель редактора карты: инструменты, клетки, предметы, люди. */
export function MapPalette({
  draft,
  tool,
  setTool,
  pickTile,
  npcCharacter,
  setNpcCharacter,
}: {
  draft: CaseFileT;
  tool: Tool;
  setTool: (t: Tool) => void;
  pickTile: (ch: string) => void;
  npcCharacter: string;
  setNpcCharacter: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<Record<string, boolean>>({ tiles: true, objects: true, people: true });
  const toggle = (k: string) => setOpen((o) => ({ ...o, [k]: !o[k] }));
  // подгруппы: по умолчанию раскрыты самые частые; при поиске раскрываются все, где есть совпадения
  const [groups, setGroups] = useState<Record<string, boolean>>({ indoor: true, walls: true, furniture: true });
  const q = query.trim().toLowerCase();
  const groupOpen = (id: string) => !!q || !!groups[id];
  const toggleGroup = (id: string) => setGroups((o) => ({ ...o, [id]: !o[id] }));
  const matches = (k: SpriteKeyT) => !q || (SPRITE_NAMES[k] ?? k).toLowerCase().includes(q) || k.includes(q);
  const tileGroups = (list: { id: string; label: string; chars: string[] }[]) =>
    list.map((g) => {
      const tiles = TILE_TOOLS.filter((t) => g.chars.includes(t.ch));
      return (
        <PaletteGroup key={g.id} title={g.label} count={tiles.length} open={groupOpen(g.id)} onToggle={() => toggleGroup(g.id)}>
          <div className="lm__swatches">
            {tiles.map((t) => (
              <SwatchButton key={t.ch} ch={t.ch} label={t.label} on={tool.kind === "tile" && tool.ch === t.ch} onClick={() => pickTile(t.ch)} />
            ))}
          </div>
        </PaletteGroup>
      );
    });
  return (
    <aside className="lm__palette">
      <div className="lm__tools">
        <ToolButton on={tool.kind === "select"} onClick={() => setTool({ kind: "select" })} icon="⬚" label="Выбор" keyHint="V" />
        <ToolButton on={tool.kind === "start"} onClick={() => setTool({ kind: "start" })} icon="▶" label="Старт" />
        <ToolButton on={tool.kind === "exit"} onClick={() => setTool({ kind: "exit" })} icon="⇄" label="Выход" />
        <ToolButton
          on={tool.kind === "door" && tool.orientation === "h"}
          onClick={() => setTool({ kind: "door", orientation: "h" })}
          icon="▬"
          label="Дверь ─"
        />
        <ToolButton
          on={tool.kind === "door" && tool.orientation === "v"}
          onClick={() => setTool({ kind: "door", orientation: "v" })}
          icon="▮"
          label="Дверь │"
        />
      </div>

      {/* пол и стены — одна группа «Клетки»: выбор клетки сразу включает кисть, Shift — прямоугольник */}
      <PaletteSection title="Клетки" open={open.tiles} onToggle={() => toggle("tiles")}>
        {tileGroups([...FLOOR_GROUPS, ...WALL_GROUPS])}
      </PaletteSection>

      <PaletteSection title={`Предметы (${SpriteKey.options.length})`} open={open.objects} onToggle={() => toggle("objects")}>
        <input className="lm__search" placeholder="Поиск предмета…" value={query} onChange={(e) => setQuery(e.target.value)} />
        {SPRITE_GROUPS.map((g) => {
          const keys = (Object.keys(g.sprites) as SpriteKeyT[]).filter(matches);
          if (!keys.length) return null;
          return (
            <PaletteGroup key={g.id} title={g.label} count={keys.length} open={groupOpen(g.id)} onToggle={() => toggleGroup(g.id)}>
              <div className="lm__things">
                {keys.map((k) => (
                  <button
                    key={k}
                    className="lm__thing" aria-pressed={tool.kind === "object" && tool.sprite === k}
                    onClick={() => setTool({ kind: "object", sprite: k })}
                    title={SPRITE_NAMES[k] ?? k}
                  >
                    <span className="lm__thing-art">
                      <ArtThumb kind="sprite" id={k} scale={1.5} />
                    </span>
                    <span className="lm__thing-label">{SPRITE_NAMES[k] ?? k}</span>
                  </button>
                ))}
              </div>
            </PaletteGroup>
          );
        })}
        {q && SpriteKey.options.every((k) => !matches(k)) && <p className="lm__note">Ничего не найдено.</p>}
      </PaletteSection>

      <PaletteSection title="Люди" open={open.people} onToggle={() => toggle("people")}>
        <div className="lm__things">
          {draft.characters.map((c) => {
            const placed = draft.locations.some((l) => l.npcs.some((n) => n.characterId === c.id));
            return (
              <button
                key={c.id}
                className={`lm__thing ${placed ? "is-placed" : ""}`}
                aria-pressed={tool.kind === "npc" && npcCharacter === c.id}
                onClick={() => {
                  setNpcCharacter(c.id);
                  setTool({ kind: "npc" });
                }}
                title={placed ? `${c.name} — уже стоит на карте` : c.name}
              >
                <span className="lm__thing-art">
                  <ArtThumb kind="look" id={c.look} look={resolveLook(c)} scale={2} />
                </span>
                <span className="lm__thing-label">{c.name}</span>
              </button>
            );
          })}
        </div>
        <p className="lm__note">Новые персонажи — в разделе «Персонажи». Полупрозрачные уже стоят на карте.</p>
      </PaletteSection>
    </aside>
  );
}
