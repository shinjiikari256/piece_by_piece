import type { KeyboardEvent } from "react";

/** `onKeyDown` для поля, которое применяет значение при уходе фокуса: Enter просто убирает фокус. */
export const blurOnEnter = (e: KeyboardEvent<HTMLInputElement>) => {
  if (e.key === "Enter") e.currentTarget.blur();
};
