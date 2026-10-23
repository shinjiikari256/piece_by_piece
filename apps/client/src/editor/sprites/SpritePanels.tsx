import { useMemo, useState, type ReactNode } from "react";
import type { CustomSprite } from "../../../../../shared/case";
import { Icon } from "../../ui/kit/icons";
import { Select } from "../../ui/kit/Select";
import { Dialog } from "../../ui/kit/window";
import { ask } from "../../ui/kit/dialog";
import { ColorPicker } from "../fields/ColorPicker";
import { editor, editorStore } from "../state";
import { DEFAULT_GROUP, groupLabels } from "./catalog";
import { CELL, cellsOf, frameLabel, patchSprite, renameFrame, resizeSprite } from "./helpers";
import { blurOnEnter } from "../../util/keys";

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

/** Вкладка «Рисунок»: цвет и название кадра. Инструменты — над рисунком. */
export function DrawPanel({
  sprite,
  frame,
  color,
  alpha,
  setColor,
  onFrame,
}: {
  sprite: CustomSprite;
  frame: string;
  color: string;
  alpha: number;
  setColor: (c: string, a: number) => void;
  onFrame: (f: string) => void;
}) {
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
    editor.update((d) => ({
      ...d,
      sprites: d.sprites?.map((s) => (s.key === sprite.key ? { ...s, frames: Object.fromEntries(Object.entries(s.frames).filter(([k]) => k !== frame)) as CustomSprite["frames"] } : s)),
    }));
    onFrame("default");
  };
  return (
    <div className="stack">
      <h3>Цвет</h3>
      <ColorPicker color={color} alpha={alpha} swatches={palette} onChange={setColor} />
      <h3>Кадр «{frameLabel(frame)}»</h3>
      <p className="muted">Кадры — разные картинки одного предмета (например, дверь закрыта и открыта). Переключайте их вкладками над рисунком, порядок меняется перетаскиванием.</p>
      {frame !== "default" && (
        <label className="ef">
          <span className="ef__label">Название кадра</span>
          <input value={name} onChange={(e) => setName(e.target.value)} onBlur={commitName} onKeyDown={blurOnEnter} />
        </label>
      )}
      {frame !== "default" && (
        <button className="btn btn--sm btn--danger" onClick={del}>
          <Icon name="trash" size={15} /> Удалить кадр
        </button>
      )}
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
        <NumField label="Ширина" value={cellsOf(sprite.w)} min={1} max={16} suffix="клеток" onChange={(cw) => upd(sprite, resizeSprite(sprite, cw, cellsOf(sprite.h)))} />
        <NumField label="Высота" value={cellsOf(sprite.h)} min={1} max={16} suffix="клеток" onChange={(ch) => upd(sprite, resizeSprite(sprite, cellsOf(sprite.w), ch))} />
      </div>
      <p className="muted">
        Размер задаётся в клетках поля: одна клетка — {CELL}×{CELL} пикселей рисунка. Сейчас рисунок {sprite.w}×{sprite.h} пикселей. Нарисованное не обрезается.
      </p>
      <h3>Особенности</h3>
      <Check checked={!!sprite.flat} onChange={(flat) => upd(sprite, { flat: flat || undefined })} hint="Например, ковёр: персонажи всегда выше него.">
        Лежит на полу
      </Check>
      <Check checked={!!sprite.mirrorRight} onChange={(v) => upd(sprite, { mirrorRight: v || undefined })} hint="Для боковых дверей: притолока всегда у внешней стены.">
        Зеркалится в правой половине карты
      </Check>
      <Check checked={!!sprite.opensNear} onChange={(v) => upd(sprite, { opensNear: v || undefined })} hint="Показывается кадр «Открыт», пока рядом игрок или спутник.">
        Открывается, когда рядом кто-то
      </Check>
      <Check checked={!!sprite.mount} onChange={(v) => upd(sprite, { mount: v ? 8 : undefined })}>
        Висит на стене
      </Check>
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
        <span className="ef__label" title="Раздел палитры предметов в «Локациях», где будет лежать спрайт">
          Группа в палитре предметов
        </span>
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
          <input className="sprite-input" autoFocus placeholder="Например, «Лаборатория»" value={text} onChange={(e) => setText(e.target.value)} />
        </Dialog>
      )}
    </>
  );
}

/** Панель опоры под рисунком (инструмент «Опора»): размер в клетках и проходимость. Сами клетки переключаются на рисунке. */
export function FootBar({ sprite, readOnly }: { sprite: CustomSprite; readOnly: boolean }) {
  const { w, h } = sprite.footprint;
  const set = (fw: number, fh: number) => upd(sprite, { footprint: { w: fw, h: fh }, cells: sprite.cells?.filter((c) => c.dx < fw && c.dy < fh) });
  return (
    <div className="foot-bar">
      <label>
        Опора, клеток: ширина
        <input
          type="number"
          min={1}
          max={cellsOf(sprite.w)}
          value={w}
          disabled={readOnly}
          onChange={(e) => e.target.value !== "" && set(Math.min(cellsOf(sprite.w), Math.max(1, Math.trunc(Number(e.target.value)))), h)}
        />
      </label>
      <label>
        высота
        <input
          type="number"
          min={1}
          max={cellsOf(sprite.h)}
          value={h}
          disabled={readOnly}
          onChange={(e) => e.target.value !== "" && set(w, Math.min(cellsOf(sprite.h), Math.max(1, Math.trunc(Number(e.target.value)))))}
        />
      </label>
      <label className="foot-bar__check" title="Новое значение сбрасывает исключения для отдельных клеток">
        <input type="checkbox" checked={sprite.solid} disabled={readOnly} onChange={(e) => upd(sprite, { solid: e.target.checked, cells: undefined })} />
        Мешает проходу
      </label>
      {!!sprite.cells?.length && !readOnly && (
        <button className="btn btn--sm" onClick={() => upd(sprite, { cells: undefined })} title="Вернуть всем клеткам опоры общее значение">
          <Icon name="undo" size={15} /> Сбросить
        </button>
      )}
      <span className="foot-bar__legend">
        <span data-tone="bad">× не пропускает</span> <span data-tone="good">✓ пропускает</span>
      </span>
    </div>
  );
}
