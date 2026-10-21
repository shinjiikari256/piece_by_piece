import { Link, setSearchParams, siteUrl, useSearchParam } from "../router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { renderSVG } from "uqr";
import {
  type AdminGroup,
  type AdminUser,
  type JoinLink,
} from "../../../../../shared/api";
import { api } from "../../state/api";
import { ask } from "../dialog";
import { Field } from "../account";
import { date, fail } from "./index";

// ---------- Группы ----------

export function GroupsSection({ groups, isAdmin, reload }: { groups: AdminGroup[]; isAdmin: boolean; reload: () => void }) {
  const [name, setName] = useState("");
  // открытая группа — в адресе (`?group=<id>`): на неё ведут ссылки из списка пользователей
  const param = useSearchParam("group");
  const open = param && groups.some((g) => String(g.id) === param) ? Number(param) : null;
  const setOpen = (id: number | null) => setSearchParams({ group: id === null ? null : String(id) });
  const [staff, setStaff] = useState<AdminUser[]>([]);
  useEffect(() => {
    if (!isAdmin) return;
    Promise.all([api<AdminUser[]>("GET", "/admin/users?role=teacher"), api<AdminUser[]>("GET", "/admin/users?role=admin")]).then(([t, a]) => setStaff([...t, ...a]), fail);
  }, [isAdmin]);

  const create = async () => {
    if (!name.trim()) return;
    try {
      await api("POST", "/admin/groups", { name: name.trim() });
      setName("");
      reload();
    } catch (e) {
      fail(e);
    }
  };

  return (
    <section>
      <header className="page__head">
        <h1>{isAdmin ? "Группы" : "Мои группы"}</h1>
      </header>
      {isAdmin && (
        <form
          className="toolbar"
          onSubmit={(e) => {
            e.preventDefault();
            void create();
          }}
        >
          <input className="input toolbar__search" value={name} onChange={(e) => setName(e.target.value)} placeholder="Название новой группы, например ЮР-201" />
          <button className="btn btn--primary" type="submit" disabled={!name.trim()}>
            Добавить группу
          </button>
        </form>
      )}
      {groups.length === 0 && <p className="muted">{isAdmin ? "Групп пока нет." : "Вас пока не назначили ни в одну группу — обратитесь к администратору."}</p>}
      <ul className="groups">
        {groups.map((g) => (
          <li key={g.id} className="card group">
            <button className="group__head" onClick={() => setOpen(open === g.id ? null : g.id)} aria-expanded={open === g.id}>
              <b>{g.name}</b>
              <span className="muted">студентов: {g.students}</span>
              {g.pending > 0 && <span className="status" data-tone="warn">ждут подтверждения: {g.pending}</span>}
              <span className="group__chev">{open === g.id ? "▲" : "▼"}</span>
            </button>
            {open === g.id && <GroupDetail group={g} isAdmin={isAdmin} staff={staff} reload={reload} />}
          </li>
        ))}
      </ul>
    </section>
  );
}

function GroupDetail({ group, isAdmin, staff, reload }: { group: AdminGroup; isAdmin: boolean; staff: AdminUser[]; reload: () => void }) {
  const [links, setLinks] = useState<JoinLink[]>([]);
  const [expires, setExpires] = useState("");
  const [rename, setRename] = useState<string | null>(null);
  const loadLinks = useCallback(() => api<JoinLink[]>("GET", `/admin/groups/${group.id}/links`).then(setLinks, fail), [group.id]);
  useEffect(() => void loadLinks(), [loadLinks]);

  const save = async (patch: { name?: string; teacherIds?: number[] }) => {
    try {
      await api("PATCH", `/admin/groups/${group.id}`, { name: patch.name ?? group.name, teacherIds: patch.teacherIds ?? group.teacherIds });
      reload();
    } catch (e) {
      fail(e);
    }
  };
  const act = async (call: () => Promise<unknown>) => {
    try {
      await call();
      await loadLinks();
      reload();
    } catch (e) {
      fail(e);
    }
  };
  const live = links.filter((l) => !l.revokedAt && (!l.expiresAt || new Date(l.expiresAt) > new Date()));
  const dead = links.filter((l) => !live.includes(l));

  return (
    <div className="group__body">
      {isAdmin && (
        <section className="group__section">
          <h3>Преподаватели группы</h3>
          <p className="muted small">Видят студентов и результаты группы, подтверждают и правят студентов, делают ссылки регистрации, мероприятия и открывают группе дела.</p>
          <div className="chips-row">
            {staff.length === 0 && <span className="muted small">Назначьте роль «преподаватель» в карточке пользователя.</span>}
            {staff.map((t) => {
              const on = group.teacherIds.includes(t.id);
              return (
                <button
                  key={t.id}
                  className="toggle-chip" aria-pressed={on}
                  onClick={() => void save({ teacherIds: on ? group.teacherIds.filter((id) => id !== t.id) : [...group.teacherIds, t.id] })}
                >
                  {on ? "✓ " : ""}
                  {t.fullName}
                </button>
              );
            })}
          </div>
        </section>
      )}

      <section className="group__section">
        <h3>Студенты</h3>
        <Link className="btn btn--sm" to={`/admin/users?group=${group.id}`}>
          Показать студентов группы ({group.students})
        </Link>
      </section>

      <section className="group__section">
        <h3>Ссылки для регистрации</h3>
        <p className="muted small">
          Кто зарегистрируется по ссылке или QR-коду, сразу попадёт в группу «{group.name}» со статусом «не подтверждён».
        </p>
        <form
          className="link-new"
          onSubmit={(e) => {
            e.preventDefault();
            void act(() => api("POST", `/admin/groups/${group.id}/links`, expires ? { expiresAt: new Date(`${expires}T23:59:59`).toISOString() } : {})).then(() => setExpires(""));
          }}
        >
          <Field label="Действует до" hint="Без даты — без ограничения, пока не отозвана">
            <input className="input" type="date" value={expires} onChange={(e) => setExpires(e.target.value)} />
          </Field>
          <button className="btn btn--primary" type="submit">
            Создать ссылку
          </button>
        </form>
        {live.length === 0 && <p className="muted small">Действующих ссылок нет.</p>}
        <ul className="links">
          {live.map((l) => (
            <LinkCard key={l.id} link={l} group={group} act={act} />
          ))}
        </ul>
        {dead.length > 0 && (
          <details className="links-dead">
            <summary>Отозванные и истёкшие ({dead.length})</summary>
            <ul className="links">
              {dead.map((l) => (
                <LinkCard key={l.id} link={l} group={group} act={act} />
              ))}
            </ul>
          </details>
        )}
      </section>

      {isAdmin && (
        <div className="group__footer">
          {rename === null ? (
            <button className="btn btn--sm" onClick={() => setRename(group.name)}>
              Переименовать
            </button>
          ) : (
            <form
              className="toolbar"
              onSubmit={async (e) => {
                e.preventDefault();
                if (rename.trim() && rename.trim() !== group.name) await save({ name: rename.trim() });
                setRename(null);
              }}
            >
              <input className="input" value={rename} onChange={(e) => setRename(e.target.value)} autoFocus />
              <button className="btn btn--primary btn--sm" type="submit">
                Сохранить
              </button>
              <button className="linkbtn" type="button" onClick={() => setRename(null)}>
                Отмена
              </button>
            </form>
          )}
          <button
            className="linkbtn linkbtn--danger"
            onClick={() =>
              void ask({
                title: `Удалить группу «${group.name}»?`,
                text: "Студенты останутся, но окажутся «без группы». Ссылки группы перестанут работать.",
                confirmLabel: "Удалить",
                danger: true,
              }).then((ok) => void (ok && act(() => api("DELETE", `/admin/groups/${group.id}`))))
            }
          >
            Удалить группу
          </button>
        </div>
      )}
    </div>
  );
}

const linkUrl = (l: JoinLink) => `${siteUrl()}?join=${l.token}`;

/** Ссылка регистрации: QR всегда на виду, адрес с копированием, срок и счётчики, действия. */
function LinkCard({ link: l, group, act }: { link: JoinLink; group: AdminGroup; act: (call: () => Promise<unknown>) => Promise<void> }) {
  const url = linkUrl(l);
  const active = !l.revokedAt && (!l.expiresAt || new Date(l.expiresAt) > new Date());
  const [copied, setCopied] = useState(false);
  const copy = () => {
    void navigator.clipboard?.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <li className={`link-card ${active ? "" : "is-dead"}`}>
      <QrCode text={url} />
      <div className="link-card__main">
        <div className="link-card__url">
          <input className="input mono" value={url} readOnly onFocus={(e) => e.target.select()} />
          {active && (
            <button className="btn btn--sm" onClick={copy}>
              {copied ? "Скопировано" : "Скопировать"}
            </button>
          )}
        </div>
        <div className="link-card__meta">
          <span>{l.revokedAt ? `отозвана ${date(l.revokedAt)}` : l.expiresAt ? `действует до ${date(l.expiresAt)}` : "бессрочная"}</span>
          <span>зарегистрировались: {l.registered}</span>
          {l.pending > 0 && <span className="status" data-tone="warn">ждут подтверждения: {l.pending}</span>}
        </div>
        <div className="link-card__actions row row--wrap">
          {l.pending > 0 && (
            <button className="btn btn--primary btn--sm" onClick={() => void act(() => api("POST", `/admin/links/${l.id}/confirm`))}>
              Подтвердить всех ({l.pending})
            </button>
          )}
          {active && (
            <button className="btn btn--sm" onClick={() => void downloadQr(url, `qr-${group.name}`)}>
              Скачать QR
            </button>
          )}
          {!l.revokedAt && (
            <button
              className="linkbtn linkbtn--danger"
              onClick={() =>
                void ask({ title: "Отозвать ссылку?", text: "По ней и её QR-коду больше нельзя будет зарегистрироваться.", confirmLabel: "Отозвать", danger: true }).then(
                  (ok) => void (ok && act(() => api("POST", `/admin/links/${l.id}/revoke`))),
                )
              }
            >
              Отозвать
            </button>
          )}
        </div>
      </div>
    </li>
  );
}

function QrCode({ text }: { text: string }) {
  const svg = useMemo(() => renderSVG(text), [text]);
  return <div className="qr" dangerouslySetInnerHTML={{ __html: svg }} />;
}

/** QR-код картинкой PNG (для печати и слайдов). */
/** QR всегда чёрный на белом: цвета темы не используем, иначе код перестанет читаться сканером. */
const QR_BACKGROUND = "#ffffff";

async function downloadQr(text: string, name: string) {
  const svg = renderSVG(text, { border: 2 });
  const img = new Image();
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  await img.decode();
  const size = 1024;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = QR_BACKGROUND;
  ctx.fillRect(0, 0, size, size);
  ctx.drawImage(img, 0, 0, size, size);
  const a = document.createElement("a");
  a.href = canvas.toDataURL("image/png");
  a.download = `${name.replace(/[^\p{L}\p{N}_-]+/gu, "-")}.png`;
  a.click();
}
