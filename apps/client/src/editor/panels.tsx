import { useCallback, useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
import { readJson, writeJson } from "../state/storage";

/**
 * Боковые панели конструктора (палитра и инспектор карты, список и реплика диалогов): ширина меняется перетаскиванием
 * границы или стрелками ← / → на ней, панель сворачивается в узкую полосу. Размеры помнятся в браузере.
 * Раскладка — сетка, ширина колонок идёт через `--col-left` / `--col-right` (`panelVars`), сама панель не знает о размерах.
 */

export interface PanelState {
  id: string;
  label: string;
  /** Панель слева, справа или снизу от основного блока: от этого зависит, куда тянуть границу (у нижней `width` — высота). */
  side: "left" | "right" | "bottom";
  width: number;
  min: number;
  max: number;
  collapsed: boolean;
  setWidth: (px: number) => void;
  toggle: () => void;
}

const RAIL = "2.2rem";
/** Стрелки на «таблетках»: свернуть (в сторону края) и развернуть (от края). */
const CHEVRON_CLOSE = { left: "‹", right: "›", bottom: "▾" } as const;
const CHEVRON_OPEN = { left: "›", right: "‹", bottom: "▴" } as const;

export function usePanel(id: string, label: string, side: PanelState["side"], { width, min, max }: { width: number; min: number; max: number }): PanelState {
  const key = `editor:panel:${id}`;
  const [saved, setSaved] = useState(() => readJson<{ w?: number; c?: boolean }>(key, {}));
  const clamp = useCallback((px: number) => Math.round(Math.min(max, Math.max(min, px))), [min, max]);
  const update = (next: { w?: number; c?: boolean }) => {
    setSaved(next);
    writeJson(key, next);
  };
  return {
    id,
    label,
    side,
    width: clamp(saved.w ?? width),
    min,
    max,
    collapsed: !!saved.c,
    setWidth: (px) => update({ ...saved, w: clamp(px) }),
    toggle: () => update({ ...saved, c: !saved.c }),
  };
}

/** Переменные сетки: ширины колонок панелей и высота нижней (свёрнутая — узкая полоса). */
export function panelVars(left?: PanelState, right?: PanelState, bottom?: PanelState): CSSProperties {
  const size = (p: PanelState) => (p.collapsed ? RAIL : `${p.width}px`);
  return {
    ...(left ? { "--col-left": size(left) } : {}),
    ...(right ? { "--col-right": size(right) } : {}),
    ...(bottom ? { "--row-bottom": size(bottom) } : {}),
  } as CSSProperties;
}

/**
 * Граница панели: тянется мышью и пальцем, ← / → меняют ширину (Shift — крупнее), Home / End — наименьшая и наибольшая,
 * Enter или двойной щелчок сворачивает; кнопка-кружок на границе тоже сворачивает. Лежит поверх границы колонок (`position: absolute` от `--col-left` / `--col-right`), в сетке места не занимает.
 */
export function PanelGrip({ panel }: { panel: PanelState }) {
  const drag = useRef<{ x: number; width: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  useEffect(() => {
    if (!dragging) return;
    const cls = panel.side === "bottom" ? "is-resizing-rows" : "is-resizing";
    document.body.classList.add(cls);
    return () => document.body.classList.remove(cls);
  }, [dragging, panel.side]);
  if (panel.collapsed) return null;
  const vertical = panel.side === "bottom"; // граница нижней панели горизонтальная, тянется вверх-вниз
  const sign = panel.side === "left" ? 1 : -1;
  const onDown = (e: PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest("button")) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: vertical ? e.clientY : e.clientX, width: panel.width };
    setDragging(true);
  };
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    if (drag.current) panel.setWidth(drag.current.width + sign * ((vertical ? e.clientY : e.clientX) - drag.current.x));
  };
  const onUp = () => {
    drag.current = null;
    setDragging(false);
  };
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    const step = e.shiftKey ? 64 : 16;
    // стрелка в сторону основного блока расширяет панель, от него — сужает
    const grow = vertical ? "ArrowUp" : panel.side === "left" ? "ArrowRight" : "ArrowLeft";
    const shrink = vertical ? "ArrowDown" : panel.side === "left" ? "ArrowLeft" : "ArrowRight";
    if (e.key === grow) panel.setWidth(panel.width + step);
    else if (e.key === shrink) panel.setWidth(panel.width - step);
    else if (e.key === "Home") panel.setWidth(panel.min);
    else if (e.key === "End") panel.setWidth(panel.max);
    else if (e.key === "Enter") panel.toggle();
    else return;
    e.preventDefault();
    e.stopPropagation();
  };
  return (
    <div
      className="panel-grip"
      data-side={panel.side}
      data-dragging={dragging || undefined}
      role="separator"
      aria-orientation={vertical ? "horizontal" : "vertical"}
      aria-label={`Ширина панели «${panel.label}»`}
      aria-valuemin={panel.min}
      aria-valuemax={panel.max}
      aria-valuenow={panel.width}
      tabIndex={0}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      onDoubleClick={panel.toggle}
      onKeyDown={onKey}
    >
      <button className="panel-grip__toggle" onClick={panel.toggle} title={`Свернуть «${panel.label}»`} aria-label={`Свернуть панель «${panel.label}»`} tabIndex={-1}>
        {CHEVRON_CLOSE[panel.side]}
      </button>
    </div>
  );
}

/** Свёрнутая панель: узкая полоса с названием, клик разворачивает. Занимает место панели в сетке. */
export function PanelRail({ panel }: { panel: PanelState }) {
  return (
    <button className="panel-rail" data-side={panel.side} onClick={panel.toggle} title={`Развернуть «${panel.label}»`} aria-label={`Развернуть панель «${panel.label}»`}>
      <span className="panel-rail__arrow">{CHEVRON_OPEN[panel.side]}</span>
      <span className="panel-rail__label">{panel.label}</span>
    </button>
  );
}
