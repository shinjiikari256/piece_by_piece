import { useState, type InputHTMLAttributes } from "react";
import { Icon } from "./icons";
import "./password-input.css";

/** Поле пароля с кнопкой-«глазиком», показывающей введённое. */
export function PasswordInput(props: Omit<InputHTMLAttributes<HTMLInputElement>, "type">) {
  const [shown, setShown] = useState(false);
  return (
    <div className="pw">
      <input {...props} className="input" type={shown ? "text" : "password"} />
      <button type="button" className="btn btn--icon btn--sm pw__toggle" aria-pressed={shown} aria-label={shown ? "Скрыть пароль" : "Показать пароль"} title={shown ? "Скрыть пароль" : "Показать пароль"} onClick={() => setShown(!shown)}>
        <Icon name={shown ? "dim" : "eye"} />
      </button>
    </div>
  );
}
