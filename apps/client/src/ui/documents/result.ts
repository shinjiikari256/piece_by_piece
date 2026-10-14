import { formatDate, percentOf } from "../../util/format";
import { APP_NAME } from "../../env";
import { C, PAGE_H, PAGE_W, Tone, centered, divider, font, spaced, toneColor, wrap } from "./common";

// ---------- Результат прохождения ----------

export interface ResultDocData {
  name: string;
  group?: string;
  login?: string;
  caseNumber: string;
  caseTitle: string;
  total: number;
  max: number;
  grade: string;
  tone: Tone;
  date: Date;
  minutes: number | null;
  hintsUsed: number;
  /** Сколько баллов сняли за подсказки. */
  hintPenalty: number;
  wrongDeductions: number;
  timeBonus: string | null;
  sections: { label: string; points: number; max: number }[];
  answers: { prompt: string; points: number; max: number; chosen: { label: string; good: boolean; text: string }[] }[];
  gameVersion: string;
  /** Откуда выдан: игра и учётная запись / офлайн. */
  source: string;
}

const M = 150;
const CONTENT_W = PAGE_W - M * 2;
const BOTTOM = PAGE_H - 200;

function rounded(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, fill?: string, stroke?: string) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 3;
    ctx.stroke();
  }
}

const tonePct = (pct: number): Tone => (pct >= 65 ? "good" : pct >= 40 ? "warn" : "bad");

function resultPage(pages: HTMLCanvasElement[]): CanvasRenderingContext2D {
  const c = document.createElement("canvas");
  c.width = PAGE_W;
  c.height = PAGE_H;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = C.paper;
  ctx.fillRect(0, 0, PAGE_W, PAGE_H);
  ctx.fillStyle = C.gold;
  ctx.fillRect(0, 0, PAGE_W, 20);
  ctx.textBaseline = "alphabetic";
  pages.push(c);
  return ctx;
}

/** Шапка листа: слева — игра, справа — когда пройдено; ниже — спокойный заголовок листа. */
function resultHead(ctx: CanvasRenderingContext2D, d: ResultDocData, title: string): number {
  ctx.textAlign = "left";
  ctx.fillStyle = C.goldDark;
  ctx.font = font(700, 28);
  spaced(ctx, 6, () => ctx.fillText(`УЧЕБНАЯ ИГРА «${APP_NAME.toUpperCase()}»${d.source ? ` · ${d.source.toUpperCase()}` : ""}`, M, 140));
  ctx.textAlign = "right";
  ctx.fillStyle = C.muted;
  ctx.font = font(400, 30);
  ctx.fillText(formatDate(d.date, true), PAGE_W - M, 140);
  ctx.strokeStyle = C.line;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(M, 172);
  ctx.lineTo(PAGE_W - M, 172);
  ctx.stroke();
  ctx.textAlign = "left";
  ctx.fillStyle = C.soft;
  ctx.font = font(400, 40);
  ctx.fillText(title, M, 250);
  return 300;
}

/** Название дела — главный заголовок листа (номер — в строке над ним). */
export function caseTitle(ctx: CanvasRenderingContext2D, d: ResultDocData, y: number, size: number, center = false): number {
  ctx.textAlign = center ? "center" : "left";
  ctx.fillStyle = C.ink;
  ctx.font = font(700, size);
  const lines = wrap(ctx, `«${d.caseTitle}»`, CONTENT_W);
  lines.forEach((l, i) => ctx.fillText(l, center ? PAGE_W / 2 : M, y + size * (i + 1)));
  return y + size * lines.length + size * 0.35;
}

/** Плашка-штамп с суммой баллов. */
function scorePlaque(ctx: CanvasRenderingContext2D, d: ResultDocData, right: number, baseline: number) {
  const color = toneColor(d.tone);
  ctx.font = font(400, 84, "PT Mono");
  const tw = ctx.measureText(String(d.total)).width;
  ctx.font = font(400, 40, "PT Mono");
  const mw = ctx.measureText(`/${d.max}`).width;
  const w = tw + mw + 70;
  const h = 120;
  const x = right - w;
  const y = baseline - 90;
  ctx.save();
  ctx.translate(x + w / 2, y + h / 2);
  ctx.rotate(-0.04);
  ctx.strokeStyle = color;
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.roundRect(-w / 2, -h / 2, w, h, 18);
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.font = font(400, 84, "PT Mono");
  ctx.fillText(String(d.total), -w / 2 + 35, 4);
  ctx.font = font(400, 40, "PT Mono");
  ctx.fillText(`/${d.max}`, -w / 2 + 35 + tw, 22);
  ctx.restore();
  ctx.textBaseline = "alphabetic";
}

/** Рисует результат: первый лист — сводка, дальше — ответы. Возвращает холсты страниц. */
export function drawResultPages(d: ResultDocData): HTMLCanvasElement[] {
  const pages: HTMLCanvasElement[] = [];

  // ---------- Лист 1: сводка ----------
  let ctx = resultPage(pages);
  let y = resultHead(ctx, d, `Результат расследования дела №${d.caseNumber}`);
  y = caseTitle(ctx, d, y, 104, true);

  // «выдан» — как в грамоте: по центру, без рамки, с разделителями
  divider(ctx, y + 10, 300);
  ctx.textAlign = "center";
  ctx.fillStyle = C.soft;
  ctx.font = font(400, 44);
  ctx.fillText("выдан", PAGE_W / 2, y + 110);
  ctx.fillStyle = C.accent;
  ctx.font = font(700, 84);
  y = centered(ctx, d.name.trim() || "—", y + 215, CONTENT_W - 100, 98);
  if (d.group?.trim()) {
    ctx.fillStyle = C.soft;
    ctx.font = font(400, 44);
    ctx.fillText(`группа ${d.group.trim()}`, PAGE_W / 2, y - 18);
    y += 44;
  }
  divider(ctx, y + 10, 300);
  y += 150;

  // разделы решения: заголовок слева, сумма — плашкой справа
  ctx.textAlign = "left";
  ctx.fillStyle = C.ink;
  ctx.font = font(700, 54);
  ctx.fillText("По разделам решения", M, y);
  scorePlaque(ctx, d, M + CONTENT_W, y);
  y += 50;
  for (const s of d.sections) {
    const pct = percentOf(s.points, s.max);
    ctx.font = font(400, 38);
    ctx.fillStyle = C.ink;
    ctx.textAlign = "left";
    ctx.fillText(s.label, M, y + 50);
    ctx.textAlign = "right";
    ctx.font = font(400, 36, "PT Mono");
    ctx.fillText(`${s.points}/${s.max}`, M + CONTENT_W, y + 50);
    rounded(ctx, M, y + 78, CONTENT_W, 30, 15, C.paperEdge);
    if (s.points > 0) rounded(ctx, M, y + 78, Math.max(30, (CONTENT_W * s.points) / Math.max(1, s.max)), 30, 15, toneColor(tonePct(pct)));
    y += 140;
  }
  y += 20;

  // бонусы и штрафы
  const tiles: { label: string; value: string; color: string }[] = [
    { label: "Бонус за время", value: d.timeBonus ?? "—", color: d.timeBonus?.startsWith("+") ? C.good : C.ink },
    { label: "Штраф за подсказки", value: d.hintPenalty > 0 ? `−${d.hintPenalty}` : "0", color: d.hintPenalty > 0 ? C.bad : C.ink },
    // ошибки сопоставлений баллы не снимают — в документ не выводим (они есть в статистике)
    { label: "Время прохождения", value: d.minutes == null ? "—" : `${d.minutes} мин`, color: C.ink },
  ];
  const gap = 30;
  const tw = (CONTENT_W - gap * (tiles.length - 1)) / tiles.length;
  tiles.forEach((t, i) => {
    const x = M + i * (tw + gap);
    rounded(ctx, x, y, tw, 210, 22, C.surface, C.line);
    ctx.textAlign = "left";
    ctx.fillStyle = t.color;
    ctx.font = font(700, 60);
    ctx.fillText(t.value, x + 32, y + 92);
    ctx.fillStyle = C.muted;
    ctx.font = font(400, 28);
    wrap(ctx, t.label, tw - 60).forEach((l, j) => ctx.fillText(l, x + 32, y + 150 + j * 34));
  });

  // ---------- Ответы ----------
  ctx = resultPage(pages);
  y = resultHead(ctx, d, `Ответы по делу №${d.caseNumber}`);
  y = caseTitle(ctx, d, y, 72) + 20;
  for (const a of d.answers) {
    // высота карточки — заранее, чтобы не рвать её между листами
    ctx.font = font(700, 40);
    const promptLines = wrap(ctx, a.prompt, CONTENT_W - 330);
    ctx.font = font(400, 34);
    const chosen = a.chosen.length ? a.chosen : [{ label: "Нет ответа.", good: false, text: "" }];
    const chosenLines = chosen.map((c) => wrap(ctx, `${c.label}${c.text ? ` — ${c.text}` : ""}`, CONTENT_W - 170));
    const h = 60 + promptLines.length * 52 + 14 + chosenLines.reduce((n, ls) => n + ls.length * 46 + 14, 0);
    if (y + h > BOTTOM) {
      ctx = resultPage(pages);
      y = resultHead(ctx, d, `Ответы по делу №${d.caseNumber} — продолжение`);
      y = caseTitle(ctx, d, y, 72) + 20;
    }
    const ok = a.points >= a.max && a.max > 0;
    const partial = a.points > 0 && !ok;
    const stripe = ok ? C.good : partial ? C.warn : C.bad;
    rounded(ctx, M, y, CONTENT_W, h, 22, C.surface, C.line);
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(M, y, CONTENT_W, h, 22);
    ctx.clip();
    ctx.fillStyle = stripe;
    ctx.fillRect(M, y, 14, h);
    ctx.restore();
    // баллы — плашкой справа
    const badge = `${a.points}/${a.max}`;
    ctx.font = font(400, 36, "PT Mono");
    const bw = ctx.measureText(badge).width + 44;
    rounded(ctx, M + CONTENT_W - bw - 30, y + 30, bw, 58, 29, ok ? C.good : partial ? C.warn : C.bad);
    ctx.fillStyle = C.onDark;
    ctx.textAlign = "center";
    ctx.fillText(badge, M + CONTENT_W - 30 - bw / 2, y + 71);
    // вопрос
    ctx.textAlign = "left";
    ctx.fillStyle = C.ink;
    ctx.font = font(700, 40);
    let cy = y + 76;
    promptLines.forEach((l) => {
      ctx.fillText(l, M + 60, cy);
      cy += 52;
    });
    cy += 14;
    chosen.forEach((c, i) => {
      ctx.font = font(700, 34);
      ctx.fillStyle = a.chosen.length ? (c.good ? C.good : C.bad) : C.muted;
      ctx.fillText(a.chosen.length ? (c.good ? "✓" : "✗") : "—", M + 60, cy);
      ctx.font = font(400, 34);
      chosenLines[i].forEach((l) => {
        ctx.fillText(l, M + 110, cy);
        cy += 46;
      });
      cy += 14;
    });
    y += h + 28;
  }

  // колонтитул — только номер страницы
  pages.forEach((page, i) => {
    const c = page.getContext("2d")!;
    c.font = font(400, 30);
    c.fillStyle = C.muted;
    c.textAlign = "center";
    c.fillText(`${i + 1} / ${pages.length}`, PAGE_W / 2, PAGE_H - 90);
  });
  return pages;
}
