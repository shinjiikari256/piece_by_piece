import { formatDate } from "../../util/format";
import { mixColors } from "../../util/colors";
import { APP_NAME } from "../../env";
import { C, PAGE_H, PAGE_W, Tone, centered, diamond, divider, font, paper, spaced, toneColor } from "./common";

// ---------- Грамота ----------

export interface CertificateData {
  name: string;
  group?: string;
  caseNumber: string;
  caseTitle: string;
  total: number;
  max: number;
  grade: string;
  tone: Tone;
  date: Date;
}

/** Гильоширная лента между двумя рамками — как на бланках. */
function guilloche(ctx: CanvasRenderingContext2D, inset: number, band: number) {
  const x0 = inset;
  const y0 = inset;
  const w = PAGE_W - inset * 2;
  const h = PAGE_H - inset * 2;
  const perimeter = 2 * (w + h);
  const at = (t: number): [number, number, number, number] => {
    // точка на прямоугольнике и внутренняя нормаль
    let d = t * perimeter;
    if (d < w) return [x0 + d, y0, 0, 1];
    d -= w;
    if (d < h) return [x0 + w, y0 + d, -1, 0];
    d -= h;
    if (d < w) return [x0 + w - d, y0 + h, 0, -1];
    d -= w;
    return [x0, y0 + h - d, 1, 0];
  };
  ctx.lineWidth = 1.6;
  for (const [phase, color] of [
    [0, C.goldLight],
    [Math.PI, C.gold],
  ] as const) {
    ctx.strokeStyle = color;
    ctx.beginPath();
    const steps = 4000;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const [x, y, nx, ny] = at(t);
      const off = band / 2 + (band / 2 - 4) * Math.sin(t * Math.PI * 2 * 140 + phase);
      if (i === 0) ctx.moveTo(x + nx * off, y + ny * off);
      else ctx.lineTo(x + nx * off, y + ny * off);
    }
    ctx.stroke();
  }
}

/** Весы правосудия — эмблема над заголовком. */
function scales(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(s, s);
  ctx.strokeStyle = C.goldDark;
  ctx.fillStyle = C.goldDark;
  ctx.lineWidth = 4;
  ctx.lineCap = "round";
  // стойка и основание
  ctx.beginPath();
  ctx.moveTo(0, -60);
  ctx.lineTo(0, 52);
  ctx.moveTo(-34, 56);
  ctx.lineTo(34, 56);
  ctx.stroke();
  diamond(ctx, 0, -66, 7);
  // коромысло
  ctx.beginPath();
  ctx.moveTo(-70, -40);
  ctx.lineTo(70, -40);
  ctx.stroke();
  // чаши на нитях
  for (const x of [-70, 70]) {
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, -40);
    ctx.lineTo(x - 24, 8);
    ctx.moveTo(x, -40);
    ctx.lineTo(x + 24, 8);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x - 30, 8);
    ctx.quadraticCurveTo(x, 34, x + 30, 8);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

/** Лавровая ветвь: листья вдоль дуги. */
function laurel(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, from: number, to: number, color: string) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(cx, cy, r, from, to, to < from);
  ctx.stroke();
  const n = 9;
  for (let i = 1; i <= n; i++) {
    const a = from + ((to - from) * i) / (n + 1);
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    const tangent = a + (to > from ? Math.PI / 2 : -Math.PI / 2);
    for (const side of [-0.6, 0.6]) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(tangent + side);
      ctx.beginPath();
      ctx.ellipse(0, -16, 7, 18, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }
  ctx.restore();
}

/** Круглая печать с баллами. */
function seal(ctx: CanvasRenderingContext2D, x: number, y: number, total: number, max: number, color: string) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-0.16);
  ctx.globalAlpha = 0.92;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.arc(0, 0, 140, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(0, 0, 118, 0, Math.PI * 2);
  ctx.stroke();
  const label = "ДЕЛО РАСКРЫТО ✦ ДЕЛО РАСКРЫТО ✦ ";
  ctx.font = font(700, 24);
  ctx.textAlign = "center";
  const step = (Math.PI * 2) / label.length;
  [...label].forEach((ch, i) => {
    ctx.save();
    ctx.rotate(i * step);
    ctx.translate(0, -92);
    ctx.fillText(ch, 0, 0);
    ctx.restore();
  });
  ctx.textBaseline = "middle";
  ctx.font = font(400, 76, "PT Mono");
  ctx.fillText(String(total), 0, -6);
  ctx.font = font(400, 30, "PT Mono");
  ctx.fillText(`из ${max}`, 0, 46);
  ctx.restore();
}

export function drawCertificate(canvas: HTMLCanvasElement, d: CertificateData) {
  canvas.width = PAGE_W;
  canvas.height = PAGE_H;
  const ctx = canvas.getContext("2d")!;
  ctx.textBaseline = "alphabetic";
  paper(ctx);

  // рамка: внешняя линия, гильоширная лента, внутренняя линия
  ctx.strokeStyle = C.gold;
  ctx.lineWidth = 10;
  ctx.strokeRect(60, 60, PAGE_W - 120, PAGE_H - 120);
  guilloche(ctx, 72, 44);
  ctx.strokeStyle = C.gold;
  ctx.lineWidth = 3;
  ctx.strokeRect(126, 126, PAGE_W - 252, PAGE_H - 252);
  ctx.fillStyle = C.gold;
  for (const [x, y] of [
    [126, 126],
    [PAGE_W - 126, 126],
    [126, PAGE_H - 126],
    [PAGE_W - 126, PAGE_H - 126],
  ])
    diamond(ctx, x, y, 16);

  const width = PAGE_W - 440;
  scales(ctx, PAGE_W / 2, 290, 1.25);

  ctx.fillStyle = C.goldDark;
  ctx.font = font(700, 32);
  ctx.textAlign = "center";
  spaced(ctx, 10, () => ctx.fillText(`УЧЕБНАЯ ИГРА «${APP_NAME.toUpperCase()}»`, PAGE_W / 2, 440));

  // заголовок — золотом с лёгкой тенью
  const title = ctx.createLinearGradient(0, 470, 0, 650);
  title.addColorStop(0, mixColors(C.gold, "#ffffff", 0.15));
  title.addColorStop(0.5, C.goldDark);
  title.addColorStop(1, C.gold);
  ctx.save();
  ctx.shadowColor = C.shadow;
  ctx.shadowOffsetY = 6;
  ctx.shadowBlur = 8;
  ctx.fillStyle = title;
  ctx.font = font(700, 190);
  spaced(ctx, 30, () => ctx.fillText("ГРАМОТА", PAGE_W / 2 + 15, 650));
  ctx.restore();
  divider(ctx, 735, 400);

  ctx.fillStyle = C.soft;
  ctx.font = font(400, 56);
  ctx.fillText("награждается", PAGE_W / 2, 860);

  ctx.fillStyle = C.accent;
  ctx.font = font(700, 104);
  let y = centered(ctx, d.name.trim() || "Дознаватель", 1000, width, 120);
  if (d.group?.trim()) {
    ctx.fillStyle = C.soft;
    ctx.font = font(400, 48);
    ctx.fillText(`группа ${d.group.trim()}`, PAGE_W / 2, y - 6);
    y += 46;
  }

  ctx.fillStyle = C.ink;
  ctx.font = font(400, 54);
  y = centered(ctx, "за успешное расследование дела", y + 90, width, 68);
  ctx.font = font(700, 72);
  y = centered(ctx, `№${d.caseNumber} «${d.caseTitle}»`, y + 18, width, 88);

  divider(ctx, y + 20, 240);

  // подвал: дата и подпись слева, печать в лавровой ветви справа
  const baseY = PAGE_H - 400;
  ctx.textAlign = "left";
  ctx.fillStyle = C.ink;
  ctx.font = font(400, 44);
  ctx.fillText(formatDate(d.date), 240, baseY - 70);
  ctx.strokeStyle = C.soft;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(240, baseY - 46);
  ctx.lineTo(720, baseY - 46);
  ctx.moveTo(240, baseY + 80);
  ctx.lineTo(720, baseY + 80);
  ctx.stroke();
  ctx.fillStyle = C.muted;
  ctx.font = font(400, 32);
  ctx.fillText("дата", 240, baseY - 8);
  ctx.fillText("подпись наставника", 240, baseY + 118);

  // печать с баллами — крупно, в лавровых ветвях; ветви одинаковые: правая — зеркало левой
  const sx = PAGE_W - 480;
  const sy = baseY - 110;
  ctx.save();
  ctx.translate(sx, sy);
  ctx.scale(1.4, 1.4);
  ctx.translate(-sx, -sy);
  laurel(ctx, sx, sy, 182, Math.PI * 0.62, Math.PI * 1.32, C.gold);
  ctx.save();
  ctx.translate(sx * 2, 0);
  ctx.scale(-1, 1);
  laurel(ctx, sx, sy, 182, Math.PI * 0.62, Math.PI * 1.32, C.gold);
  ctx.restore();
  seal(ctx, sx, sy, d.total, d.max, toneColor(d.tone));
  ctx.restore();

  ctx.textAlign = "center";
  ctx.fillStyle = C.muted;
  ctx.font = font(400, 28);
  ctx.fillText("Документ сформирован игрой и не является официальным", PAGE_W / 2, PAGE_H - 165);
}
