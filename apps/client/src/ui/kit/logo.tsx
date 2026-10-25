import { useEffect, useRef } from "react";
import artSvg from "../../assets/logo-detailed.svg?raw";

/**
 * Логотип: доска расследования — три фрагмента-карточки (надорванный угол) в вершинах треугольника,
 * связанные нитью; нить прорисовывается по часовой стрелке от верхней карточки. В покое монохромный (currentColor); при наведении на `.logo` нить прорисовывается,
 * фрагменты получают цвет (стили — `.logo__*` в styles/site/shell.css; без transform, чтобы не мерцало
 * во встроенном браузере VS Code). Тот же рисунок — в favicon (index.html), там он на светлой плашке.
 */

/** Карточка с надорванным верхним правым углом; булавка — в центре верхней кромки. */
const CARD = "M-5.5 0H2.5L5.5 3V12.5H-5.5Z";

const FRAGMENTS = [
  { x: 16, y: 2, tilt: -5, cls: "a" },
  { x: 7.5, y: 17, tilt: -9, cls: "b" },
  { x: 24.5, y: 17, tilt: 7, cls: "c" },
] as const;

export function Logo({ size = 38 }: { size?: number }) {
  return (
    <svg className="logo__svg" viewBox="-3 -2 38 35" width={size} height={(size * 35) / 38} aria-hidden focusable="false">
      <path className="logo__thread" d="M16 2Q29 5 24.5 17Q16 22 7.5 17Q3 5 16 2Z" fill="none" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      {FRAGMENTS.map((f) => (
        <g key={f.cls} transform={`translate(${f.x} ${f.y}) rotate(${f.tilt})`}>
          <path className={`logo__card logo__card--${f.cls}`} d={CARD} strokeWidth="1.3" strokeLinejoin="round" />
          <circle className="logo__pin" cx="0" cy="0" r="1.4" />
        </g>
      ))}
    </svg>
  );
}

/**
 * Большая иллюстрация для главной: папка с делом, три улики на красной нити, штамп.
 * Исходник — `assets/logo-detailed.svg` (самостоятельный файл: при наведении нить прорисовывается,
 * карточки окрашиваются, штамп проявляется; стили зашиты внутри, без transform на hover).
 */
export function LogoArt() {
  const ref = useRef<HTMLDivElement>(null);
  // без наведения (сенсорные экраны) «наведение» имитируем: состояние is-on включается и выключается по кругу
  useEffect(() => {
    const art = ref.current?.querySelector("svg");
    if (!art || !matchMedia("(hover: none)").matches || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let on = false;
    const toggle = () => art.classList.toggle("is-on", (on = !on));
    const first = setTimeout(toggle, 1200);
    const id = setInterval(toggle, 3800);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, []);
  return <div ref={ref} className="logo-art" aria-hidden dangerouslySetInnerHTML={{ __html: artSvg }} />;
}
