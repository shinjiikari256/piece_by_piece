/**
 * Единый набор иконок (контурные, 24×24, цвет — currentColor).
 * Вместо смеси эмодзи и текстовых значков.
 */

const PATHS = {
  home: "M3 11 12 4l9 7M5 10v10h5v-6h4v6h5V10",
  folder: "M3 6h6l2 2h10v11H3z",
  folders: "M3 9h5l2 2h9v9H3zM6 9V6h5l2 2h9v9h-3",
  link: "M10 14a4 4 0 0 0 6 0l3-3a4 4 0 0 0-6-6l-1 1M14 10a4 4 0 0 0-6 0l-3 3a4 4 0 0 0 6 6l1-1",
  bulb: "M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.7.7 1 1.5 1 2.5h6c0-1 .3-1.8 1-2.5A6 6 0 0 0 12 3z",
  scale: "M12 3v18M7 21h10M5 7h14M5 7l-3 7h6zM19 7l-3 7h6zM12 3l-2 2h4z",
  hand: "M8 13V5a1.5 1.5 0 0 1 3 0v6M11 11V4a1.5 1.5 0 0 1 3 0v7M14 11V6a1.5 1.5 0 0 1 3 0v8a7 7 0 0 1-7 7 6 6 0 0 1-5-3l-2-4a1.5 1.5 0 0 1 2.6-1.4L8 15",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2",
  evidence: "M7 3h7l5 5v13H7zM14 3v5h5M10 12h6M10 16h6",
  testimony: "M4 5h16v11H9l-5 4zM8 9h8M8 12h5",
  circle: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z",
  fact: "M9 12l2 2 4-4M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z",
  notes: "M5 3h11l3 3v15H5zM9 8h6M9 12h6M9 16h4",
  pen: "M4 20l4-1 11-11-3-3L5 16zM14 6l3 3",
  close: "M6 6l12 12M18 6 6 18",
  sparkle: "M10 4l1.8 5.2L17 11l-5.2 1.8L10 18l-1.8-5.2L3 11l5.2-1.8zM19 3l.7 2.3L22 6l-2.3.7L19 9l-.7-2.3L16 6l2.3-.7zM18 14l.7 2.3L21 17l-2.3.7L18 20l-.7-2.3L15 17l2.3-.7z",
  check: "M5 12l5 5L19 7",
  star: "M12 3l2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z",
  dim: "M3 3l18 18M10.6 6.1A9.8 9.8 0 0 1 12 6c5 0 9 6 9 6a17 17 0 0 1-2.4 3.1M6.6 6.6C4.3 8.1 3 12 3 12s4 6 9 6a8.8 8.8 0 0 0 3.4-.7",
  filter: "M4 5h16l-6 8v6l-4-2v-4z",
  back: "M15 5l-7 7 7 7",
  search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM21 21l-5-5",
  lock: "M6 11h12v10H6zM8 11V8a4 4 0 0 1 8 0v3",
  undo: "M9 14 4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3",
  redo: "M15 14l5-5-5-5M20 9H9a5 5 0 0 0 0 10h3",
  play: "M7 4l13 8-13 8z",
  plus: "M12 5v14M5 12h14",
  copy: "M9 9h11v11H9zM5 15V4h11",
  alert: "M12 4 2 20h20zM12 10v4M12 17v.5",
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0",
  law: "M12 3v18M4 8l8-5 8 5M5 21h14M7 8v9M17 8v9",
  map: "M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3z",
  save: "M5 3h11l3 3v15H5zM8 3v6h7V3M8 21v-7h8v7",
  eye: "M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
  palette: "M12 3a9 9 0 1 0 0 18c1.1 0 2-.8 2-1.8 0-.5-.2-.9-.5-1.2-.3-.3-.5-.7-.5-1.2 0-1 .8-1.8 1.8-1.8H17a4 4 0 0 0 4-4c0-4.4-4-8-9-8zM7.5 11.5h.01M10 7.5h.01M14.5 7.5h.01",
  brush: "M4 20l1-4L16 5a2 2 0 013 0l0 0a2 2 0 010 3L8 19l-4 1zM14 7l3 3",
  eraser: "M5 15l9-9a2 2 0 013 0l3 3a2 2 0 010 3l-7 7H9l-4-4zM9 19h11M8 12l5 5",
  "dock-left": "M4 5h16v14H4zM9 5v14M16 5v14",
  "dock-bottom": "M4 5h16v14H4zM16 5v14M4 14h12",
  help: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.7M12 17v.5",
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 18, title }: { name: IconName; size?: number; title?: string }) {
  return (
    <svg
      className="icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
    >
      {title && <title>{title}</title>}
      <path d={PATHS[name]} />
    </svg>
  );
}
