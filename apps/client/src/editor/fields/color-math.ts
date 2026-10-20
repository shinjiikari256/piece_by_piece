export type Hsv = { h: number; s: number; v: number };
export type ColorFormat = "hex" | "rgb" | "hsl";
export const FORMATS: ColorFormat[] = ["hex", "rgb", "hsl"];

const clamp = (n: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, n));
const byte = (n: number) => clamp(Math.round(n), 0, 255).toString(16).padStart(2, "0");

export const isHex = (v: string): boolean => /^#[0-9a-f]{6}$/i.test(v.trim());

export function hexToRgb(hex: string): [number, number, number] {
  const n = isHex(hex) ? parseInt(hex.trim().slice(1), 16) : 0;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export const rgbToHex = (r: number, g: number, b: number): string => `#${byte(r)}${byte(g)}${byte(b)}`;

export function hexToHsv(hex: string): Hsv {
  const [r, g, b] = hexToRgb(hex).map((n) => n / 255);
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h = (h * 60 + 360) % 360;
  }
  return { h, s: max === 0 ? 0 : d / max, v: max };
}

function fromChroma(h: number, c: number, m: number): string {
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return rgbToHex((r + m) * 255, (g + m) * 255, (b + m) * 255);
}

export function hsvToHex({ h, s, v }: Hsv): string {
  return fromChroma(((h % 360) + 360) % 360, v * s, v - v * s);
}

export function hexToHsl(hex: string): [number, number, number] {
  const [r, g, b] = hexToRgb(hex).map((n) => n / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return [0, 0, Math.round(l * 100)];
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = hexToHsv(hex).h;
  return [Math.round(h), Math.round(s * 100), Math.round(l * 100)];
}

export function hslToHex(h: number, s: number, l: number): string {
  const sf = clamp(s / 100);
  const lf = clamp(l / 100);
  const c = (1 - Math.abs(2 * lf - 1)) * sf;
  return fromChroma(((h % 360) + 360) % 360, c, lf - c / 2);
}

/** Запись цвета в выбранном формате: `#rrggbb`, `rgb(r, g, b)` или `hsl(h, s%, l%)`. */
export function formatColor(hex: string, format: ColorFormat): string {
  if (format === "hex") return hex;
  if (format === "rgb") return `rgb(${hexToRgb(hex).join(", ")})`;
  const [h, s, l] = hexToHsl(hex);
  return `hsl(${h}, ${s}%, ${l}%)`;
}

/** Разбор введённого цвета в любом формате (`#rgb`, `#rrggbb`, `rgb()`, `hsl()`, «r, g, b»); не получилось — `null`. */
export function parseColor(raw: string): string | null {
  const v = raw.trim();
  if (/^#[0-9a-f]{6}$/i.test(v)) return v.toLowerCase();
  if (/^#[0-9a-f]{3}$/i.test(v)) return `#${[...v.slice(1)].map((c) => c + c).join("")}`.toLowerCase();
  let m = /^rgb\(\s*(\d+(?:\.\d+)?)[,\s]+(\d+(?:\.\d+)?)[,\s]+(\d+(?:\.\d+)?)\s*\)$/i.exec(v) ?? /^(\d+(?:\.\d+)?)[,\s]+(\d+(?:\.\d+)?)[,\s]+(\d+(?:\.\d+)?)$/.exec(v);
  if (m) return rgbToHex(+m[1], +m[2], +m[3]);
  m = /^hsl\(\s*(\d+(?:\.\d+)?)[,\s]+(\d+(?:\.\d+)?)%?[,\s]+(\d+(?:\.\d+)?)%?\s*\)$/i.exec(v);
  if (m) return hslToHex(+m[1], +m[2], +m[3]);
  return null;
}

/** Добавить цвет в начало списка недавних без повтора, не больше `max`. */
export const pushRecent = (list: string[], hex: string, max = 10): string[] => [hex, ...list.filter((c) => c.toLowerCase() !== hex.toLowerCase())].slice(0, max);
