import { useEffect, useMemo, useRef, useState } from "react";
import { Select } from "../../ui/kit/Select";
import { SPRITES, drawSprite } from "../../game/art";
import { clipFrameAt, loopFrameAt } from "../../../../../shared/object-anim";
import type { ClipStep, LocationObject } from "../../../../../shared/case";

const SCALE = 4;

/** Что можно проиграть в предпросмотре: кадр, цикл состояния, переход, действие или таймер. */
export function previewSources(o: LocationObject): { id: string; label: string; frame?: string; clip?: ClipStep[]; pauseMs?: number; loop?: boolean }[] {
  const out: ReturnType<typeof previewSources> = [{ id: "frame:default", label: "Кадр по умолчанию", frame: "default" }];
  (o.states ?? []).forEach((st) => {
    out.push({ id: `state:${st.id}`, label: `Состояние «${st.id}»`, frame: st.frame ?? "default" });
    if (st.loop) out.push({ id: `loop:${st.id}`, label: `Цикл «${st.id}»`, frame: st.frame ?? "default", clip: st.loop.clip, pauseMs: st.loop.pauseMs, loop: true });
  });
  o.transitions?.forEach((t, i) => out.push({ id: `tr:${i}`, label: `Переход ${t.from} → ${t.to}`, clip: t.clip }));
  o.actions?.forEach((a, i) => out.push({ id: `ac:${i}`, label: `Действие №${i + 1}`, clip: a.clip }));
  o.timers?.forEach((t, i) => out.push({ id: `ti:${i}`, label: `Таймер №${i + 1}`, clip: t.clip }));
  return out;
}

/** Предпросмотр кадров и клипов предмета в масштабе ×4; разовые клипы повторяются с паузой. */
export function AnimPreview({ object }: { object: LocationObject }) {
  const sources = useMemo(() => previewSources(object), [object]);
  const [sel, setSel] = useState("frame:default");
  const src = sources.find((s) => s.id === sel) ?? sources[0];
  const canvas = useRef<HTMLCanvasElement>(null);
  const spec = SPRITES[object.sprite];
  useEffect(() => {
    const c = canvas.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx || !spec) return;
    const base = src.frame ?? "default";
    const paint = (frame: string) => {
      ctx.clearRect(0, 0, c.width, c.height);
      ctx.save();
      ctx.scale(SCALE, SCALE);
      drawSprite(ctx, spec, spec.frames[frame] ? frame : "default");
      ctx.restore();
    };
    paint(base);
    if (!src.clip) return;
    const clip = src.clip;
    const total = clip.reduce((s, x) => s + x.ms, 0);
    const start = performance.now();
    const id = window.setInterval(() => {
      const t = performance.now() - start;
      const frame = src.loop ? loopFrameAt({ clip, pauseMs: src.pauseMs }, t) : clipFrameAt(clip, t % (total + 600));
      paint(frame ?? base);
    }, 40);
    return () => window.clearInterval(id);
  }, [src, spec]);
  if (!spec) return null;
  return (
    <div className="stack anim-preview">
      <Select value={src.id} options={sources.map((s) => ({ value: s.id, label: s.label }))} onChange={setSel} />
      <canvas aria-hidden="true" ref={canvas} width={spec.w * SCALE} height={spec.h * SCALE} className="anim-preview__canvas" />
    </div>
  );
}
