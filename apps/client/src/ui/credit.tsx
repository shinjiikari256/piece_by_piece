import { LICENSE_LABEL, type CaseFile } from "../../../../shared/case";

type Meta = CaseFile["meta"];

/** Авторство дела: «Автор: … · лицензия · почта». Пусто, если автор не заполнил блок. */
export function creditText(meta: Meta): string {
  if (!meta) return "";
  const license = meta.license === "unspecified" ? "" : LICENSE_LABEL[meta.license];
  return [meta.authorName && `Автор: ${meta.authorName}`, license].filter(Boolean).join(" · ");
}

/** С ссылками (почта, источник) — внутри кнопок не использовать, там только текст. */
export function CaseCredit({ meta, links = true }: { meta: Meta; links?: boolean }) {
  if (!meta) return null;
  const text = creditText(meta);
  const email = meta.authorEmail.trim();
  const source = meta.sourceUrl.trim();
  if (!text && !email && !source && !meta.licenseNote) return null;
  return (
    <p className="muted case-credit">
      {text}
      {email && (
        <>
          {text && " · "}
          {links ? <a href={`mailto:${email}`}>{email}</a> : email}
        </>
      )}
      {links && source && (
        <>
          {" · "}
          <a href={source} target="_blank" rel="noreferrer noopener">
            источник
          </a>
        </>
      )}
      {links && meta.licenseNote && <span className="case-credit__note"> ({meta.licenseNote})</span>}
    </p>
  );
}
