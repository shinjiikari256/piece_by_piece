import type { MouseEventHandler } from "react";
import { Icon, type IconName } from "../ui/kit/icons";

/** Кнопка-иконка в строке дела; подпись — в подсказке и для скринридеров. */
export function CaseIconButton({ icon, label, onClick, primary, danger }: { icon: IconName; label: string; onClick: MouseEventHandler<HTMLButtonElement>; primary?: boolean; danger?: boolean }) {
  return (
    <button className={`btn btn--icon${primary ? " btn--primary" : ""}${danger ? " btn--danger" : ""}`} aria-label={label} title={label} onClick={onClick}>
      <Icon name={icon} size={16} />
    </button>
  );
}
