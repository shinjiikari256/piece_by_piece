import "./contextmenu.css";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useWindowKey } from "../lib/hooks";
import { Icon, type IconName } from "./icons";

export type MenuItem = { label: string; icon?: IconName; hint?: string; disabled?: boolean; danger?: boolean; run: () => void } | "sep";

/** Что под курсором: элемент и выделенный текст на момент клика. */
export interface MenuContext {
  target: Element;
  selection: string;
}

/** Поля ввода оставляем с родным меню браузера — там нужны «Вставить» и проверка орфографии. */
const NATIVE = "input, textarea, [contenteditable]";

/**
 * Своё контекстное меню вместо браузерного: по правой кнопке (и долгому нажатию на телефоне)
 * показывает команды, собранные build() для места клика.
 */
export function ContextMenu({ build }: { build: (ctx: MenuContext) => MenuItem[] }) {
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const [active, setActive] = useState(-1);
  const ref = useRef<HTMLDivElement>(null);
  const buildRef = useRef(build);
  buildRef.current = build;

  useEffect(() => {
    const onMenu = (e: MouseEvent) => {
      const target = e.target instanceof Element ? e.target : null;
      if (!target || target.closest(NATIVE)) return;
      e.preventDefault();
      const selection = window.getSelection()?.toString().trim() ?? "";
      const items = trimSeparators(buildRef.current({ target, selection }));
      setActive(-1);
      setPos(null);
      setMenu(items.length ? { x: e.clientX, y: e.clientY, items } : null);
    };
    document.addEventListener("contextmenu", onMenu);
    return () => document.removeEventListener("contextmenu", onMenu);
  }, []);

  useEffect(() => {
    if (!menu) return;
    const close = (e: Event) => {
      if (e.type === "mousedown" && ref.current?.contains(e.target as Node)) return;
      setMenu(null);
    };
    window.addEventListener("mousedown", close);
    window.addEventListener("resize", close);
    window.addEventListener("blur", close);
    document.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("resize", close);
      window.removeEventListener("blur", close);
      document.removeEventListener("scroll", close, true);
    };
  }, [menu]);

  useWindowKey(
    (e) => {
      const enabled = menu!.items.map((it, i) => (it !== "sep" && !it.disabled ? i : -1)).filter((i) => i >= 0);
      if (e.key === "Escape") setMenu(null);
      else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        const at = enabled.indexOf(active);
        const step = e.key === "ArrowDown" ? 1 : -1;
        setActive(enabled[(at + step + enabled.length) % enabled.length] ?? -1);
      } else if (e.key === "Enter" && active >= 0) {
        const it = menu!.items[active];
        if (it !== "sep") run(it);
      } else return;
      e.preventDefault();
      e.stopImmediatePropagation();
    },
    { capture: true, enabled: !!menu },
  );

  // не даём меню вылезти за край экрана
  useLayoutEffect(() => {
    if (!menu || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    setPos({
      left: Math.max(4, Math.min(menu.x, window.innerWidth - r.width - 4)),
      top: Math.max(4, menu.y + r.height > window.innerHeight ? menu.y - r.height : menu.y),
    });
  }, [menu]);

  const run = (it: Exclude<MenuItem, "sep">) => {
    setMenu(null);
    it.run();
  };

  if (!menu) return null;
  return (
    // eslint-disable-next-line jsx-a11y/interactive-supports-focus -- фокус и стрелки ведёт useMenuKeys
    <div ref={ref} className="ctx-menu" role="menu" style={{ left: pos?.left ?? menu.x, top: pos?.top ?? menu.y, visibility: pos ? "visible" : "hidden" }} onContextMenu={(e) => e.preventDefault()}>
      {menu.items.map((it, i) =>
        it === "sep" ? (
          <div key={i} className="ctx-menu__sep" role="separator" />
        ) : (
          <button
            key={i}
            role="menuitem"
            className={`ctx-menu__item ${i === active ? "is-active" : ""} ${it.danger ? "is-danger" : ""}`}
            disabled={it.disabled}
            onMouseEnter={() => setActive(i)}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => run(it)}
          >
            <span className="ctx-menu__icon">{it.icon && <Icon name={it.icon} size={15} />}</span>
            <span className="ctx-menu__label ellipsis">{it.label}</span>
            {it.hint && <kbd className="ctx-menu__hint">{it.hint}</kbd>}
          </button>
        ),
      )}
    </div>
  );
}

/** Без разделителей в начале, в конце и подряд. */
function trimSeparators(items: MenuItem[]): MenuItem[] {
  const out: MenuItem[] = [];
  for (const it of items) if (it !== "sep" || (out.length && out[out.length - 1] !== "sep")) out.push(it);
  while (out[out.length - 1] === "sep") out.pop();
  return out;
}

export function copyText(text: string) {
  void navigator.clipboard?.writeText(text).catch(() => undefined);
}
