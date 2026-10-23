import { useState } from "react";
import type { CaseFile, Dialogue, Zone } from "../../../../../shared/case";
import { Select } from "../../ui/kit/Select";
import { ENUM_LABELS } from "../labels";
import { editor } from "../state";
import { ZoneCreator } from "../map/ZoneCreator";

const NEW_ZONE = "__new__";

/** Пометка рядом с областью: как запускается действие (по клавише — без пометки). */
const triggerNote = (a: { trigger?: string } | undefined) => (a?.trigger && a.trigger !== "use" ? <small> · {ENUM_LABELS[a.trigger]}</small> : null);

/**
 * Откуда запускается диалог: персонаж на карте (по умолчанию) и/или области. Действие «диалог» хранит сама область
 * (порядок, условие и автозапуск — в её свойствах на карте); здесь области только привязывают и отвязывают.
 * Область можно создать тут же («+ новая область…») — уходить на карту не нужно.
 */
export function DialogueTrigger({ draft, dialogue }: { draft: CaseFile; dialogue: Dialogue }) {
  const [creating, setCreating] = useState(false);
  const launches = (z: Zone) => z.actions.some((a) => a.kind === "dialogue" && a.dialogueId === dialogue.id);
  const all = draft.locations.flatMap((l) => l.zones.map((z) => ({ loc: l, zone: z })));
  const linked = all.filter(({ zone }) => launches(zone));
  const free = all.filter(({ zone }) => !launches(zone));
  const home = draft.locations.find((l) => l.npcs.some((n) => n.dialogueId === dialogue.id || n.characterId === dialogue.characterId))?.id;

  const edit = (zoneId: string, fn: (z: Zone) => Zone) => editor.update((c) => ({ ...c, locations: c.locations.map((l) => ({ ...l, zones: l.zones.map((z) => (z.id === zoneId ? fn(z) : z)) })) }));

  return (
    <section className="dg__trigger stack">
      <h3>Запуск диалога</h3>
      <p className="muted">Персонаж на карте запускает диалог, как обычно. Дополнительно его можно запускать из областей.</p>
      {linked.map(({ loc, zone }) => (
        <div key={zone.id} className="row">
          <span className="ellipsis">
            {loc.name} · <b>{zone.name}</b>
            {triggerNote(zone.actions.find((a) => a.kind === "dialogue" && a.dialogueId === dialogue.id))}
          </span>
          <button
            className="btn btn--sm btn--icon"
            title="Отвязать область (сама область останется)"
            aria-label="Отвязать область"
            onClick={() => edit(zone.id, (z) => ({ ...z, actions: z.actions.filter((a) => !(a.kind === "dialogue" && a.dialogueId === dialogue.id)) }))}
          >
            ✕
          </button>
        </div>
      ))}
      <Select
        className="sel--add"
        value=""
        placeholder="+ область"
        options={[...free.map(({ loc, zone }) => ({ value: zone.id, label: `${loc.name} · ${zone.name}` })), { value: NEW_ZONE, label: "+ новая область…" }]}
        onChange={(v) => (v === NEW_ZONE ? setCreating(true) : edit(v, (z) => ({ ...z, actions: [...z.actions, { kind: "dialogue", dialogueId: dialogue.id }] })))}
      />
      {creating && (
        <ZoneCreator
          draft={draft}
          defaultLocationId={home}
          actions={[{ kind: "dialogue", dialogueId: dialogue.id }]}
          onClose={() => setCreating(false)}
          onCreate={(locationId, zone) => {
            editor.update((c) => ({ ...c, locations: c.locations.map((l) => (l.id === locationId ? { ...l, zones: [...l.zones, zone] } : l)) }));
            setCreating(false);
          }}
        />
      )}
    </section>
  );
}
