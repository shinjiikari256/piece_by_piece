import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import { useDismiss } from "../../ui/hooks";
import { readJson, writeJson } from "../../state/storage";
import { FORMATS, formatColor, hexToHsv, hexToRgb, hsvToHex, parseColor, pushRecent, type ColorFormat, type Hsv } from "./color-math";

const RECENT_KEY = "editor:recent-colors";
const FORMAT_NAMES: Record<ColorFormat, string> = { hex: "HEX", rgb: "RGB", hsl: "HSL" };

/** Ползунок-полоса или квадрат: тянется мышью/пальцем, отдаёт положение 0…1 по обеим осям. */
function Drag({ className, label, onMove, onEnd, children }: { className: string; label: string; onMove: (x: number, y: number) => void; onEnd: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const at = (e: ReactPointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    onMove(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)));
  };
  return (
    <div
      ref={ref}
      className={className}
      role="presentation"
      aria-label={label}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        at(e);
      }}
      onPointerMove={(e) => e.currentTarget.hasPointerCapture(e.pointerId) && at(e)}
      onPointerUp={(e) => {
        e.currentTarget.releasePointerCapture(e.pointerId);
        onEnd();
      }}
    >
      {children}
    </div>
  );
}

/**
 * Выбор цвета с непрозрачностью: образец открывает окошко с квадратом яркости, полосами тона и непрозрачности,
 * кодом цвета (HEX / RGB / HSL), недавними цветами и цветами рисунка. Пипетка — отдельный инструмент холста.
 * `alpha` — 1…255.
 */
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
  const [open, setOpen] = useState(false);
  const [format, setFormat] = useState<ColorFormat>("hex");
  const [hsv, setHsv] = useState<Hsv>(() => hexToHsv(color));
  const [text, setText] = useState(formatColor(color, format));
  const [recent, setRecent] = useState<string[]>(() => readJson<string[]>(RECENT_KEY, []));
  const button = useRef<HTMLButtonElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<CSSProperties>();
  useDismiss(open, () => setOpen(false), [button, popup]);

  // Оттенок и насыщенность хранятся отдельно: у серого/чёрного hex их не восстановить, и ползунок прыгал бы.
  useEffect(() => {
    setHsv((h) => (hsvToHex(h) === color ? h : hexToHsv(color)));
    setText(formatColor(color, format));
  }, [color, format]);

  useLayoutEffect(() => {
    if (!open || !button.current || !popup.current) return;
    const r = button.current.getBoundingClientRect();
    const { offsetWidth: w, offsetHeight: h } = popup.current;
    const left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8));
    const top = r.bottom + 4 + h > window.innerHeight - 8 ? Math.max(8, r.top - h - 4) : r.bottom + 4;
    setPos({ left, top });
  }, [open]);

  const remember = () => {
    const next = pushRecent(recent, color);
    setRecent(next);
    writeJson(RECENT_KEY, next);
  };
  const setHsvColor = (next: Hsv) => {
    setHsv(next);
    onChange(hsvToHex(next), alpha);
  };
  const applyHex = (hex: string, a = alpha) => {
    setHsv(hexToHsv(hex));
    onChange(hex, a);
  };
  const [r, g, b] = hexToRgb(color);
  const rgb = `${r} ${g} ${b}`;
  const percent = Math.round((alpha / 255) * 100);
  const pickedSwatch = (c: string) => applyHex(c.slice(0, 7).toLowerCase(), c.length > 7 ? parseInt(c.slice(7, 9), 16) : 255);

  return (
    <div className="colorpick">
      <button ref={button} type="button" className="colorpick__button" aria-haspopup="dialog" aria-expanded={open} title="Выбрать цвет" onClick={() => setOpen(!open)}>
        <span className="colorpick__sample">
          <span style={{ background: color, opacity: alpha / 255 }} />
        </span>
        <span className="colorpick__code">{color}</span>
        <span className="colorpick__percent">{percent}%</span>
      </button>
      {open &&
        createPortal(
          <div ref={popup} className="colorpick__pop" style={pos ?? { visibility: "hidden" }} role="dialog" aria-label="Выбор цвета">
            <Drag className="colorpick__sv" label="Яркость и насыщенность" onMove={(x, y) => setHsvColor({ ...hsv, s: x, v: 1 - y })} onEnd={remember}>
              <span className="colorpick__sv-hue" style={{ "--hue": hsv.h } as CSSProperties} />
              <span className="colorpick__dot" style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%` }} />
            </Drag>
            <Drag className="colorpick__hue" label="Тон" onMove={(x) => setHsvColor({ ...hsv, h: x * 360 })} onEnd={remember}>
              <span className="colorpick__thumb" style={{ left: `${(hsv.h / 360) * 100}%` }} />
            </Drag>
            <Drag className="colorpick__alpha-strip" label="Непрозрачность" onMove={(x) => onChange(color, Math.max(1, Math.round(x * 255)))} onEnd={() => undefined}>
              <span className="colorpick__alpha-fill" style={{ "--rgb": rgb } as CSSProperties} />
              <span className="colorpick__thumb" style={{ left: `${(alpha / 255) * 100}%` }} />
            </Drag>
            <div className="row">
              <input
                className="colorpick__hex"
                aria-label="Код цвета"
                spellCheck={false}
                value={text}
                onChange={(e) => {
                  setText(e.target.value);
                  const hex = parseColor(e.target.value);
                  if (hex) applyHex(hex);
                }}
                onBlur={() => {
                  setText(formatColor(color, format));
                  remember();
                }}
                onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
              />
              <output className="colorpick__percent" title="Непрозрачность">
                {percent}%
              </output>
            </div>
            <div className="colorpick__formats" role="group" aria-label="Формат кода">
              {FORMATS.map((f) => (
                <button key={f} type="button" className="btn btn--sm" aria-pressed={f === format} onClick={() => setFormat(f)}>
                  {FORMAT_NAMES[f]}
                </button>
              ))}
            </div>
            {swatches.length > 0 && <Swatches title="Цвета спрайта" list={swatches} color={color} onPick={pickedSwatch} />}
            {recent.length > 0 && <Swatches title="Недавние" list={recent} color={color} onPick={pickedSwatch} />}
          </div>,
          document.body,
        )}
    </div>
  );
}

function Swatches({ title, list, color, onPick }: { title: string; list: string[]; color: string; onPick: (c: string) => void }) {
  return (
    <div className="stack colorpick__group">
      <span className="muted">{title}</span>
      <div className="colorpick__swatches">
        {list.map((c) => (
          <button key={c} type="button" className="colorpick__swatch" style={{ background: c }} title={c} aria-pressed={c.slice(0, 7).toLowerCase() === color.toLowerCase()} onClick={() => onPick(c)} />
        ))}
      </div>
    </div>
  );
}
