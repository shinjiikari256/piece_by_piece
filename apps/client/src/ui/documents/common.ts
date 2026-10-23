import { mixColors, roleColor } from "../../util/colors";

/** A4 при 200 dpi. */
export const PAGE_W = 1654;
export const PAGE_H = 2339;

/**
 * Цвета документов — роли из CSS (`styles/tokens/roles.css`), читаются при рисовании: грамота и результат следуют теме.
 * Золото листа — рамка «обвязки» (`--border-chrome`), тёмный и светлый оттенки считаются от него.
 */
export const C = {
  get paper() {
    return roleColor("--bg-paper", "#fbf7ee");
  },
  get paperEdge() {
    return roleColor("--bg-paper-dim", "#f3ecdc");
  },
  get surface() {
    return roleColor("--bg-surface", "#ffffff");
  },
  get onDark() {
    return roleColor("--text-on-dark", "#ffffff");
  },
  get ink() {
    return roleColor("--text", "#2b231c");
  },
  get soft() {
    return roleColor("--text-soft", "#5d5247");
  },
  get muted() {
    return roleColor("--text-muted", "#887a6b");
  },
  get line() {
    return roleColor("--border", "#e0d4bd");
  },
  get gold() {
    return roleColor("--border-chrome", "#b48d55");
  },
  get goldDark() {
    return mixColors(this.gold, "#000000", 0.25);
  },
  get goldLight() {
    return mixColors(this.gold, "#ffffff", 0.35);
  },
  get accent() {
    return roleColor("--accent", "#2b4c7e");
  },
  get good() {
    return roleColor("--good", "#2e7d4f");
  },
  get warn() {
    return roleColor("--warn-strong", "#e0b23c");
  },
  get bad() {
    return roleColor("--bad", "#b03a2e");
  },
  get shadow() {
    return roleColor("--overlay-dark-2", "rgba(20, 12, 4, 0.18)");
  },
};

export type Tone = "good" | "warn" | "bad";
export const toneColor = (t: Tone) => (t === "good" ? C.good : t === "warn" ? C.warn : C.bad);

export const font = (weight: number, size: number, family = "Rubik") => `${weight} ${size}px "${family}", system-ui, sans-serif`;

export async function loadFonts() {
  await Promise.all([document.fonts.load(font(700, 40)), document.fonts.load(font(500, 40)), document.fonts.load(font(400, 40)), document.fonts.load(font(400, 40, "PT Mono"))]);
}

export function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const para of text.split("\n")) {
    let line = "";
    for (const w of para.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${w}` : w;
      if (ctx.measureText(next).width > maxWidth && line) {
        lines.push(line);
        line = w;
      } else line = next;
    }
    lines.push(line);
  }
  return lines;
}

export function centered(ctx: CanvasRenderingContext2D, text: string, y: number, maxWidth: number, lineHeight: number): number {
  const lines = wrap(ctx, text, maxWidth);
  ctx.textAlign = "center";
  lines.forEach((l, i) => ctx.fillText(l, PAGE_W / 2, y + i * lineHeight));
  return y + lines.length * lineHeight;
}

export function spaced(ctx: CanvasRenderingContext2D, spacing: number, draw: () => void) {
  const c = ctx as CanvasRenderingContext2D & { letterSpacing?: string };
  const prev = c.letterSpacing;
  c.letterSpacing = `${spacing}px`;
  draw();
  c.letterSpacing = prev ?? "0px";
}

export function paper(ctx: CanvasRenderingContext2D) {
  const bg = ctx.createRadialGradient(PAGE_W / 2, PAGE_H * 0.38, 200, PAGE_W / 2, PAGE_H / 2, PAGE_H * 0.78);
  bg.addColorStop(0, C.paper);
  bg.addColorStop(1, C.paperEdge);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, PAGE_W, PAGE_H);
}

export function diamond(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.lineTo(x + r, y);
  ctx.lineTo(x, y + r);
  ctx.lineTo(x - r, y);
  ctx.closePath();
  ctx.fill();
}

export function divider(ctx: CanvasRenderingContext2D, y: number, half: number) {
  const cx = PAGE_W / 2;
  ctx.strokeStyle = C.gold;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(cx - half, y);
  ctx.lineTo(cx - 34, y);
  ctx.moveTo(cx + 34, y);
  ctx.lineTo(cx + half, y);
  ctx.stroke();
  ctx.fillStyle = C.gold;
  diamond(ctx, cx, y, 14);
  diamond(ctx, cx - 26, y, 6);
  diamond(ctx, cx + 26, y, 6);
}
