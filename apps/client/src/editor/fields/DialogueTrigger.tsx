import { useState } from "react";
import type { CaseFile, Condition, Dialogue, Zone } from "../../../../../shared/case";
import { Select } from "../../ui/Select";
import { ZoneCreator } from "../map/ZoneCreator";
import { ConditionEditor } from "./Conditions";
import type { FormCtx } from "../SchemaForm";

const NEW_ZONE = "__new__";

/**
 * Запуск диалога: персонаж на карте (по умолчанию) или область. Область выбирают из списка зон дела
 * либо создают тут же («+ новая область…») — уходить на карту не нужно. Здесь же условие доступности.
 */
export function DialogueTrigger({
  draft,
  dialogue,
  onChange,
  onCreateZone,
}: {
  draft: CaseFile;
  dialogue: Dialogue;
  onChange: (fn: (d: Dialogue) => Dialogue) => void;
  /** Добавить область в локацию дела (потом отдельным изменением ставится триггер диалога). */
  onCreateZone: (locationId: string, zone: Zone) => void;
}) {
  const [creating, setCreating] = useState(false);
  const ctx: FormCtx = { draft };
  const zones = draft.locations.flatMap((l) => l.zones.map((z) => ({ value: z.id, label: `${l.name} · ${z.name}` })));
  const trigger = dialogue.trigger;
  const home = draft.locations.find((l) => l.npcs.some((n) => n.dialogueId === dialogue.id || n.characterId === dialogue.characterId))?.id;

  return (
    <section className="dg__trigger stack">
      <h3>Запуск диалога</h3>
      <Select
        value={trigger ? "zone" : "npc"}
        options={[
          { value: "npc", label: "Персонаж на карте (его реплика)" },
          { value: "zone", label: "Область на карте" },
        ]}
        onChange={(v) => {
          if (v === "npc") onChange((d) => ({ ...d, trigger: undefined }));
          else if (zones.length) onChange((d) => ({ ...d, trigger: { kind: "zone", zoneId: zones[0].value } }));
          else setCreating(true);
        }}
      />
      {trigger && (
        <>
          <Select
            value={trigger.zoneId}
            placeholder="какая область"
            options={[...zones, { value: NEW_ZONE, label: "+ новая область…" }]}
            onChange={(v) => (v === NEW_ZONE ? setCreating(true) : onChange((d) => ({ ...d, trigger: { kind: "zone", zoneId: v, auto: d.trigger?.auto } })))}
          />
          <label className="ef__toggle">
            <input
              type="checkbox"
              checked={!!trigger.auto}
              onChange={(e) => onChange((d) => ({ ...d, trigger: { kind: "zone", zoneId: trigger.zoneId, ...(e.target.checked ? { auto: true } : {}) } }))}
            />
            Запускать сам, когда игрок входит (один раз); иначе — по клавише взаимодействия
          </label>
        </>
      )}
      <ConditionEditor
        value={(dialogue.requires ?? {}) as Condition}
        ctx={ctx}
        label={<span className="ef__label">Когда диалог доступен (из подходящих запускается первый по порядку)</span>}
        onChange={(v) => onChange((d) => ({ ...d, requires: Object.keys(v as object).length ? (v as Condition) : undefined }))}
      />
      {creating && (
        <ZoneCreator
          draft={draft}
          defaultLocationId={home}
          onClose={() => setCreating(false)}
          onCreate={(locationId, zone) => {
            onCreateZone(locationId, zone);
            onChange((d) => ({ ...d, trigger: { kind: "zone", zoneId: zone.id } }));
            setCreating(false);
          }}
        />
      )}
    </section>
  );
}
