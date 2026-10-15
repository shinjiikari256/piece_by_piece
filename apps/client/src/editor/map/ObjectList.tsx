import { useState } from "react";
import { SPRITE_NAMES, resolveLook } from "../../game/art";
import type { CaseFile as CaseFileT, Location as LocationT } from "../../../../../shared/case";
import { ArtThumb } from "../Pickers";
import type { Selection } from "./types";

type Sel = NonNullable<Selection>;

const same = (a: Selection, b: Sel) => !!a && a.kind === b.kind && (a.kind === "start" || (a as { id: string }).id === (b as { id: string }).id);

/** Вкладка «Объекты»: всё, что уже стоит на этой локации. Клик — выбрать (рамка на карте и свойства). */
export function ObjectList({ loc, draft, sel, onPick }: { loc: LocationT; draft: CaseFileT; sel: Selection; onPick: (s: Sel) => void }) {
  const nameOf = (id: string) => draft.characters.find((c) => c.id === id)?.name ?? id;
  const row = (s: Sel, art: React.ReactNode, title: string, sub: string) => (
    <li key={`${s.kind}:${(s as { id?: string }).id ?? ""}`}>
      <button className="lm__row" data-selected={same(sel, s) || undefined} onClick={() => onPick(s)}>
        <span className="lm__row-art">{art}</span>
        <span className="lm__row-text">
          <b>{title}</b>
          <small>{sub}</small>
        </span>
      </button>
    </li>
  );
  // свёрнутые разделы; раздел с выбранным элементом всегда раскрыт, чтобы выбранное не пряталось
  const [folded, setFolded] = useState<Record<string, boolean>>({});
  const section = (id: string, title: string, items: React.ReactNode[], hasSel: boolean) => {
    if (!items.length) return null;
    const open = hasSel || !folded[id];
    return (
      <section className="lm__list-section">
        <button className="lm__list-head" aria-expanded={open} onClick={() => setFolded((f) => ({ ...f, [id]: open }))}>
          <span>{open ? "▾" : "▸"}</span> {title} <small>{items.length}</small>
        </button>
        {open && <ul>{items}</ul>}
      </section>
    );
  };

  const has = (kind: Sel["kind"]) => sel?.kind === kind;
  return (
    <div className="lm__list">
      {section(
        "objects",
        "Предметы",
        loc.objects.map((o) =>
          row({ kind: "object", id: o.id }, <ArtThumb kind="sprite" id={o.sprite} scale={1} />, o.label || SPRITE_NAMES[o.sprite] || o.sprite, `${o.id} · клетка ${o.x}, ${o.y}${o.interaction ? " · улика" : ""}`),
        ),
        has("object"),
      )}
      {section(
        "npcs",
        "Люди",
        loc.npcs.map((n) => {
          const ch = draft.characters.find((c) => c.id === n.characterId);
          return row({ kind: "npc", id: n.id }, ch ? <ArtThumb kind="look" id={ch.look} look={resolveLook(ch)} scale={1} /> : null, nameOf(n.characterId), `${n.id} · клетка ${n.x}, ${n.y}`);
        }),
        has("npc"),
      )}
      {section(
        "exits",
        "Выходы",
        loc.exits.map((e) => row({ kind: "exit", id: e.id }, <span className="lm__row-glyph">⇄</span>, e.label || `→ ${draft.locations.find((l) => l.id === e.to)?.name ?? e.to}`, `${e.id} · клетка ${e.x}, ${e.y}`)),
        has("exit"),
      )}
      {section(
        "doors",
        "Двери",
        loc.doors.map((d) => row({ kind: "door", id: d.id }, <span className="lm__row-glyph">{d.orientation === "h" ? "▬" : "▮"}</span>, d.requires ? "Дверь · с условием" : "Дверь", `${d.id} · клетка ${d.x}, ${d.y}`)),
        has("door"),
      )}
      {section(
        "zones",
        "Области",
        loc.zones.map((z) => row({ kind: "zone", id: z.id }, <span className="lm__row-glyph">▦</span>, z.name, `${z.id} · клеток: ${z.cells.length}`)),
        has("zone"),
      )}
      {section("start", "Старт", [row({ kind: "start" }, <span className="lm__row-glyph">▶</span>, "Старт игрока", `клетка ${loc.playerStart.x}, ${loc.playerStart.y}`)], has("start"))}
      {loc.objects.length + loc.npcs.length + loc.exits.length + loc.doors.length + loc.zones.length === 0 && <p className="muted">На локации пока ничего нет — выберите инструмент слева и кликните по карте.</p>}
    </div>
  );
}
