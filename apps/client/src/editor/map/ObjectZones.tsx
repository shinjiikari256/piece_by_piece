import { useState } from "react";
import type { CaseFile, LocationObject, Zone } from "../../../../../shared/case";
import { Select } from "../../ui/Select";
import { ENUM_LABELS } from "../labels";
import { editor } from "../state";
import { ZoneCreator } from "./ZoneCreator";

const NEW_ZONE = "__new__";

/** Пометка рядом с областью: как запускается действие (по клавише — без пометки). */
const triggerNote = (a: { trigger?: string } | undefined) => (a?.trigger && a.trigger !== "use" ? <small> · {ENUM_LABELS[a.trigger]}</small> : null);

/**
 * Откуда осматривается предмет: сам предмет на карте (как обычно) и/или области. Действие «предмет» хранит сама область
 * (порядок, условие и автозапуск — в её свойствах); здесь области только привязывают и отвязывают.
 * Область можно создать тут же («+ новая область…»).
 */
export function ObjectZones({ draft, object, locationId }: { draft: CaseFile; object: LocationObject; locationId: string }) {
  const [creating, setCreating] = useState(false);
  const launches = (z: Zone) => z.actions.some((a) => a.kind === "object" && a.objectId === object.id);
  const all = draft.locations.flatMap((l) => l.zones.map((z) => ({ loc: l, zone: z })));
  const linked = all.filter(({ zone }) => launches(zone));
  const free = all.filter(({ zone }) => !launches(zone));

  const edit = (zoneId: string, fn: (z: Zone) => Zone) =>
    editor.update((c) => ({ ...c, locations: c.locations.map((l) => ({ ...l, zones: l.zones.map((z) => (z.id === zoneId ? fn(z) : z)) })) }));

  return (
    <section className="stack">
      <h3>Осмотр из областей</h3>
      <p className="muted">Предмет осматривается, как обычно. Дополнительно его можно осматривать из областей — в том числе автоматически при входе.</p>
      {linked.map(({ loc, zone }) => (
        <div key={zone.id} className="row">
          <span className="ellipsis">
            {loc.name} · <b>{zone.name}</b>
            {triggerNote(zone.actions.find((a) => a.kind === "object" && a.objectId === object.id))}
          </span>
          <button
            className="btn btn--sm btn--icon"
            title="Отвязать область (сама область останется)"
            aria-label="Отвязать область"
            onClick={() => edit(zone.id, (z) => ({ ...z, actions: z.actions.filter((a) => !(a.kind === "object" && a.objectId === object.id)) }))}
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
        onChange={(v) => (v === NEW_ZONE ? setCreating(true) : edit(v, (z) => ({ ...z, actions: [...z.actions, { kind: "object", objectId: object.id }] })))}
      />
      {creating && (
        <ZoneCreator
          draft={draft}
          defaultLocationId={locationId}
          actions={[{ kind: "object", objectId: object.id }]}
          onClose={() => setCreating(false)}
          onCreate={(locId, zone) => {
            editor.update((c) => ({ ...c, locations: c.locations.map((l) => (l.id === locId ? { ...l, zones: [...l.zones, zone] } : l)) }));
            setCreating(false);
          }}
        />
      )}
    </section>
  );
}
