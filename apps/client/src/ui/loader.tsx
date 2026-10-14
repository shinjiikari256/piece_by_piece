import "./loader.css";
/** Индикатор загрузки по центру своей области: вращающееся кольцо и подпись. */
export function Loader({ label = "Загрузка…" }: { label?: string }) {
  return (
    <div className="loader" role="status" aria-live="polite">
      <span className="loader__ring" aria-hidden />
      <span className="muted">{label}</span>
    </div>
  );
}
