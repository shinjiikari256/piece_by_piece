import { useEffect, useState, type ChangeEvent, type KeyboardEvent } from "react";

/**
 * Поле с черновиком: набор идёт в локальный текст, применяется по Enter и уходу с поля,
 * Esc возвращает прежнее значение. `commit` сам решает, принять ли текст (и вернуть ли `value`).
 */
export function useDraftField(value: string, commit: (next: string) => void | Promise<void>, normalize: (s: string) => string = (s) => s) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  const apply = () => void commit(text);
  return {
    text,
    setText,
    inputProps: {
      value: text,
      onChange: (e: ChangeEvent<HTMLInputElement>) => setText(normalize(e.target.value)),
      onBlur: apply,
      onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter") apply();
        if (e.key === "Escape") setText(value);
      },
    },
  };
}
