/** Кнопки элемента списка в форме: выше, ниже, удалить. У краёв списка «выше»/«ниже» недоступны. */
export function ItemTools({ index, count, onMove, onRemove }: { index: number; count: number; onMove: (dir: -1 | 1) => void; onRemove: () => void }) {
  return (
    <>
      <button className="btn btn--sm" disabled={index === 0} onClick={() => onMove(-1)} title="Выше">
        ↑
      </button>
      <button className="btn btn--sm" disabled={index === count - 1} onClick={() => onMove(1)} title="Ниже">
        ↓
      </button>
      <button className="btn btn--sm btn--danger" onClick={onRemove} title="Удалить">
        ✕
      </button>
    </>
  );
}
