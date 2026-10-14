/**
 * Цвет роли из CSS (`--text`, `--bg-paper`, …) для холста, где `var()` не работает: значение берётся у `:root`,
 * поэтому документы следуют теме. Вне браузера (тесты) возвращается запасное значение.
 */
export function roleColor(name: string, fallback: string): string {
  if (typeof document === "undefined") return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

/** Смешать два цвета (`#rgb`, `#rrggbb`, `rgb(...)`): доля `t` от `b` и остальное от `a`. Результат — `#rrggbb`. */
export function mixColors(a: string, b: string, t: number): string {
  const rgb = (c: string): [number, number, number] => {
    const hex = c.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i)?.[1];
    if (hex) {
      const full = hex.length === 3 ? [...hex].map((x) => x + x).join("") : hex;
      return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)) as [number, number, number];
    }
    const m = c.match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/i);
    return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : [0, 0, 0];
  };
  const [ra, rb] = [rgb(a), rgb(b)];
  return "#" + ra.map((v, i) => Math.round(v + (rb[i] - v) * t).toString(16).padStart(2, "0")).join("");
}
