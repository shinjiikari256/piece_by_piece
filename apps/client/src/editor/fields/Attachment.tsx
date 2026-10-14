// ---------- медиа ----------

/** Адрес приложения: ссылка на файл или страницу. Ранее встроенные data URL читаются как раньше (показываются, очищаются крестиком). */
export function AttachmentSource({ value, onChange }: { value: string; onChange: (v: unknown) => void }) {
  const embedded = value.startsWith("data:");
  const isImage = /^data:image\//.test(value) || /\.(png|jpe?g|gif|webp|svg)(\?|$)/i.test(value);
  return (
    <div className="attach-src">
      {isImage && value && <img className="attach-src__preview" src={value} alt="" />}
      <div className="attach-src__row">
        <input
          value={embedded ? "(встроенный файл)" : value}
          readOnly={embedded}
          placeholder="https://…"
          onChange={(e) => onChange(e.target.value)}
        />
        {value && (
          <button className="btn btn--sm btn--danger" onClick={() => onChange("")}>
            ✕
          </button>
        )}
      </div>
    </div>
  );
}
