import { useEffect, useState } from "react";

const HEX = /^#[0-9a-f]{6}$/i;

/** Выбор цвета с непрозрачностью: образец, системный выбор, код `#rrggbb`, ползунок в процентах и быстрые цвета. `alpha` — 1…255. */
export function ColorPicker({
  color,
  alpha,
  swatches = [],
  onChange,
}: {
  color: string;
  alpha: number;
  swatches?: string[];
  onChange: (color: string, alpha: number) => void;
}) {
  const [text, setText] = useState(color);
  useEffect(() => setText(color), [color]);
  const percent = Math.round((alpha / 255) * 100);
  return (
    <div className="colorpick">
      <div className="colorpick__row">
        <span className="colorpick__sample" title="Так цвет выглядит на рисунке">
          <span style={{ background: color, opacity: alpha / 255 }} />
        </span>
        <input type="color" className="colorpick__native" aria-label="Выбрать цвет" value={color} onChange={(e) => onChange(e.target.value, alpha)} />
        <input
          className="colorpick__hex"
          aria-label="Код цвета"
          value={text}
          maxLength={7}
          onChange={(e) => {
            setText(e.target.value);
            if (HEX.test(e.target.value)) onChange(e.target.value.toLowerCase(), alpha);
          }}
          onBlur={() => setText(color)}
        />
      </div>
      <label className="colorpick__alpha">
        <span>Непрозрачность</span>
        <input type="range" min={1} max={100} value={percent} onChange={(e) => onChange(color, Math.max(1, Math.round((Number(e.target.value) / 100) * 255)))} />
        <output>{percent}%</output>
      </label>
      {swatches.length > 0 && (
        <div className="colorpick__swatches" aria-label="Цвета этого спрайта">
          {swatches.map((c) => (
            <button
              key={c}
              type="button"
              className="colorpick__swatch"
              style={{ background: c }}
              title={c}
              aria-pressed={c.slice(0, 7).toLowerCase() === color.toLowerCase()}
              onClick={() => onChange(c.slice(0, 7).toLowerCase(), c.length > 7 ? parseInt(c.slice(7, 9), 16) : 255)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
