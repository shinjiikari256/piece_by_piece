import { useMemo, useState, type ReactNode } from "react";
import type { CustomSprite } from "../../../../../shared/case";
import { Icon } from "../../ui/icons";
import { Select } from "../../ui/Select";
import { Dialog } from "../../ui/window";
import { ask } from "../../ui/dialog";
import { ColorPicker } from "../fields/ColorPicker";
import { editor, editorStore } from "../state";
import { DEFAULT_GROUP, groupLabels } from "./catalog";
import { TOOLS, type Tool } from "./SpriteCanvas";
import { frameLabel, patchSprite, renameFrame, setFrameOps } from "./helpers";

const upd = (s: CustomSprite, patch: Partial<CustomSprite>) => editor.update((d) => patchSprite(d, s.key, patch), `sprite:${s.key}`);

/** Число с подписью; пустое поле не меняет значение. */
export function NumField({ label, value, min, max, suffix, onChange }: { label: string; value: number; min: number; max: number; suffix?: string; onChange: (v: number) => void }) {
  return (
    <label className="ef">
      <span className="ef__label">{label}</span>
      <span className="row">
        <input type="number" min={min} max={max} value={value} onChange={(e) => e.target.value !== "" && onChange(Math.min(max, Math.max(min, Math.trunc(Number(e.target.value)))))} />
        {suffix && <span className="muted">{suffix}</span>}
      </span>
    </label>
  );
}

export function Check({ checked, onChange, children, hint }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode; hint?: string }) {
  return (
    <label className="sprite-check" title={hint}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>
        {children}
        {hint && <small className="muted"> {hint}</small>}
      </span>
    </label>
  );
}

/** Вкладка «Рисунок»: инструменты, цвет, действия с кадром. */
export function DrawPanel({
  sprite,
  frame,
  tool,
  setTool,
  color,
  alpha,
  setColor,
  onFrame,
}: {
  sprite: CustomSprite;
  frame: string;
  tool: Tool;
  setTool: (t: Tool) => void;
  color: string;
  alpha: number;
  setColor: (c: string, a: number) => void;
  onFrame: (f: string) => void;
}) {
  const ops = sprite.frames[frame] ?? [];
  const [name, setName] = useState(frame);
  const [prev, setPrev] = useState(frame);
  if (prev !== frame) {
    setPrev(frame);
    setName(frame);
  }
  const palette = useMemo(() => {
    const seen = new Set<string>();
    for (const list of Object.values(sprite.frames)) for (const o of list) if (o[4]) seen.add(o[4].toLowerCase());
    return [...seen].slice(0, 28);
  }, [sprite.frames]);
  const commitName = () => {
    const next = name.trim();
    if (!next || next === frame || next in sprite.frames) return setName(frame);
    editor.update((d) => renameFrame(d, sprite.key, frame, next));
    onFrame(next);
  };
  const del = async () => {
    if (!(await ask({ title: `Удалить кадр «${frameLabel(frame)}»?`, text: "Если на него ссылаются состояния или анимации, редактор покажет ошибку.", confirmLabel: "Удалить", danger: true }))) return;
    editor.update((d) => ({ ...d, sprites: d.sprites?.map((s) => (s.key === sprite.key ? { ...s, frames: Object.fromEntries(Object.entries(s.frames).filter(([k]) => k !== frame)) as CustomSprite["frames"] } : s)) }));
    onFrame("default");
  };
  return (
    <div className="stack">
      <h3>Инструмент</h3>
      <div className="sprite-tools">
        {TOOLS.map((t) => (
          <button key={t.id} className="btn btn--sm" aria-pressed={tool === t.id} title={t.hint} onClick={() => setTool(t.id)}>
            <Icon name={t.icon} size={15} /> {t.label}
          </button>
        ))}
      </div>
      <h3>Цвет</h3>
      <ColorPicker color={color} alpha={alpha} swatches={palette} onChange={setColor} />
      <h3>Кадр «{frameLabel(frame)}»</h3>
      <p className="muted">Кадры — разные картинки одного предмета (например, дверь закрыта и открыта). Переключайте их вкладками над рисунком. Операций в кадре: {ops.length}.</p>
      {frame !== "default" && (
        <label className="ef">
          <span className="ef__label">Название кадра</span>
          <input value={name} onChange={(e) => setName(e.target.value)} onBlur={commitName} onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()} />
        </label>
      )}
      <div className="row">
        <button className="btn btn--sm" disabled={!ops.length} onClick={() => editor.update((d) => setFrameOps(d, sprite.key, frame, ops.slice(0, -1)))} title="Убрать последний мазок или фигуру">
          <Icon name="undo" size={15} /> Отменить последнее
        </button>
        <button className="btn btn--sm" disabled={!ops.length} onClick={() => editor.update((d) => setFrameOps(d, sprite.key, frame, []))}>
          <Icon name="eraser" size={15} /> Очистить кадр
        </button>
        {frame !== "default" && (
          <button className="btn btn--sm btn--danger" onClick={del}>
            <Icon name="trash" size={15} /> Удалить кадр
          </button>
        )}
      </div>
    </div>
  );
}

/** Вкладка «Свойства»: название, группа, размер и особенности предмета. */
export function PropsPanel({ sprite }: { sprite: CustomSprite }) {
  return (
    <div className="stack">
      <label className="ef">
        <span className="ef__label">Название</span>
        <input value={sprite.name} onChange={(e) => upd(sprite, { name: e.target.value })} />
      </label>
      <GroupField sprite={sprite} />
      <div className="pair">
        <NumField label="Ширина" value={sprite.w} min={1} max={256} suffix="пикс." onChange={(w) => upd(sprite, { w })} />
        <NumField label="Высота" value={sprite.h} min={1} max={256} suffix="пикс." onChange={(h) => upd(sprite, { h })} />
      </div>
      <p className="muted">В клетке карты 16×16 пикселей. Изменение размера не обрезает нарисованное.</p>
      <h3>Особенности</h3>
      <Check checked={!!sprite.flat} onChange={(flat) => upd(sprite, { flat: flat || undefined })} hint="Например, ковёр: персонажи всегда выше него.">Лежит на полу</Check>
      <Check checked={!!sprite.mirrorRight} onChange={(v) => upd(sprite, { mirrorRight: v || undefined })} hint="Для боковых дверей: притолока всегда у внешней стены.">Зеркалится в правой половине карты</Check>
      <Check checked={!!sprite.opensNear} onChange={(v) => upd(sprite, { opensNear: v || undefined })} hint="Показывается кадр «Открыт», пока рядом игрок или спутник.">Открывается, когда рядом кто-то</Check>
      <Check checked={!!sprite.mount} onChange={(v) => upd(sprite, { mount: v ? 8 : undefined })}>Висит на стене</Check>
      {!!sprite.mount && <NumField label="Высота над полом" value={sprite.mount} min={1} max={64} suffix="пикс." onChange={(mount) => upd(sprite, { mount })} />}
      <p className="muted">
        Ключ спрайта: <code>{sprite.key}</code> (внутреннее имя, остаётся неизменным).
      </p>
    </div>
  );
}

const NEW_GROUP = "\u0000new";

/** Группа в палитре «Локаций»: выбор из существующих или новая через окно. */
function GroupField({ sprite }: { sprite: CustomSprite }) {
  const [dialog, setDialog] = useState(false);
  const [text, setText] = useState("");
  const labels = groupLabels(editorStore.get().draft);
  const value = sprite.group?.trim() || DEFAULT_GROUP;
  const set = (g: string) => upd(sprite, { group: g === DEFAULT_GROUP ? undefined : g });
  return (
    <>
      <div className="ef">
        <span className="ef__label" title="Раздел палитры предметов в «Локациях», где будет лежать спрайт">Группа в палитре предметов</span>
        <Select
          value={value}
          options={[...labels.map((l) => ({ value: l, label: l })), { value: NEW_GROUP, label: "Новая группа…" }]}
          onChange={(v) => (v === NEW_GROUP ? (setText(""), setDialog(true)) : set(v))}
        />
      </div>
      {dialog && (
        <Dialog
          title="Новая группа"
          onClose={() => setDialog(false)}
          onSubmit={(e) => {
            e.preventDefault();
            if (!text.trim()) return;
            set(text.trim());
            setDialog(false);
          }}
          actions={
            <>
              <button type="button" className="btn" onClick={() => setDialog(false)}>
                Отмена
              </button>
              <button type="submit" className="btn btn--primary" disabled={!text.trim()}>
                Создать
              </button>
            </>
          }
        >
          <p className="muted">Группа — раздел списка предметов слева в «Локациях». Спрайт будет лежать в ней.</p>
          <input autoFocus placeholder="Например, «Лаборатория»" value={text} onChange={(e) => setText(e.target.value)} />
        </Dialog>
      )}
    </>
  );
}

/** Вкладка «Опора»: размер опоры в клетках и пояснение. Проходимость клеток — нажатием на рисунок. */
export function FootPanel({ sprite }: { sprite: CustomSprite }) {
  const { w, h } = sprite.footprint;
  return (
    <div className="stack">
      <p>
        <b>Опора</b> — клетки пола, которые предмет занимает на карте. Предмет ставится на нижнюю левую клетку, остальные идут вправо и вверх.
      </p>
      <p className="muted">На рисунке слева поверх спрайта показаны эти клетки. Красная × — игрок не пройдёт, зелёная ✓ — пройдёт (например, место перед столом). Нажмите клетку, чтобы переключить.</p>
      <div className="pair">
        <NumField label="Ширина" value={w} min={1} max={16} suffix="клеток" onChange={(w) => upd(sprite, { footprint: { w, h }, cells: sprite.cells?.filter((c) => c.dx < w) })} />
        <NumField label="Высота" value={h} min={1} max={16} suffix="клеток" onChange={(h) => upd(sprite, { footprint: { w, h }, cells: sprite.cells?.filter((c) => c.dy < h) })} />
      </div>
      <Check checked={sprite.solid} onChange={(solid) => upd(sprite, { solid, cells: undefined })} hint="Новое значение сбрасывает исключения.">Предмет мешает проходу</Check>
      <div className="sprite-legend">
        <span data-tone="bad">× не пропускает</span>
        <span data-tone="good">✓ пропускает</span>
      </div>
      {!!sprite.cells?.length && (
        <button className="btn btn--sm" onClick={() => upd(sprite, { cells: undefined })}>
          <Icon name="undo" size={15} /> Сбросить исключения
        </button>
      )}
    </div>
  );
}
