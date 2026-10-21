/**
 * Данные, вшитые в офлайн-файл тегами `<script type="application/json" id="…">`.
 * Без глобалов Vite (`__GAME_VERSION__` и т. п.): этот файл тянет за собой и проверка дел при экспорте, которая идёт на Node.
 */

// `?.`: на Node `import.meta.env` нет
/** Офлайн-игра без конструктора: встроенные спрайты приходят из файла, в шаблоне их нет (см. `embedSprites`). */
export const OFFLINE_GAME = import.meta.env?.MODE === "offline";

/** JSON из тега с этим id; тега нет или он не читается — null. */
export function readEmbedded<T>(id: string): T | null {
  try {
    const el = typeof document === "undefined" ? null : document.getElementById(id);
    return el?.textContent ? (JSON.parse(el.textContent) as T) : null;
  } catch {
    return null;
  }
}

/** Встроенные спрайты, вшитые в офлайн-игру (`id="sprites"`): ключ → описание. */
export function embeddedSprites(): Record<string, unknown> | null {
  return readEmbedded<Record<string, unknown>>("sprites");
}
