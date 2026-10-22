import "./zoom-control.css";
import { Icon } from "./icons";

/** Шаг переключателя в процентах: мелкий, чтобы подобрать крупность поля. */
const STEP_PERCENT = 10;

/**
 * Следующий масштаб в шаговом переключателе. Если текущий не кратен шагу (например, «вписать» дало 137%),
 * «+» идёт к ближайшему кратному выше, «−» — к ближайшему кратному ниже; граница — min и max.
 * Считаем в целых процентах, чтобы шаг 0.1 не давал ошибок плавающей точки.
 */
export function stepZoom(current: number, dir: 1 | -1, min: number, max: number): number {
  const p = Math.round(current * 100);
  if (dir > 0) {
    if (current >= max) return current;
    const next = (Math.floor(p / STEP_PERCENT) + 1) * STEP_PERCENT;
    return Math.min(Math.round(max * 100), next) / 100;
  }
  if (current <= min) return current;
  const prev = (Math.ceil(p / STEP_PERCENT) - 1) * STEP_PERCENT;
  return Math.max(Math.round(min * 100), prev) / 100;
}

/**
 * Масштаб «− значение +» и отдельно «вписать». Одинаков в игре (полоска над полем) и в редакторе карты.
 * `fitted` — режим «вписать» нажат; `valueText` — что показать между кнопками.
 */
export function ZoomControl({
  label,
  value,
  min,
  max,
  fitted,
  valueText,
  onStep,
  onFit,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  fitted: boolean;
  valueText: string;
  onStep: (dir: 1 | -1) => void;
  onFit: () => void;
}) {
  const down = stepZoom(value, -1, min, max);
  const up = stepZoom(value, 1, min, max);
  return (
    <div className="zoom-control" role="group" aria-label={label}>
      <button className="btn btn--sm btn--icon zoom-control__step" onClick={() => onStep(-1)} disabled={down === value} aria-label="Уменьшить масштаб">
        −
      </button>
      <span className="zoom-control__value" aria-live="polite">
        {valueText}
      </span>
      <button className="btn btn--sm btn--icon zoom-control__step" onClick={() => onStep(1)} disabled={up === value} aria-label="Увеличить масштаб">
        +
      </button>
      <button className="btn btn--sm btn--icon zoom-control__fit" aria-pressed={fitted} onClick={onFit} aria-label="Вписать в экран" title="Вписать: вся карта на экране">
        <Icon name="fit" size={14} />
      </button>
    </div>
  );
}
