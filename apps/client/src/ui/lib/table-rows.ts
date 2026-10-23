import type { KeyboardEvent } from "react";

/**
 * Клавиатура для строки-ссылки таблицы (`tr.is-link`): в Tab попадает только первая строка (`first`),
 * дальше по строкам ходят ↑ / ↓ (`useArrowNav` с `within`); Enter открывает строку, пробел — `onSpace` (по умолчанию то же).
 * Реагирует только на нажатия на самой строке, не на кнопки и ссылки внутри неё.
 */
export function rowKeys(first: boolean, open: () => void, onSpace: () => void = open) {
  return {
    tabIndex: first ? 0 : -1,
    onKeyDown(e: KeyboardEvent<HTMLElement>) {
      if (e.target !== e.currentTarget || e.repeat) return;
      if (e.key === "Enter") {
        e.preventDefault();
        open();
      } else if (e.key === " ") {
        e.preventDefault();
        onSpace();
      }
    },
  };
}

export const ROW = "tr.is-link";
