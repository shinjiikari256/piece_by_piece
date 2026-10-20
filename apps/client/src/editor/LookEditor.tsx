import { useEffect, useRef, useState } from "react";
import {
  CHAR_H,
  CHAR_W,
  LOOK_NAMES,
  BUILTIN_PARTS,
  PART_NAMES,
  customFromLook,
  drawCharacter,
  drawTile,
  resolveLook,
  type CharFrame,
  type Look
} from "../game/art";
import type { Appearance, Character, CustomLook, PartSlot } from "../../../../shared/case";
import { ArtThumb } from "./Pickers";
import { Tabs } from "./Tabs";
import { Alert } from "../ui/alert";

/**
 * Редактор внешности персонажа: образец как отправная точка + свои
 * причёска, цвета, деталь одежды и аксессуары. Пока ничего не меняли,
 * персонаж ссылается на образец (look); первая правка создаёт appearance.
 */

const SKIN = ["#f3cfae", "#f1c7a1", "#e9bd96", "#e2b48c", "#dcae86", "#c68e63", "#a86b47", "#7d4a2f"];
const HAIR = [
  "#1e1a18",
  "#3b2a20",
  "#5a3a22",
  "#8a4b2a",
  "#c9a15a",
  "#d9a441",
  "#b9b9b9",
  "#6b6b6b",
  "#d35400",
  "#a8433a",
  "#3c6e9e",
  "#f1f1f1"
];
const CLOTH = [
  "#2c3e66",
  "#24364f",
  "#4a5568",
  "#5b8fd6",
  "#3c6e9e",
  "#2e9e5b",
  "#7f9c8a",
  "#c0392b",
  "#b03a2e",
  "#8e5ea2",
  "#e07a9b",
  "#f39c12",
  "#b8894f",
  "#6b4f3a",
  "#2b2b2b",
  "#f4f4f4"
];
const LEGS = ["#2b2f3a", "#2f3a56", "#39424e", "#45413a", "#3c3c50", "#1b2a3e", "#3b4a6b", "#2f6fd6", "#6b4f3a"];
const SHOES = ["#111418", "#22262c", "#2a1f18", "#5a2f2f", "#f1f1f1", "#c0392b", "#2f6fd6"];
const EYES = ["#2a2320", "#5a3a22", "#8a6a3a", "#3c6e9e", "#5b8fd6", "#2e7d4f", "#6b6b6b"];
const GLASSES = ["#2a2320", "#6b4f3a", "#a0701a", "#b9b9b9", "#c0392b", "#2f6fd6", "#8e5ea2", "#f1f1f1"];
const ACCENT = [
  "#f1f1f1",
  "#ffffff",
  "#c0392b",
  "#7a2f2f",
  "#2b4c7e",
  "#0f1824",
  "#f1c40f",
  "#2ecc71",
  "#9c3434",
  "#e07a9b"
];

/** Библиотека частей слота: встроенные и части дела (названия — `PART_NAMES`). */
const partList = (slot: PartSlot, skip: string[] = []) =>
  Object.entries(PART_NAMES[slot]).filter(([id]) => !skip.includes(id)).map(([id, label]) => ({ id, label }));

type Tab = "preset" | "face" | "clothes" | "extras";
const TABS: { id: Tab; label: string }[] = [
  { id: "preset", label: "Образец" },
  { id: "face", label: "Лицо и волосы" },
  { id: "clothes", label: "Одежда" },
  { id: "extras", label: "Аксессуары" }
];

export function LookEditor({
  character,
  others,
  onChange
}: {
  character: Character;
  /** Остальные персонажи дела — чтобы предупредить о совпадении. */
  others: Character[];
  onChange: (next: Character) => void;
}) {
  const [tab, setTab] = useState<Tab>(character.appearance ? "face" : "preset");
  const look = resolveLook(character);
  const custom = character.appearance;
  const set = (patch: Partial<CustomLook>) =>
    onChange({ ...character, appearance: { ...(custom ?? customFromLook(look)), ...patch } });
  const lookKey = JSON.stringify(look);
  const twin = others.find((o) => JSON.stringify(resolveLook(o)) === lookKey);

  return (
    <section className='look-ed'>
      <div className='look-ed__preview'>
        <BigPreview look={look} />
        <div className='look-ed__frames'>
          {(["idle", "walk1", "talk"] as CharFrame[]).map((f) => (
            <Frame key={f} look={look} frame={f} />
          ))}
        </div>
        <p className='look-ed__base'>
          {custom ? "Своя внешность" : "Образец"} · основа: {LOOK_NAMES[character.look] ?? character.look}
        </p>
        {custom && (
          <button className='btn btn--sm' onClick={() => onChange({ ...character, appearance: undefined })}>
            Сбросить к образцу
          </button>
        )}
        {twin && (
          <Alert tone='warn' icon>
            Так же выглядит «{twin.name}» — игрокам будет трудно их различать.
          </Alert>
        )}
      </div>

      <div className='look-ed__controls'>
        <Tabs tabs={TABS} active={tab} onChange={setTab} />

        {tab === "preset" && (
          <Group title='Образец — отправная точка, дальше можно настроить'>
            <div className='look-ed__presets'>
              {(Object.keys(LOOK_NAMES) as Appearance[]).map((id) => (
                <button
                  key={id}
                  className="look-ed__preset" aria-pressed={character.look === id && !custom}
                  title={LOOK_NAMES[id]}
                  onClick={() => onChange({ ...character, look: id, appearance: undefined })}
                >
                  <ArtThumb kind='look' id={id} scale={2} />
                </button>
              ))}
            </div>
          </Group>
        )}

        {tab === "face" && (
          <>
            <Group title='Кожа'>
              <Colors colors={SKIN} value={look.skin} onChange={(skin) => set({ skin })} />
            </Group>
            <Group title='Глаза'>
              <Colors colors={EYES} value={look.eyes ?? "#2a2320"} onChange={(eyes) => set({ eyes })} />
            </Group>
            <Group title='Причёска'>
              <div className='look-ed__options'>
                {partList("hair").map((h) => (
                  <button
                    key={h.id}
                    className="look-ed__option" aria-pressed={look.hairStyle === h.id}
                    onClick={() => set({ hairStyle: h.id })}
                  >
                    <Frame look={{ ...look, hairStyle: h.id }} frame='idle' crop />
                    <span>{h.label}</span>
                  </button>
                ))}
              </div>
              <Colors colors={HAIR} value={look.hair} onChange={(hair) => set({ hair })} />
            </Group>
            <Group title='Усы и борода (цвета волос)'>
              <Toggles
                look={look}
                keys={[
                  ["mustache", "Усы"],
                  ["beard", "Борода"]
                ]}
                set={set}
              />
            </Group>
          </>
        )}

        {tab === "clothes" && (
          <>
            <Group title='Верх'>
              <Colors colors={CLOTH} value={look.top} onChange={(top) => set({ top })} />
            </Group>
            <Group title='Деталь'>
              <div className='look-ed__chips'>
                {partList("accent").map((a) => (
                  <button
                    key={a.id}
                    className="look-ed__chip" aria-pressed={look.accentStyle === a.id}
                    onClick={() => set({ accentStyle: a.id })}
                  >
                    {a.label}
                  </button>
                ))}
              </div>
              <Colors colors={ACCENT} value={look.accent} onChange={(accent) => set({ accent })} />
            </Group>
            <Group title='Низ'>
              <div className='look-ed__chips'>
                {[{ id: "pants", label: "Брюки" }, ...partList("bottom")].map(({ id, label }) => (
                  <button
                    key={id}
                    className="look-ed__chip" aria-pressed={(look.bottom ?? "pants") === id}
                    onClick={() => set({ bottom: id })}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <Colors colors={LEGS} value={look.legs} onChange={(legs) => set({ legs })} />
            </Group>
            <Group title='Обувь'>
              <Colors colors={SHOES} value={look.shoes} onChange={(shoes) => set({ shoes })} />
            </Group>
          </>
        )}

        {tab === "extras" && (
          <>
          <Group title='Очки'>
            <Toggles look={look} keys={[["glasses", "Очки"]]} set={set} />
            {look.glasses && (
              <Colors
                colors={GLASSES}
                value={look.glassesColor ?? "#2a2320"}
                onChange={(glassesColor) => set({ glassesColor })}
              />
            )}
          </Group>
          {partList("face", BUILTIN_PARTS.face).length > 0 && (
            <Group title='Детали лица (из частей дела)'>
              <div className='look-ed__chips'>
                {partList("face", BUILTIN_PARTS.face).map(({ id, label }) => {
                  const on = (look.faceParts ?? []).includes(id);
                  return (
                    <button
                      key={id}
                      className='look-ed__chip' aria-pressed={on}
                      onClick={() => set({ faceParts: on ? (look.faceParts ?? []).filter((k) => k !== id) : [...(look.faceParts ?? []), id] })}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </Group>
          )}
          </>
        )}
      </div>
    </section>
  );
}

function Toggles({
  look,
  keys,
  set
}: {
  look: Look;
  keys: readonly (readonly ["glasses" | "mustache" | "beard", string])[];
  set: (patch: Partial<CustomLook>) => void;
}) {
  return (
    <div className='look-ed__chips'>
      {keys.map(([k, label]) => (
        <button key={k} className="look-ed__chip" aria-pressed={look[k]} onClick={() => set({ [k]: !look[k] })}>
          {look[k] ? "✓ " : ""}
          {label}
        </button>
      ))}
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className='look-ed__group'>
      <h4>{title}</h4>
      {children}
    </div>
  );
}

function Colors({ colors, value, onChange }: { colors: string[]; value: string; onChange: (c: string) => void }) {
  const known = colors.some((c) => c.toLowerCase() === value.toLowerCase());
  return (
    <div className='look-ed__colors row row--wrap'>
      {colors.map((c) => (
        <button
          key={c}
          className="swatch-dot" aria-pressed={c.toLowerCase() === value.toLowerCase()}
          style={{ background: c }}
          title={c}
          onClick={() => onChange(c)}
        />
      ))}
      <label
        className="swatch-dot swatch-dot--custom"
        aria-pressed={!known}
        title='Свой цвет'
        style={known ? undefined : { background: value }}
      >
        <input
          type='color'
          value={/^#[0-9a-f]{6}$/i.test(value) ? value : "#888888"}
          onChange={(e) => onChange(e.target.value)}
        />
        {known && "+"}
      </label>
    </div>
  );
}

/** Один кадр персонажа; crop — только голова (для выбора причёски). */
function Frame({ look, frame, crop }: { look: Look; frame: CharFrame; crop?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const key = JSON.stringify(look) + frame;
  useEffect(() => {
    const ctx = ref.current?.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, CHAR_W, CHAR_H);
    drawCharacter(ctx, look, frame, 0);
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <span className={crop ? "look-ed__head" : "look-ed__frame"}>
      <canvas ref={ref} width={CHAR_W} height={CHAR_H} />
    </span>
  );
}

/** Крупный предпросмотр: персонаж стоит, ходит и говорит по кругу на плитке пола. */
function BigPreview({ look }: { look: Look }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((v) => v + 1), 220);
    return () => clearInterval(t);
  }, []);
  const key = JSON.stringify(look);
  useEffect(() => {
    const ctx = ref.current?.getContext("2d");
    if (!ctx) return;
    for (let x = 0; x < 2; x++) for (let y = 0; y < 2; y++) drawTile(ctx, ".", x * 16, y * 16, {});
    const cycle: CharFrame[] = [
      "idle",
      "idle",
      "idle2",
      "idle2",
      "walk1",
      "walk2",
      "walk1",
      "walk2",
      "talk",
      "idle",
      "talk",
      "idle"
    ];
    drawCharacter(ctx, look, cycle[tick % cycle.length], 8);
  }, [key, tick]); // eslint-disable-line react-hooks/exhaustive-deps
  return <canvas ref={ref} width={32} height={CHAR_H + 4} className='look-ed__big' />;
}
