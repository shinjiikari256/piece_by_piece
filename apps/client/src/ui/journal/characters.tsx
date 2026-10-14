import { useState } from "react";
import { sourceOf } from "../../content/case-utils";
import { resolveLook } from "../../game/art";
import { actions, useGame } from "../../state/store";

import { EvidenceCard } from "../common";
import { Portrait } from "../panels";
import { useCase } from "./index";

// ---------- Персонажи ----------

export function CharactersTab({ focus }: { focus?: string }) {
  const caseFile = useCase();
  const notes = useGame((s) => s.progress.characterNotes);
  const collected = useGame((s) => s.progress.collected);
  const [selected, setSelected] = useState(focus ?? caseFile.characters[0]?.id);
  const c = caseFile.characters.find((x) => x.id === selected);
  const related = c
    ? collected
        .map((id) => caseFile.evidence.find((e) => e.id === id)!)
        .filter((e) => e.relatedCharacters.includes(c.id) || sourceOf(caseFile, e.id)?.characterId === c.id)
    : [];

  return (
    <div className="materials">
      <div className="materials__body">
        <div className="materials__list">
          <div className="people-grid">
            {caseFile.characters.map((ch) => {
              const n = (notes[ch.id] ?? []).length;
              return (
                <button key={ch.id} className="person-card" data-selected={ch.id === selected || undefined} onClick={() => setSelected(ch.id)}>
                  <Portrait look={resolveLook(ch)} />
                  <span className="person-card__name">{ch.name}</span>
                  <span className="person-card__pos">{ch.position}</span>
                  {n > 0 && (
                    <span className="person-card__badge" title="Сколько заметок о персонаже">
                      {n}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
        <aside className="materials__detail">
          {c && (
            <article className="detail">
              <header className="detail__head">
                <Portrait look={resolveLook(c)} />
                <div>
                  <span className="detail__type">{c.position}</span>
                  <h3>{c.name}</h3>
                </div>
              </header>
              <p>{c.description}</p>
              <span className="detail__label">Что удалось узнать</span>
              {(notes[c.id] ?? []).length ? (
                <ul className="notes">
                  {notes[c.id].map((n) => (
                    <li key={n}>{n}</li>
                  ))}
                </ul>
              ) : (
                <p className="muted">Пока ничего. Поговорите с ним или с теми, кто его знает.</p>
              )}
              {related.length > 0 && (
                <>
                  <span className="detail__label">Материалы о нём</span>
                  <div className="fact__sources">
                    {related.map((e) => (
                      <EvidenceCard
                        key={e.id}
                        evidence={e}
                        compact
                        onClick={() => actions.open({ kind: "journal", tab: "materials", focus: e.id })}
                      />
                    ))}
                  </div>
                </>
              )}
            </article>
          )}
        </aside>
      </div>
    </div>
  );
}
