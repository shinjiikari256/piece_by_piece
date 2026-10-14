import { useEffect, useRef } from "react";
import { CHAR_H, CHAR_W, LOOKS, LOOK_NAMES, SPRITES, SPRITE_NAMES, drawCharacter, type Look } from "../game/art";

/** Картинка облика или предмета, нарисованная тем же кодом, что и в игре. */
export function ArtThumb({ kind, id, scale = 2, look }: { kind: "look" | "sprite"; id: string; scale?: number; look?: Look }) {
  const lookKey = look ? JSON.stringify(look) : "";
  const ref = useRef<HTMLCanvasElement>(null);
  const w = kind === "look" ? CHAR_W : (SPRITES[id as keyof typeof SPRITES]?.w ?? 16);
  const h = kind === "look" ? CHAR_H : (SPRITES[id as keyof typeof SPRITES]?.h ?? 16);
  useEffect(() => {
    const ctx = ref.current?.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, w, h);
    if (kind === "look") {
      const l = look ?? LOOKS[id as keyof typeof LOOKS];
      if (l) drawCharacter(ctx, l, "idle", 0);
    } else SPRITES[id as keyof typeof SPRITES]?.draw(ctx);
  }, [kind, id, w, h, lookKey]); // eslint-disable-line react-hooks/exhaustive-deps
  return <canvas ref={ref} width={w} height={h} className="art-thumb" style={{ width: w * scale, height: h * scale }} />;
}

/** Выбор плитками с картинками. */
export function TilePicker({
  kind,
  ids,
  value,
  onChange,
  names,
  taken = [],
}: {
  kind: "look" | "sprite";
  ids: string[];
  value: string | null;
  onChange: (id: string) => void;
  names?: Record<string, string>;
  /** Уже занятые варианты (например, облики других персонажей дела). */
  taken?: string[];
}) {
  const labels = names ?? (kind === "look" ? LOOK_NAMES : SPRITE_NAMES);
  return (
    <div className={`tiles-picker tiles-picker--${kind}`} role="listbox">
      {ids.map((id) => (
        <button
          key={id}
          type="button"
          role="option"
          aria-selected={id === value}
          className={`tile-pick ${taken.includes(id) && id !== value ? "is-taken" : ""}`}
          data-selected={id === value || undefined}
          onClick={() => onChange(id)}
          title={`${labels[id] ?? id} (${id})${taken.includes(id) && id !== value ? " — уже занят в этом деле" : ""}`}
        >
          <span className="tile-pick__art">
            <ArtThumb kind={kind} id={id} scale={kind === "look" ? 3 : 2} />
          </span>
          <span className="tile-pick__label">{labels[id] ?? id}</span>
        </button>
      ))}
    </div>
  );
}
