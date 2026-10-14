
/** A4 при 200 dpi. */
export const PAGE_W = 1654;
export const PAGE_H = 2339;

export const C = {
  paper: "#fbf7ee",
  paperEdge: "#f0e5cd",
  ink: "#2b231c",
  soft: "#6b5d4f",
  muted: "#8a7b6b",
  line: "#e0d4bd",
  gold: "#b48d55",
  goldDark: "#8a6a3a",
  goldLight: "#d9bd8c",
  accent: "#2b4c7e",
  good: "#2e7d4f",
  warn: "#a0701a",
  bad: "#b03a2e",
};

export type Tone = "good" | "warn" | "bad";
export const toneColor = (t: Tone) => (t === "good" ? C.good : t === "warn" ? C.warn : C.bad);

export const font = (weight: number, size: number, family = "Rubik") => `${weight} ${size}px "${family}", system-ui, sans-serif`;

export async function loadFonts() {
  await Promise.all([
    document.fonts.load(font(700, 40)),
    document.fonts.load(font(500, 40)),
    document.fonts.load(font(400, 40)),
    document.fonts.load(font(400, 40, "PT Mono")),
  ]);
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
