import { useId, useRef, type FormEvent, type ReactNode } from "react";
import { useEscape, useFocusTrap } from "../lib/hooks";

/**
 * Затемнённая подложка под окном. `layer="window"` — окна игры и сайта, `layer="dialog"` — диалоги поверх них;
 * `align="end"` — окно прижато к низу (разговор). `onDismiss` — клик мимо окна.
 */
export function Backdrop({ layer = "window", align, onDismiss, children }: { layer?: "window" | "dialog"; align?: "end"; onDismiss?: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref);
  return (
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions -- клик по подложке — дублирует Esc/крестик
    <div ref={ref} tabIndex={-1} className="backdrop" data-layer={layer} data-align={align} onMouseDown={(e) => e.target === e.currentTarget && onDismiss?.()}>
      {children}
    </div>
  );
}

/**
 * Небольшое диалоговое окно: заголовок, содержимое, ряд кнопок. Esc и клик мимо вызывают `onClose`
 * (без `onClose` окно закрыть нельзя — например, обязательная смена пароля); `onSubmit` делает окно формой.
 */
export function Dialog({
  title,
  onClose,
  onSubmit,
  actions,
  role = "dialog",
  className = "",
  children,
}: {
  title: ReactNode;
  onClose?: () => void;
  onSubmit?: (e: FormEvent<HTMLFormElement>) => void;
  actions?: ReactNode;
  role?: "dialog" | "alertdialog";
  className?: string;
  children?: ReactNode;
}) {
  const titleId = useId();
  useEscape(() => onClose?.(), !!onClose);
  const content = (
    <>
      <h3 id={titleId}>{title}</h3>
      {children}
      {actions && <div className="dialog__actions">{actions}</div>}
    </>
  );
  const props = { className: `dialog paper ${className}`, role, "aria-modal": true, "aria-labelledby": titleId } as const;
  return (
    <Backdrop layer="dialog" onDismiss={onClose}>
      {onSubmit ? (
        <form {...props} onSubmit={onSubmit}>
          {content}
        </form>
      ) : (
        <section {...props}>{content}</section>
      )}
    </Backdrop>
  );
}
