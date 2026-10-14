
import { Icon } from "../icons";
import { Md } from "../md";
import { useCase } from "./index";

// ---------- Закон ----------


export function LawTab() {
  const caseFile = useCase();
  const { basis = [], notes = [] } = caseFile.lawReference ?? {};
  if (!basis.length && !notes.length) return <p className="empty">Автор дела не добавил правовую базу.</p>;
  const link = (url?: string) =>
    url && (
      <a href={url} target="_blank" rel="noreferrer noopener" className="law-link" title="Открыть текст" onClick={(e) => e.stopPropagation()}>
        <Icon name="link" size={14} />
      </a>
    );
  return (
    <div className="law2">
      {basis.length > 0 && (
        <section>
          <h3>Правовая база</h3>
          <div className="rights-grid">
            {basis.map((x, i) => (
              <article key={i} className="right-card">
                {x.article && <span className="right-card__article">{x.article}</span>}
                <strong>
                  {x.title} {link(x.url)}
                </strong>
                {x.text && <p>{x.text}</p>}
              </article>
            ))}
          </div>
        </section>
      )}
      {notes.length > 0 && (
        <section>
          <h3>Пояснения</h3>
          <ol className="ladder list-reset">
            {notes.map((x, i) => (
              <li key={i}>
                <span className="ladder__num">{i + 1}</span>
                <div>
                  <strong>
                    {x.title} {link(x.url)}
                  </strong>
                  {x.subtitle && <span className="ladder__note">{x.subtitle}</span>}
                  {x.text && <Md text={x.text} />}
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}
