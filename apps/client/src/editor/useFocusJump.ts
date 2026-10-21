import { useEffect, useRef } from "react";
import { useEditor, type Focus } from "./state";

/** Переход к объекту с ошибкой: при каждом новом `focus` (из `editor.goto`) вызывает `jump`. Обработчик всегда актуальный. */
export function useFocusJump(jump: (focus: Focus) => void) {
  const focus = useEditor((s) => s.focus);
  const latest = useRef(jump);
  latest.current = jump;
  useEffect(() => {
    if (focus) latest.current(focus);
  }, [focus]);
}
