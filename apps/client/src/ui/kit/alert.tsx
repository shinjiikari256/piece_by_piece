import type { ReactNode } from "react";
import { Icon } from "./icons";

export type AlertTone = "warn" | "bad" | "info";

/** Блок-предупреждение. Тон: `bad` — ошибка, `warn` — внимание, `info` — справка. `icon` — значок сбоку, `title` — жирная строка над текстом,
 * `action` — кнопка справа, `onClick` — весь блок кликабелен (кнопка). */
export function Alert({
  tone = "bad",
  icon,
  title,
  action,
  onClick,
  as: Tag = "p",
  className,
  children,
}: {
  tone?: AlertTone;
  icon?: boolean;
  title?: ReactNode;
  action?: ReactNode;
  onClick?: () => void;
  as?: "p" | "div" | "pre";
  className?: string;
  children: ReactNode;
}) {
  const Root = onClick ? "button" : Tag;
  return (
    <Root
      className={`alert${onClick ? " alert--click" : ""}${className ? ` ${className}` : ""}`}
      data-tone={tone === "info" ? "accent" : tone}
      role={tone === "info" || onClick ? undefined : "alert"}
      {...(onClick ? { type: "button" as const, onClick } : {})}
    >
      {icon && <Icon name="alert" size={16} />}
      {title ? (
        <span className="alert__body">
          <span className="alert__title">{title}</span>
          {Root !== "pre" && <span className="alert__text">{children}</span>}
        </span>
      ) : Root === "pre" ? (
        children
      ) : (
        <span className="alert__text">{children}</span>
      )}
      {action}
    </Root>
  );
}
