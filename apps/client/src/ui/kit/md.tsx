import { Fragment, type ReactNode } from "react";

/**
 * Небольшой безопасный Markdown для текстов дел: **жирный**, *курсив*,
 * [ссылка](https://…), списки «- …», абзацы через пустую строку.
 * HTML не интерпретируется — всё строится из React-элементов.
 */

function inline(text: string, key: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /\*\*([^*]+)\*\*|\*([^*]+)\*|\[([^\]]+)\]\(([^)\s]+)\)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const k = `${key}-${i++}`;
    if (m[1]) out.push(<strong key={k}>{m[1]}</strong>);
    else if (m[2]) out.push(<em key={k}>{m[2]}</em>);
    else if (m[3]) {
      const href = m[4];
      const safe = /^(https?:|mailto:)/i.test(href) ? href : undefined;
      out.push(
        safe ? (
          <a key={k} href={safe} target="_blank" rel="noreferrer noopener">
            {m[3]}
          </a>
        ) : (
          m[3]
        ),
      );
    }
    last = re.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** Блочный рендер: абзацы и списки. */
export function Md({ text, className }: { text: string; className?: string }) {
  const blocks = text.split(/\n{2,}/);
  return (
    <div className={`md ${className ?? ""}`}>
      {blocks.map((block, bi) => {
        const lines = block.split("\n");
        if (lines.every((l) => /^\s*[-•]\s+/.test(l))) {
          return (
            <ul key={bi}>
              {lines.map((l, li) => (
                <li key={li}>{inline(l.replace(/^\s*[-•]\s+/, ""), `${bi}-${li}`)}</li>
              ))}
            </ul>
          );
        }
        return (
          <p key={bi}>
            {lines.map((l, li) => (
              <Fragment key={li}>
                {li > 0 && <br />}
                {inline(l, `${bi}-${li}`)}
              </Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}

/** Строчный вариант — без абзацев (для заголовков, подписей, реплик). */
export function MdInline({ text }: { text: string }) {
  return <>{inline(text, "i")}</>;
}
